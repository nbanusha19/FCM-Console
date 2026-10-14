from __future__ import annotations

import hashlib
import html
import hmac
import json
import logging
import secrets
import smtplib
import ssl
import io
import re
import urllib.parse
import uuid
from datetime import date, datetime, time, timezone
from email.message import EmailMessage
from email.utils import formatdate
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import settings
from database import cursor, rows_as_dicts
from security import current_user

logger = logging.getLogger("vms-api")
router = APIRouter()

EXECUTION = {"EMPLOYEE", "BRANCH_MANAGER"}
OPEN = ("DRAFT", "PENDING_HSE", "SENT_BACK", "APPROVED", "ACTIVE", "CLOSURE_REQUESTED", "EXTENSION_REQUESTED")
TYPES = {"HOT_WORK", "HEIGHT", "ELECTRICAL", "CONFINED", "EXCAVATION", "COLD"}
PREFIX = {"HOT_WORK": "HHWP", "HEIGHT": "WHP", "ELECTRICAL": "EWP", "CONFINED": "CSWP", "EXCAVATION": "EWP", "COLD": "CWP"}
CHECKLISTS = {
    "HOT_WORK": [
        "Area cleared of flammable material",
        "Fire extinguisher available at the spot",
        "Welding set and cables in sound condition",
        "Gas cutting torch has flash-back arrester and NRV",
        "Work area barricaded, caution boards displayed",
        "Combustible floors protected",
        "Sprinkler / fire detection isolated only if authorised",
        "Hot-work screens / blankets in place",
        "Gas cylinders secured and upright",
        "Drains and pits covered",
        "Spark containment arranged",
        "Housekeeping completed before start",
        "Emergency exit path kept clear",
        "FES / fire department informed",
    ],
    "HEIGHT": ["Harness inspected", "Barricade in place"],
    "ELECTRICAL": ["Isolation done (LOTO)", "Tester verified"],
    "CONFINED": ["Gas test done", "Standby person assigned"],
    "EXCAVATION": ["Underground services checked", "Edge protection"],
    "COLD": ["Area barricaded", "Tools inspected"],
}
NIGHT_WORK_ITEMS = [
    {"key": "SECURITY_NOTIFIED", "name": "Security notified and approval obtained"},
    {"key": "SUPERVISOR_PRESENT", "name": "Designated supervisor present on site"},
    {"key": "BUDDY_SYSTEM", "name": "Buddy system available"},
    {"key": "FIRE_WATCHER", "name": "Fire watcher assigned (where applicable)", "allowNa": True},
    {"key": "MEDICAL_SUPPORT", "name": "Medical emergency support ready"},
]


class PermitWrite(BaseModel):
    permit: dict[str, Any]


class ContractorOtpVerify(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")
    contractorEmail: str | None = Field(default=None, max_length=320)


class ContractorOtpSend(BaseModel):
    contractorEmail: str = Field(min_length=3, max_length=320)


class ReviewWrite(BaseModel):
    hseValidation: dict[str, dict[str, Any]] = Field(default_factory=dict)
    note: str = ""


class RejectWrite(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)


class GateWrite(BaseModel):
    grant: bool
    qrToken: str = ""
    consent: bool = False
    contractorIdCard: str = ""
    reason: str = ""
    note: str = ""


class GateOtpSend(BaseModel):
    qrToken: str = Field(min_length=1)


class GateOtpVerify(BaseModel):
    qrToken: str = Field(min_length=1)
    code: str = Field(pattern=r"^\d{6}$")


class LifecycleWrite(BaseModel):
    action: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    hseValidation: dict[str, dict[str, Any]] = Field(default_factory=dict)
    note: str = ""


class NotificationReadWrite(BaseModel):
    ids: list[str] | None = Field(default=None, max_length=100)


def _role(cur: Any, claims: dict[str, Any]) -> str:
    cur.execute("SELECT [Role], [IsActive] FROM [dbo].[AppUsers] WHERE [Id]=?", claims["sub"])
    row = cur.fetchone()
    if not row or not row[1]:
        raise HTTPException(status_code=401, detail="The account is inactive or no longer exists.")
    return str(row[0] or "").upper()


def _name(cur: Any, claims: dict[str, Any]) -> str:
    cur.execute("SELECT [Name] FROM [dbo].[AppUsers] WHERE [Id]=?", claims["sub"])
    row = cur.fetchone()
    return str(row[0] or "") if row else ""


def _branch_id(cur: Any, claims: dict[str, Any]) -> str | None:
    cur.execute("SELECT [BranchId] FROM [dbo].[AppUsers] WHERE [Id]=?", claims["sub"])
    row = cur.fetchone()
    return str(row[0]) if row and row[0] else None


def _ensure_requester_branch(cur: Any, role: str, claims: dict[str, Any], permit: dict[str, Any]) -> None:
    if role not in EXECUTION:
        return
    branch_id = _branch_id(cur, claims)
    if not branch_id or str(permit.get("branchId") or "") != branch_id:
        raise HTTPException(
            status_code=403,
            detail="Employees and Branch Managers can raise permits only for their assigned branch.",
        )


def _branch_key(value: Any) -> str:
    return str(value or "").strip().casefold()


def _allow(role: str, roles: set[str]) -> None:
    if role not in roles:
        raise HTTPException(status_code=403, detail="You do not have permission to perform this work permit action.")


def _get(cur: Any, permit_id: str) -> dict[str, Any]:
    cur.execute("SELECT * FROM [dbo].[WorkPermits] WHERE [Id]=?", permit_id)
    rows = rows_as_dicts(cur)
    if not rows:
        raise HTTPException(status_code=404, detail="Work permit not found.")
    return rows[0]


def _form(row: dict[str, Any]) -> dict[str, Any]:
    try:
        data = json.loads(row.get("FormData") or "{}")
    except (json.JSONDecodeError, TypeError) as exc:
        logger.exception("Invalid EWP FormData for %s", row.get("Id"))
        raise HTTPException(status_code=500, detail="The saved permit form data is invalid.") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=500, detail="The saved permit form data is invalid.")
    for name, expected_type in (("checklist", list), ("gates", dict)):
        if data.get(name) is None:
            data[name] = expected_type()
        elif not isinstance(data[name], expected_type):
            logger.error("Invalid EWP %s in FormData for %s", name, row.get("Id"))
            raise HTTPException(status_code=500, detail="The saved permit form data is invalid.")
    data.update(
        id=str(row["Id"]),
        permitNo=row.get("PermitNo"),
        status=str(row.get("Status") or "DRAFT"),
        permitType=str(row.get("PermitType") or data.get("permitType") or "COLD"),
        raisedById=str(row.get("RaisedByUserId") or ""),
        raisedByName=row.get("RaisedByName") or "",
        approvedAt=row.get("ApprovedAt").isoformat() if row.get("ApprovedAt") else None,
        approvedByName=row.get("ApprovedByName"),
        rejectedByName=row.get("RejectedByName"),
        createdAt=row.get("CreatedAt").isoformat() if row.get("CreatedAt") else None,
        updatedAt=row.get("UpdatedAt").isoformat() if row.get("UpdatedAt") else None,
    )
    data["qrToken"] = _qr_token(str(row["Id"])) if data["status"] in {"APPROVED", "ACTIVE"} else None
    data["qrValue"] = f"FCM-EWP:{row['Id']}:{data['qrToken']}" if data["qrToken"] else None
    return data


def _qr_token(permit_id: str) -> str | None:
    if not settings.jwt_secret:
        return None
    return hmac.new(settings.jwt_secret.encode(), f"ewp-gate:{permit_id}".encode(), hashlib.sha256).hexdigest()


def _contractor_email_for_approval(permit: dict[str, Any]) -> str:
    return str(permit.get("contractorEmail") or "").strip()


def _validate_gate_qr(permit_id: str, qr_token: str) -> None:
    expected = _qr_token(permit_id)
    if not qr_token or not expected or not hmac.compare_digest(qr_token, expected):
        raise HTTPException(status_code=403, detail="Scan the valid approved permit QR code.")


def _critical_contacts() -> list[tuple[str, str, str]]:
    contacts = []
    for entry in settings.ewp_critical_contacts.split(";"):
        parts = [part.strip() for part in entry.split("|")]
        if len(parts) == 3 and any(parts):
            contacts.append((parts[0], parts[1], parts[2]))
    return contacts


def _worker_count_label(permit: dict[str, Any]) -> str:
    if permit.get("workmenCount") is None:
        return "Not recorded"
    count = _workmen_count(permit)
    return f"{count} worker" if count == 1 else f"{count} workers"


def _approval_pdf(permit: dict[str, Any], qr_png: bytes) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    output = io.BytesIO()
    document = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"E-Work Permit {permit.get('permitNo') or permit.get('id') or ''} precaution pack",
        author="FCM Console",
    )
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="PermitTitle",
            parent=styles["Title"],
            alignment=TA_CENTER,
            textColor=colors.HexColor("#17324d"),
            fontSize=17,
            leading=21,
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SectionHeading",
            parent=styles["Heading2"],
            textColor=colors.HexColor("#17324d"),
            fontSize=11,
            leading=14,
            spaceBefore=10,
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SmallBody",
            parent=styles["BodyText"],
            fontSize=8.5,
            leading=12,
            spaceAfter=3,
        )
    )

    def paragraph(value: Any, style: str = "SmallBody") -> Paragraph:
        return Paragraph(str(value or "—").replace("\n", "<br/>"), styles[style])

    permit_no = str(permit.get("permitNo") or permit.get("id") or "")
    permit_type = str(permit.get("permitType") or "").replace("_", " ").title()
    worker_count = _worker_count_label(permit)
    location = " / ".join(
        str(permit.get(key) or "").strip()
        for key in ("building", "floor", "wing", "area")
        if str(permit.get(key) or "").strip()
    ) or "—"
    time_window = f"{permit.get('timeFrom') or '—'}–{permit.get('timeTo') or '—'}"
    qr_image = Image(io.BytesIO(qr_png), width=37 * mm, height=37 * mm)
    qr_block = [
        qr_image,
        paragraph(
            f"<b>{html.escape(worker_count, quote=True)} expected</b>",
        ),
    ]

    details = [
        paragraph(
            f"<b>Permit:</b> {html.escape(permit_no)} | {html.escape(permit_type)}"
        ),
        paragraph(
            f"<b>Valid:</b> {html.escape(str(permit.get('workDate') or '—'))} "
            f"{html.escape(time_window)}"
        ),
        paragraph(f"<b>Location:</b> {html.escape(location)}"),
        paragraph(f"<b>Contractor:</b> {html.escape(str(permit.get('contractor') or '—'))}"),
        paragraph(f"<b>Supervisor:</b> {html.escape(str(permit.get('supervisorName') or '—'))}"),
        paragraph(f"<b>Workers expected:</b> {html.escape(worker_count, quote=True)}"),
        paragraph(f"<b>Work:</b> {html.escape(str(permit.get('workDescription') or '—'))}"),
        Spacer(1, 3 * mm),
        paragraph("<i>Show this QR at Security. It is valid only inside the approved work window.</i>"),
    ]
    header = Table([[details, qr_block]], colWidths=[125 * mm, 42 * mm], hAlign="LEFT")
    header.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f2f7fb")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d6e1ea")),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story: list[Any] = [
        paragraph("E-Work Permit — precaution pack", "PermitTitle"),
        header,
    ]

    contacts = _critical_contacts()
    story.append(paragraph("Critical contacts", "SectionHeading"))
    if contacts:
        for label, phone, email_address in contacts:
            contact = " — ".join(part for part in (phone, email_address) if part)
            story.append(
                paragraph(
                    f"• <b>{html.escape(label, quote=True)}</b>: "
                    f"{html.escape(contact or '—', quote=True)}"
                )
            )
    else:
        story.append(paragraph("Use the emergency contacts posted at the work site."))

    precaution_sections = [
        (
            "Fire alarm and evacuation",
            [
                "On hearing a continuous fire alarm, stop work, isolate energy sources if safe, and leave tools.",
                "Do not use lifts. Use the nearest marked staircase to reach the assembly point.",
                "Keep exits and access routes clear; do not re-enter until Security or the fire team gives the all-clear.",
            ],
        ),
        (
            "Emergency response",
            [
                "Raise the alarm, move injured persons only if they are in immediate danger, and contact the site emergency team.",
                "Use fire-fighting equipment only if trained and it is safe to do so; otherwise evacuate.",
                "For electrical shock, isolate power before approaching the casualty.",
                "Report incidents and near misses to the supervisor and HSE.",
            ],
        ),
    ]
    for title, instructions in precaution_sections:
        story.append(paragraph(title, "SectionHeading"))
        story.extend(paragraph(f"• {instruction}") for instruction in instructions)

    checklist = permit.get("checklist")
    if isinstance(checklist, list) and checklist:
        story.append(paragraph("Permit safety checklist", "SectionHeading"))
        for entry in checklist:
            if isinstance(entry, dict):
                item = html.escape(str(entry.get("item") or "—"), quote=True)
                answer = html.escape(str(entry.get("answer") or "—"), quote=True)
                story.append(paragraph(f"• {item}: <b>{answer}</b>"))

    ppe = permit.get("ppe")
    ppe_items = ppe.get("items") if isinstance(ppe, dict) else None
    if isinstance(ppe_items, list) or (isinstance(ppe, dict) and ppe.get("special")):
        story.append(paragraph("Required protective equipment", "SectionHeading"))
        equipment = [str(item).replace("_", " ").title() for item in ppe_items or []]
        if isinstance(ppe, dict) and ppe.get("special"):
            equipment.append(str(ppe["special"]))
        story.append(paragraph(html.escape(", ".join(equipment) or "—")))

    over_nine_hours = permit.get("overNineHours")
    if isinstance(over_nine_hours, dict) and over_nine_hours.get("justification"):
        story.append(paragraph("Extended work window", "SectionHeading"))
        story.append(
            paragraph(
                f"<b>Justification:</b> "
                f"{html.escape(str(over_nine_hours['justification']), quote=True)}"
            )
        )

    night_work = permit.get("nightWork")
    night_answers = night_work.get("answers") if isinstance(night_work, dict) else None
    if isinstance(night_answers, dict) and night_answers:
        story.append(paragraph("Night work safety checks", "SectionHeading"))
        names = {item["key"]: item["name"] for item in NIGHT_WORK_ITEMS}
        for key, answer in night_answers.items():
            label = names.get(str(key), str(key).replace("_", " ").title())
            story.append(
                paragraph(
                    f"• {html.escape(label, quote=True)}: "
                    f"<b>{html.escape(str(answer), quote=True)}</b>"
                )
            )

    document.build(story)
    return output.getvalue()


def _send_approval_email(permit: dict[str, Any], recipient: str) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("SMTP email is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL on the API host.")
    if settings.smtp_use_tls and settings.smtp_use_ssl:
        raise RuntimeError("Configure either SMTP_USE_TLS or SMTP_USE_SSL, not both.")
    if bool(settings.smtp_username) != bool(settings.smtp_password):
        raise RuntimeError("Set both SMTP_USERNAME and SMTP_PASSWORD, or leave both empty.")
    qr_value = permit.get("qrValue")
    if not qr_value:
        raise RuntimeError("The approved permit QR could not be generated.")
    import qrcode

    image = io.BytesIO()
    qrcode.make(qr_value).save(image, format="PNG")
    qr_png = image.getvalue()
    pdf_bytes = _approval_pdf(permit, qr_png)
    permit_no = str(permit.get("permitNo") or permit.get("id") or "")
    work = str(permit.get("workDescription") or "")
    worker_count = _worker_count_label(permit)
    location = " · ".join(str(permit.get(key) or "") for key in ("building", "floor", "wing", "area"))
    work_date = str(permit.get("workDate") or "")
    time_window = f"{permit.get('timeFrom') or ''}–{permit.get('timeTo') or ''}"
    message = EmailMessage()
    message["Subject"] = f"E-Work Permit approved — {permit_no}"
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message.set_content(
        f"Your E-Work Permit {permit_no} has been approved.\n\n"
        f"Work: {work}\nLocation: {location}\nDate: {work_date}\n"
        f"Approved window: {time_window}\nExpected workers: {worker_count}\n\n"
        "Present the attached QR code to Security for gate verification. Entry remains subject to the approved date and time window."
    )
    safe = lambda value: html.escape(value, quote=True)
    message.add_alternative(
        "<p>Your E-Work Permit has been approved.</p>"
        f"<p><strong>Permit:</strong> {safe(permit_no)}<br>"
        f"<strong>Work:</strong> {safe(work)}<br>"
        f"<strong>Location:</strong> {safe(location)}<br>"
        f"<strong>Date:</strong> {safe(work_date)}<br>"
        f"<strong>Approved window:</strong> {safe(time_window)}<br>"
        f"<strong>Workers expected:</strong> {safe(worker_count)}</p>"
        "<p>Present this QR code to Security for gate verification. Entry is limited to the approved date and time.</p>"
        '<p><img src="cid:ewp-qr" alt="E-Work Permit QR code" width="220" height="220"></p>',
        subtype="html",
    )
    message.get_payload()[-1].add_related(qr_png, maintype="image", subtype="png", cid="<ewp-qr>")
    safe_filename = re.sub(r"[^A-Za-z0-9._-]+", "_", permit_no).strip("._") or "permit"
    message.add_attachment(
        pdf_bytes,
        maintype="application",
        subtype="pdf",
        filename=f"{safe_filename}_precaution_pack.pdf",
    )
    if settings.smtp_use_ssl:
        smtp = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15, context=ssl.create_default_context())
    else:
        smtp = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
    with smtp:
        if settings.smtp_use_tls:
            smtp.starttls(context=ssl.create_default_context())
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)


def _contractor_otp_hash(permit_id: str, user_id: str, email: str, code: str) -> str:
    if not settings.jwt_secret:
        raise HTTPException(status_code=503, detail="Contractor OTP signing is not configured.")
    payload = f"ewp-contractor-otp:{permit_id}:{user_id}:{email.casefold()}:{code}"
    return hmac.new(settings.jwt_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def _send_contractor_otp_email(
    recipient: str,
    code: str,
    permit: dict[str, Any],
    *,
    purpose: str = "contractor verification",
    verification_url: str | None = None,
) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("Contractor email is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL on the API host.")
    if settings.smtp_use_tls and settings.smtp_use_ssl:
        raise RuntimeError("Configure either SMTP_USE_TLS or SMTP_USE_SSL, not both.")
    if bool(settings.smtp_username) != bool(settings.smtp_password):
        raise RuntimeError("Set both SMTP_USERNAME and SMTP_PASSWORD, or leave both empty.")

    permit_no = str(permit.get("permitNo") or permit.get("id") or "")
    message = EmailMessage()
    message["Subject"] = (
        f"E-Work Permit gate check-in code — {permit_no}"
        if purpose == "gate check-in"
        else f"Contractor verification code for E-Work Permit {permit_no}"
    )
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message["Date"] = formatdate(localtime=False)
    verification_instruction = (
        f"\nOpen this secure link on your phone to verify the code yourself:\n{verification_url}\n"
        if verification_url
        else ""
    )
    message.set_content(
        f"Your E-Work Permit {purpose} code for permit {permit_no} is {code}.\n\n"
        "The code expires in 10 minutes and can be used only once. "
        f"If you did not request this code, you can ignore this email.{verification_instruction}"
    )
    if verification_url:
        message.add_alternative(
            f"<p>Your E-Work Permit {html.escape(purpose)} code for "
            f"{html.escape(permit_no)} is <strong>{html.escape(code)}</strong>.</p>"
            "<p>Open this secure link on your phone to enter the code yourself:</p>"
            f'<p><a href="{html.escape(verification_url, quote=True)}">Verify contractor check-in</a></p>'
            "<p>The code expires in 10 minutes and can be used only once.</p>",
            subtype="html",
        )
    try:
        if settings.smtp_use_ssl:
            smtp = smtplib.SMTP_SSL(
                settings.smtp_host,
                settings.smtp_port,
                timeout=15,
                context=ssl.create_default_context(),
            )
        else:
            smtp = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
        with smtp:
            if settings.smtp_use_tls:
                smtp.starttls(context=ssl.create_default_context())
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        raise RuntimeError("The SMTP server could not accept the contractor verification email.") from exc


def _gate_otp_hash(permit_id: str, email: str, code: str) -> str:
    if not settings.jwt_secret or len(settings.jwt_secret) < 32:
        raise HTTPException(status_code=503, detail="Gate check-in OTP signing is not configured.")
    payload = f"ewp-gate-checkin-otp:{permit_id}:{email.casefold()}:{code}"
    return hmac.new(settings.jwt_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def _gate_checkin_url(permit_id: str, qr_token: str) -> str:
    origin = settings.public_app_url
    parsed = urllib.parse.urlsplit(origin)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        raise RuntimeError("Set PUBLIC_APP_URL to the public client URL before sending gate verification codes.")
    if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError("PUBLIC_APP_URL must use HTTPS outside local development.")
    return (
        f"{origin}/ework-permit-checkin?"
        f"permitId={urllib.parse.quote(permit_id, safe='')}#"
        f"qrToken={urllib.parse.quote(qr_token, safe='')}"
    )


def _contractor_email_destination(email: str) -> str:
    local, _, domain = email.partition("@")
    return f"{local[:1]}***@{domain}"


def _set_verified_contractor_signature(
    cur: Any, row: dict[str, Any], permit: dict[str, Any], claims: dict[str, Any], role: str
) -> None:
    cur.execute(
        "SELECT [RaisedByUserId],[ContractorEmail],[VerifiedAt] "
        "FROM [dbo].[EwpContractorOtpChallenges] WHERE [PermitId]=?",
        row["Id"],
    )
    challenge = cur.fetchone()
    if not challenge or not challenge[2]:
        raise HTTPException(status_code=409, detail="Verify the contractor email using its OTP before submitting.")
    if (
        str(challenge[0]) != str(row.get("RaisedByUserId") or "")
        or (role != "ADMIN" and str(challenge[0]) != str(claims.get("sub") or ""))
        or str(challenge[1] or "").casefold()
        != str(permit.get("contractorEmail") or "").strip().casefold()
    ):
        raise HTTPException(status_code=409, detail="Contractor details changed. Send and verify a new OTP.")

    verified_at = challenge[2]
    signature = {
        "signed": True,
        "method": "OTP",
        "at": verified_at.isoformat() if hasattr(verified_at, "isoformat") else str(verified_at),
        "by": str(permit.get("supervisorName") or "Contractor representative"),
    }
    signatures = permit.setdefault("signatures", {})
    if not isinstance(signatures, dict):
        signatures = {}
        permit["signatures"] = signatures
    signatures["contractor"] = signature


def _events(cur: Any, row: dict[str, Any], permit: dict[str, Any]) -> dict[str, Any]:
    cur.execute(
        "SELECT [Id],[Action],[ActorName],[ActorUserId],[Note],[CreatedAt] FROM [dbo].[ModuleEvents] WHERE [ModuleName]='PERMIT' AND [RecordId]=? ORDER BY [CreatedAt],[Id]",
        row["Id"],
    )
    permit["events"] = [
        {
            "id": str(e["Id"]), "permitId": str(row["Id"]), "action": e.get("Action") or "",
            "actorName": e.get("ActorName") or "", "actorUserId": str(e["ActorUserId"]) if e.get("ActorUserId") else None,
            "detail": e.get("Note") or "", "at": e["CreatedAt"].isoformat() if e.get("CreatedAt") else None,
        }
        for e in rows_as_dicts(cur)
    ]
    return permit


def _payload(cur: Any, row: dict[str, Any]) -> dict[str, Any]:
    return _events(cur, row, _form(row))


def _event(cur: Any, row: dict[str, Any], action: str, note: str, claims: dict[str, Any]) -> None:
    cur.execute(
        "INSERT INTO [dbo].[ModuleEvents] ([Id],[ModuleName],[RecordId],[Action],[Note],[ActorUserId],[ActorName],[CreatedAt]) VALUES (NEWID(),'PERMIT',?,?,?,?,?,SYSUTCDATETIME())",
        row["Id"], action, note, claims["sub"], _name(cur, claims),
    )
    _notify_ewp_event(cur, row, action, note)


def _send_ewp_notification_email(recipient: str, subject: str, body: str) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("SMTP email is not configured for E-Work Permit notifications.")
    if settings.smtp_use_tls and settings.smtp_use_ssl:
        raise RuntimeError("Configure either SMTP_USE_TLS or SMTP_USE_SSL, not both.")
    if bool(settings.smtp_username) != bool(settings.smtp_password):
        raise RuntimeError("Set both SMTP_USERNAME and SMTP_PASSWORD, or leave both empty.")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message.set_content(body)
    if settings.smtp_use_ssl:
        smtp = smtplib.SMTP_SSL(
            settings.smtp_host,
            settings.smtp_port,
            timeout=15,
            context=ssl.create_default_context(),
        )
    else:
        smtp = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
    with smtp:
        if settings.smtp_use_tls:
            smtp.starttls(context=ssl.create_default_context())
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)


def _notify_ewp_event(cur: Any, row: dict[str, Any], action: str, note: str) -> None:
    notifications = {
        "CONTRACTOR_OTP_VERIFIED": ("Contractor email verified", {"requester"}),
        "SUBMITTED": ("Permit submitted for HSE review", {"requester", "reviewers"}),
        "APPROVED": ("Permit approved by HSE", {"requester"}),
        "SENT_BACK": ("Permit sent back for changes", {"requester"}),
        "REJECTED": ("Permit rejected by HSE", {"requester"}),
        "GATE_OTP_VERIFIED": ("Contractor verified gate check-in", {"requester", "security"}),
        "ENTRY_WINDOW_DEVIATION": ("Permit entry was denied", {"requester", "security"}),
        "ENTRY_GRANTED": ("Contractor entry granted", {"requester"}),
        "ENTRY_REJECTED": ("Contractor entry rejected", {"requester"}),
        "CLOSURE_REQUESTED": ("Permit closure submitted for HSE review", {"requester", "reviewers"}),
        "CLOSED_BY_REQUESTER": ("Permit closed by requester", {"reviewers"}),
        "CLOSED": ("Permit closure confirmed", {"requester"}),
        "EXTENSION_REQUESTED": ("Permit extension submitted for HSE review", {"requester", "reviewers"}),
        "EXTENSION_APPROVED": ("Permit extension approved", {"requester"}),
    }
    notification = notifications.get(action)
    if notification is None:
        return

    title, audiences = notification
    recipients: dict[str, dict[str, Any]] = {}
    permit_form = _form(row)
    if "requester" in audiences and row.get("RaisedByUserId"):
        cur.execute(
            "SELECT [Id],[Name],[Email] FROM [dbo].[AppUsers] "
            "WHERE [Id]=? AND [IsActive]=1 AND NULLIF(LTRIM(RTRIM([Email])), '') IS NOT NULL",
            row["RaisedByUserId"],
        )
        for recipient in rows_as_dicts(cur):
            recipients[str(recipient["Id"])] = recipient
    if "reviewers" in audiences:
        cur.execute(
            "SELECT [Id],[Name],[Email] FROM [dbo].[AppUsers] "
            "WHERE [IsActive]=1 AND [Role] IN ('ADMIN','HSE') "
            "AND NULLIF(LTRIM(RTRIM([Email])), '') IS NOT NULL"
        )
        for recipient in rows_as_dicts(cur):
            recipients[str(recipient["Id"])] = recipient
    if "security" in audiences and permit_form.get("branchId"):
        cur.execute(
            "SELECT [Id],[Name],[Email] FROM [dbo].[AppUsers] "
            "WHERE [IsActive]=1 AND [Role]='SECURITY' AND [BranchId]=? "
            "AND NULLIF(LTRIM(RTRIM([Email])), '') IS NOT NULL",
            permit_form["branchId"],
        )
        for recipient in rows_as_dicts(cur):
            recipients[str(recipient["Id"])] = recipient

    permit_no = str(row.get("PermitNo") or row.get("Id") or "")
    message = f"E-Work Permit {permit_no}: {title}.\n\n{note.strip()}"
    permit_url = None
    if settings.public_app_url:
        permit_url = urllib.parse.urljoin(
            settings.public_app_url.rstrip("/") + "/",
            f"ework-permit/{urllib.parse.quote(str(row['Id']), safe='')}",
        )
    else:
        logger.warning("PUBLIC_APP_URL is not configured; EWP notification email will not include a permit link.")
    email_body = message
    if permit_url:
        email_body += f"\n\nOpen permit: {permit_url}"
    for user_id, recipient in recipients.items():
        cur.execute(
            "INSERT INTO [dbo].[EwpNotifications] "
            "([RecipientUserId],[PermitId],[PermitNo],[Action],[Title],[Message]) "
            "VALUES (?,?,?,?,?,?)",
            user_id, str(row["Id"]), permit_no, action, title, message,
        )
        email = str(recipient.get("Email") or "").strip()
        if not email:
            continue
        try:
            _send_ewp_notification_email(
                email,
                f"E-Work Permit {permit_no} — {title}",
                email_body,
            )
        except Exception:
            logger.exception(
                "EWP notification email failed for permit %s and recipient %s",
                row["Id"],
                user_id,
            )


def _authorized(cur: Any, row: dict[str, Any], role: str, claims: dict[str, Any]) -> None:
    if role == "ADMIN" or role == "HSE":
        return
    if role == "SECURITY":
        permit_branch = _branch_key(_form(row).get("branchId"))
        security_branch = _branch_key(_branch_id(cur, claims))
        if (
            row.get("Status") in {"APPROVED", "ACTIVE", "ENTRY_REJECTED"}
            and permit_branch
            and security_branch
            and permit_branch == security_branch
        ):
            return
    elif role in EXECUTION and str(row.get("RaisedByUserId") or "") == str(claims["sub"]):
        return
    raise HTTPException(status_code=403, detail="You cannot access this work permit.")


def _save_form(cur: Any, row: dict[str, Any], permit: dict[str, Any], status: str | None = None) -> None:
    if status:
        permit["status"] = status
    cur.execute(
        "UPDATE [dbo].[WorkPermits] SET [FormData]=?,[Status]=COALESCE(?,[Status]),[UpdatedAt]=SYSUTCDATETIME() WHERE [Id]=?",
        json.dumps(permit, separators=(",", ":"), ensure_ascii=False), status, row["Id"],
    )


def _workmen_count(permit: dict[str, Any]) -> int:
    try:
        count = int(permit.get("workmenCount") or 0)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Enter a valid number of contractor workers.") from exc
    if count < 0:
        raise HTTPException(status_code=400, detail="The number of contractor workers cannot be negative.")
    return count


def _apply_permit_extension(
    permit: dict[str, Any],
    extension: dict[str, Any],
    approved_by: str,
    approved_at: datetime,
) -> tuple[date, time, time, str, bool]:
    try:
        extension_date = date.fromisoformat(
            str(extension.get("workDate") or permit.get("workDate"))
        )
        start = time.fromisoformat(str(extension["timeFrom"]))
        end = time.fromisoformat(str(extension["timeTo"]))
        original_date = date.fromisoformat(str(permit["workDate"]))
        original_start = time.fromisoformat(str(permit["timeFrom"]))
        original_end = time.fromisoformat(str(permit["timeTo"]))
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=400, detail="The saved extension dates and times are invalid."
        ) from exc

    start_minutes = start.hour * 60 + start.minute
    end_minutes = end.hour * 60 + end.minute
    old_end_minutes = original_end.hour * 60 + original_end.minute
    if (
        extension_date == original_date
        and start_minutes == old_end_minutes
        and end_minutes > old_end_minutes
        and end_minutes - old_end_minutes <= 120
    ):
        approved_start = original_start
        approved_end = end
        note = "Same-day extension of two hours or less approved."
        requires_gate_reverification = False
    else:
        if extension_date <= original_date or end_minutes <= start_minutes:
            raise HTTPException(
                status_code=400,
                detail="The extension must have a later work date and a valid work window.",
            )
        if extension_date != original_date.fromordinal(original_date.toordinal() + 1):
            raise HTTPException(
                status_code=400,
                detail="An extension can only be approved for the next day.",
            )
        approved_start = start
        approved_end = end
        note = "Next-day extension approved on the existing permit."
        requires_gate_reverification = True

    history = permit.setdefault("extensionHistory", [])
    if not isinstance(history, list):
        raise HTTPException(status_code=500, detail="The saved permit extension history is invalid.")
    history.append(
        {
            "previousWorkDate": original_date.isoformat(),
            "previousTimeFrom": original_start.isoformat(timespec="minutes"),
            "previousTimeTo": original_end.isoformat(timespec="minutes"),
            "workDate": extension_date.isoformat(),
            "timeFrom": approved_start.isoformat(timespec="minutes"),
            "timeTo": approved_end.isoformat(timespec="minutes"),
            "justification": str(extension.get("justification") or "").strip(),
            "approvedBy": approved_by,
            "approvedAt": approved_at.isoformat(),
        }
    )
    permit.update(
        workDate=extension_date.isoformat(),
        timeFrom=approved_start.isoformat(timespec="minutes"),
        timeTo=approved_end.isoformat(timespec="minutes"),
        durationMinutes=(approved_end.hour * 60 + approved_end.minute)
        - (approved_start.hour * 60 + approved_start.minute),
    )
    permit.pop("extensionRequest", None)
    return extension_date, approved_start, approved_end, note, requires_gate_reverification


def _validate_submission(permit: dict[str, Any]) -> None:
    if permit.get("permitType") not in TYPES:
        raise HTTPException(status_code=400, detail="Select one of the six supported work permit types.")
    required = (
        "workDate", "timeFrom", "timeTo", "branchId", "specializedType", "nature",
        "building", "floor", "wing", "area", "workDescription", "jsaRef",
        "contractor", "contractorEmail", "supervisorName", "supervisorMobile",
    )
    missing = [key for key in required if not str(permit.get(key) or "").strip()]
    if missing:
        raise HTTPException(status_code=400, detail="Complete all required work, location, contractor, and schedule fields.")
    if "@" not in str(permit.get("contractorEmail") or ""):
        raise HTTPException(status_code=400, detail="Enter a valid contractor email address.")
    if permit.get("nature") == "OTHER" and not str(permit.get("natureOther") or "").strip():
        raise HTTPException(status_code=400, detail="Specify the nature of activity.")
    try:
        work_date = date.fromisoformat(str(permit["workDate"]))
        start = time.fromisoformat(str(permit["timeFrom"]))
        end = time.fromisoformat(str(permit["timeTo"]))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Enter a valid work date and time window.") from exc
    start_minutes = start.hour * 60 + start.minute
    end_minutes = end.hour * 60 + end.minute
    if work_date < date.today() or end_minutes <= start_minutes:
        raise HTTPException(status_code=400, detail="The work date must not be past and the end time must follow the start time.")
    duration = end_minutes - start_minutes
    permit["durationMinutes"] = duration
    over_nine_hours = permit.get("overNineHours")
    if duration > 540 and (
        not isinstance(over_nine_hours, dict)
        or not str(over_nine_hours.get("justification") or "").strip()
    ):
        raise HTTPException(status_code=400, detail="A justification is required when the work window exceeds nine hours.")
    if end_minutes > 19 * 60:
        night_work = permit.get("nightWork")
        answers = night_work.get("answers") if isinstance(night_work, dict) else None
        required_answers = {item["key"] for item in NIGHT_WORK_ITEMS}
        if (
            not isinstance(answers, dict)
            or set(answers) != required_answers
            or any(
                answers.get(item["key"])
                not in ({"Y", "N", "NA"} if item.get("allowNa") else {"Y", "N"})
                for item in NIGHT_WORK_ITEMS
            )
        ):
            raise HTTPException(status_code=400, detail="Complete every night work safety check.")
    if _workmen_count(permit) < 1:
        raise HTTPException(status_code=400, detail="At least one contractor worker is required.")
    checklist = permit.get("checklist")
    expected_checklist = set(CHECKLISTS.get(str(permit["permitType"]), []))
    if (
        not isinstance(checklist, list)
        or any(
            not isinstance(item, dict)
            or not isinstance(item.get("item"), str)
            or item.get("answer") not in {"Y", "N", "NA"}
            for item in checklist
        )
        or {item["item"] for item in checklist} != expected_checklist
        or len(checklist) != len(expected_checklist)
    ):
        raise HTTPException(status_code=400, detail="Complete every safety checklist item.")
    ppe = permit.get("ppe")
    if not isinstance(ppe, dict) or not isinstance(ppe.get("items"), list) or not ppe.get("items"):
        raise HTTPException(status_code=400, detail="Select the required PPE for the work.")
    signatures = permit.get("signatures")
    if not isinstance(signatures, dict):
        raise HTTPException(status_code=400, detail="Contractor and execution signatures are required.")
    if (signatures.get("contractor") or {}).get("signed") is not True or (signatures.get("execution") or {}).get("signed") is not True:
        raise HTTPException(status_code=400, detail="Contractor and execution signatures are required.")
    kind = permit["permitType"]
    if kind == "HOT_WORK" and (not (permit.get("fireWatch") or {}).get("nominee") or not (permit.get("fireWatch") or {}).get("validTill")):
        raise HTTPException(status_code=400, detail="Nominate a Fire Watch and set the watch end time.")
    height_checklist = permit.get("workingAtHeightChecklist")
    if kind == "HEIGHT":
        try:
            fall_height = float(permit.get("fallHeightMeters") or 0)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Enter a valid fall height.") from exc
        if fall_height < 2.5 or not isinstance(height_checklist, list) or not height_checklist or any(
            not isinstance(item, dict) or item.get("answer") not in {"Y", "N", "NA"} for item in height_checklist
        ):
            raise HTTPException(status_code=400, detail="Work at Height requires a fall height of at least 2.5 metres and its supplemental checklist.")
    if kind == "CONFINED":
        test = permit.get("atmosphericTest") or {}
        if any(test.get(key) in (None, "") for key in ("oxygen", "flammableGas", "dust")) or not permit.get("attendantName"):
            raise HTTPException(status_code=400, detail="Confined-space atmosphere readings and attendant are required.")
    if kind == "EXCAVATION":
        dimensions = permit.get("excavationDimensions") or {}
        clearance = permit.get("utilityClearance") or {}
        if any(not dimensions.get(k) for k in ("length", "width", "depth")) or not clearance.get("fire") or not clearance.get("technical"):
            raise HTTPException(status_code=400, detail="Excavation dimensions and Fire/FCM technical utility clearances are required.")


def _permit_storage_fields(permit: dict[str, Any]) -> dict[str, Any]:
    return {
        "contractor": str(permit.get("contractor") or ""),
        "location": " · ".join(
            str(permit[key]) for key in ("building", "floor", "wing", "area") if permit.get(key)
        ),
        "work_description": str(permit.get("workDescription") or ""),
        "work_date": permit.get("workDate") or None,
        "time_from": permit.get("timeFrom") or None,
        "time_to": permit.get("timeTo") or None,
        "supervisor_name": str(permit.get("supervisorName") or ""),
        "supervisor_mobile": str(permit.get("supervisorMobile") or ""),
    }


@router.get("/work-permits/catalog")
def permit_catalog(claims: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, EXECUTION | {"ADMIN", "HSE", "SECURITY"})
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP catalog read failed")
        raise HTTPException(status_code=503, detail="Unable to load the permit catalog.") from exc
    return {
        "permitTypes": [
            {"key": key, "name": label}
            for key, label in (
                ("HOT_WORK", "Hot work"),
                ("HEIGHT", "Work at height"),
                ("ELECTRICAL", "Electrical"),
                ("CONFINED", "Confined space"),
                ("EXCAVATION", "Excavation"),
                ("COLD", "Cold work"),
            )
        ],
        "specializedTypes": [
            {"key": key, "name": name, "permitTypes": types}
            for key, name, types in (
                ("WELDING", "Welding", ["HOT_WORK"]),
                ("CUTTING", "Cutting / grinding", ["HOT_WORK"]),
                ("ROOF_WORK", "Roof work", ["HEIGHT"]),
                ("SCAFFOLDING", "Scaffolding", ["HEIGHT"]),
                ("ELECTRICAL_REPAIR", "Electrical repair", ["ELECTRICAL"]),
                ("LOTO", "Isolation / LOTO", ["ELECTRICAL"]),
                ("VESSEL_ENTRY", "Vessel / tank entry", ["CONFINED"]),
                ("TRENCHING", "Trenching", ["EXCAVATION"]),
                ("MAINTENANCE", "General maintenance", ["COLD"]),
            )
        ],
        "natures": [
            {"key": "PREVENTIVE", "name": "Regular preventive maintenance"},
            {"key": "BREAKDOWN", "name": "Breakdown / failure rectification"},
            {"key": "EMERGENCY", "name": "Emergency work"},
            {"key": "RENOVATION", "name": "Renovation / modification"},
            {"key": "PROJECT", "name": "New project / installation"},
            {"key": "OTHER", "name": "Others — specify"},
        ],
        "buildings": [{"key": item, "name": item} for item in ("B-12", "B-14", "C-02")],
        "floors": [
            {"key": item, "name": item}
            for item in ("Floor 0 / basement", "Floor 1", "Floor 2", "Floor 3", "Roof")
        ],
        "wings": [{"key": item, "name": item} for item in ("East wing", "West wing", "North wing", "South wing")],
        "areas": [{"key": item, "name": item} for item in ("Boiler room", "Production area", "Utility area", "Warehouse", "Office area")],
        "workDescriptions": [
            {"key": item, "name": item, "permitTypes": ["HOT_WORK"]}
            for item in ("Weld repair — steam line support", "Grinding / cutting work", "Hot work — other")
        ] + [
            {"key": item, "name": item, "permitTypes": list(TYPES)}
            for item in ("Equipment maintenance", "Inspection / repair", "Installation work", "Other — specify")
        ],
        "jsaRefs": [{"key": item, "name": item} for item in ("JSA-2291 — Hot work on steam lines", "JSA-1001 — General maintenance", "SWMS-001 — Standard work method")],
        "contractors": [],
        "ppe": [
            {"key": key, "name": name}
            for key, name in (
                ("HELMET", "Safety helmet"),
                ("GOGGLES", "Safety goggles / face shield"),
                ("GLOVES", "Protective gloves"),
                ("SHOES", "Safety shoes"),
                ("HARNESS", "Full-body safety harness"),
                ("RESPIRATOR", "Respirator"),
                ("EAR_PROTECTION", "Hearing protection"),
            )
        ],
        "roomWorkstationHint": "e.g. Room 214, WS-12, AHU-3",
        "nightWorkItems": NIGHT_WORK_ITEMS,
        "checklists": CHECKLISTS,
    }


@router.get("/work-permit-notifications")
def list_ewp_notifications(
    claims: dict[str, Any] = Depends(current_user),
) -> list[dict[str, Any]]:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, EXECUTION | {"ADMIN", "HSE", "SECURITY"})
            cur.execute(
                "SELECT TOP (100) [Id],[PermitId],[PermitNo],[Action],[Title],[Message],"
                "[IsRead],[CreatedAt] FROM [dbo].[EwpNotifications] "
                "WHERE [RecipientUserId]=? ORDER BY [CreatedAt] DESC,[Id] DESC",
                str(claims["sub"]),
            )
            return [
                {
                    "id": str(row["Id"]),
                    "permitId": str(row["PermitId"]),
                    "permitNo": row.get("PermitNo") or "",
                    "action": row.get("Action") or "",
                    "title": row.get("Title") or "",
                    "message": row.get("Message") or "",
                    "isRead": bool(row.get("IsRead")),
                    "createdAt": row["CreatedAt"].isoformat() if row.get("CreatedAt") else None,
                }
                for row in rows_as_dicts(cur)
            ]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP notification listing failed for user %s", claims.get("sub"))
        raise HTTPException(status_code=503, detail="Unable to load E-Work Permit notifications.") from exc


@router.post("/work-permit-notifications/read")
def mark_ewp_notifications_read(
    body: NotificationReadWrite,
    claims: dict[str, Any] = Depends(current_user),
) -> dict[str, int]:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, EXECUTION | {"ADMIN", "HSE", "SECURITY"})
            requested_ids = list(dict.fromkeys(body.ids or []))
            if requested_ids:
                placeholders = ",".join("?" for _ in requested_ids)
                cur.execute(
                    "UPDATE [dbo].[EwpNotifications] SET [IsRead]=1 "
                    f"WHERE [RecipientUserId]=? AND [IsRead]=0 AND [Id] IN ({placeholders})",
                    str(claims["sub"]),
                    *requested_ids,
                )
            else:
                cur.execute(
                    "UPDATE [dbo].[EwpNotifications] SET [IsRead]=1 "
                    "WHERE [RecipientUserId]=? AND [IsRead]=0",
                    str(claims["sub"]),
                )
            return {"updated": max(int(cur.rowcount), 0)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP notification read update failed for user %s", claims.get("sub"))
        raise HTTPException(status_code=503, detail="Unable to update E-Work Permit notifications.") from exc


@router.get("/work-permits")
def list_permits(claims: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            security_branch = _branch_id(cur, claims) if role == "SECURITY" else None
            if role in {"ADMIN", "HSE", "SECURITY"}:
                cur.execute("SELECT * FROM [dbo].[WorkPermits] ORDER BY [CreatedAt] DESC")
            elif role in EXECUTION:
                cur.execute("SELECT * FROM [dbo].[WorkPermits] WHERE [RaisedByUserId]=? ORDER BY [CreatedAt] DESC", claims["sub"])
            else:
                _allow(role, EXECUTION)
            rows = rows_as_dicts(cur)
            output = []
            for row in rows:
                if role == "SECURITY" and row.get("Status") not in {"APPROVED", "ACTIVE", "ENTRY_REJECTED"}:
                    continue
                if role == "SECURITY" and (
                    not security_branch
                    or _branch_key(_form(row).get("branchId")) != _branch_key(security_branch)
                ):
                    continue
                permit = _payload(cur, row)
                if role == "SECURITY":
                    permit["qrToken"] = None
                    permit["qrValue"] = None
                output.append(permit)
            return output
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP listing failed")
        raise HTTPException(status_code=503, detail="Unable to load work permits.") from exc


@router.get("/work-permits/lookup")
def lookup_permit(code: str, claims: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            lookup = code.strip()
            scanned_token: str | None = None
            parts = lookup.split(":")
            if len(parts) == 3 and parts[0] == "FCM-EWP":
                lookup, scanned_token = parts[1], parts[2]
            cur.execute("SELECT * FROM [dbo].[WorkPermits] WHERE [PermitNo]=? OR CAST([Id] AS nvarchar(36))=?", lookup, lookup)
            rows = rows_as_dicts(cur)
            if not rows:
                raise HTTPException(status_code=404, detail="Work permit not found.")
            if role == "SECURITY":
                expected = _qr_token(str(rows[0]["Id"]))
                if not scanned_token or not expected or not hmac.compare_digest(scanned_token, expected):
                    raise HTTPException(status_code=403, detail="Security must scan a valid approved permit QR code.")
            _authorized(cur, rows[0], role, claims)
            permit = _payload(cur, rows[0])
            if role == "SECURITY":
                permit["qrToken"] = None
                permit["qrValue"] = None
            return permit
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP lookup failed")
        raise HTTPException(status_code=503, detail="Unable to look up the work permit.") from exc


@router.get("/work-permits/{permit_id}")
def get_permit(permit_id: str, claims: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            row = _get(cur, permit_id)
            _authorized(cur, row, role, claims)
            permit = _payload(cur, row)
            if role == "SECURITY":
                permit["qrToken"] = None
                permit["qrValue"] = None
            return permit
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP read failed")
        raise HTTPException(status_code=503, detail="Unable to load the work permit.") from exc


@router.post("/work-permits")
def save_permit(body: PermitWrite, claims: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, EXECUTION | {"ADMIN"})
            permit = body.permit
            if permit.get("permitType") not in TYPES:
                raise HTTPException(status_code=400, detail="Select one of the six supported work permit types.")
            workmen_count = _workmen_count(permit)
            _ensure_requester_branch(cur, role, claims, permit)
            permit_id = str(permit.get("id") or "")
            fields = _permit_storage_fields(permit)
            row: dict[str, Any] | None = None
            if permit_id:
                cur.execute("SELECT * FROM [dbo].[WorkPermits] WHERE [Id]=?", permit_id)
                existing_rows = rows_as_dicts(cur)
                row = existing_rows[0] if existing_rows else None
            if row:
                if role != "ADMIN" and str(row.get("RaisedByUserId") or "") != str(claims["sub"]):
                    raise HTTPException(status_code=403, detail="You can only edit permits you raised.")
                if row.get("Status") not in {"DRAFT", "SENT_BACK"}:
                    raise HTTPException(status_code=409, detail="Only draft or sent-back permits can be edited.")
                cur.execute(
                    "UPDATE [dbo].[WorkPermits] SET [PermitType]=?,[FormData]=?,[Contractor]=?,[Location]=?,[WorkDescription]=?,[WorkDate]=?,[StartDate]=?,[EndDate]=?,[TimeFrom]=?,[TimeTo]=?,[WorkmenCount]=?,[SupervisorName]=?,[SupervisorMobile]=?,[UpdatedAt]=SYSUTCDATETIME() WHERE [Id]=?",
                    permit["permitType"], json.dumps(permit, separators=(",", ":"), ensure_ascii=False),
                    fields["contractor"], fields["location"], fields["work_description"],
                    fields["work_date"], fields["work_date"], fields["work_date"],
                    fields["time_from"], fields["time_to"], workmen_count,
                    fields["supervisor_name"], fields["supervisor_mobile"], permit_id,
                )
                _event(cur, row, "DRAFT_SAVED", "Permit draft updated.", claims)
            else:
                cur.execute(
                    """
                    SET NOCOUNT ON;
                    DECLARE @lock_result int;
                    EXEC @lock_result = sys.sp_getapplock
                        @Resource = 'EwpActivePermitCreation',
                        @LockMode = 'Exclusive',
                        @LockOwner = 'Transaction',
                        @LockTimeout = 10000;
                    SELECT @lock_result;
                    """
                )
                lock_result = cur.fetchone()
                if not lock_result or int(lock_result[0]) < 0:
                    raise HTTPException(
                        status_code=503,
                        detail="Unable to reserve permit creation. Please try again.",
                    )
                cur.execute(
                    "SELECT TOP (1) [Id] FROM [dbo].[WorkPermits] WITH (UPDLOCK,HOLDLOCK) WHERE [RaisedByUserId]=? AND [Status] IN ('DRAFT','PENDING_HSE','SENT_BACK','APPROVED','ACTIVE','CLOSURE_REQUESTED','EXTENSION_REQUESTED')",
                    claims["sub"],
                )
                if cur.fetchone():
                    raise HTTPException(status_code=409, detail="Close your existing open permit before creating another.")
                cur.execute(
                    """
                    SELECT TOP (1) [Id]
                    FROM [dbo].[WorkPermits] WITH (UPDLOCK,HOLDLOCK)
                    WHERE [Status] IN ('APPROVED','ACTIVE','CLOSURE_REQUESTED','EXTENSION_REQUESTED')
                    """
                )
                if cur.fetchone():
                    raise HTTPException(
                        status_code=409,
                        detail="Another permit is currently approved or active. New permits can be raised after it is closed.",
                    )
                permit_id = permit_id or str(uuid.uuid4())
                name = _name(cur, claims)
                permit.update(id=permit_id, status="DRAFT", raisedById=claims["sub"], raisedByName=name, events=[])
                cur.execute(
                    "INSERT INTO [dbo].[WorkPermits] ([Id],[PermitType],[Status],[Contractor],[Location],[WorkDescription],[WorkDate],[StartDate],[EndDate],[TimeFrom],[TimeTo],[WorkmenCount],[SupervisorName],[SupervisorMobile],[RaisedByUserId],[RaisedByName],[FormData]) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    permit_id, permit["permitType"], "DRAFT", fields["contractor"], fields["location"],
                    fields["work_description"], fields["work_date"], fields["work_date"],
                    fields["work_date"], fields["time_from"], fields["time_to"], workmen_count,
                    fields["supervisor_name"], fields["supervisor_mobile"],
                    claims["sub"], str(name or ""),
                    json.dumps(permit, separators=(",", ":"), ensure_ascii=False),
                )
                row = _get(cur, permit_id)
                _event(cur, row, "CREATED", "Permit draft created.", claims)
            return _payload(cur, _get(cur, permit_id))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP save failed")
        raise HTTPException(status_code=503, detail="Unable to save the work permit.") from exc


@router.post("/work-permits/{permit_id}/contractor-otp/send")
def send_contractor_otp(
    permit_id: str,
    body: ContractorOtpSend | None = None,
    claims: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, EXECUTION | {"ADMIN"})
            cur.execute("SELECT * FROM [dbo].[WorkPermits] WHERE [Id]=?", permit_id)
            permit_rows = rows_as_dicts(cur)
            row = permit_rows[0] if permit_rows else None
            if row:
                if role != "ADMIN" and str(row.get("RaisedByUserId") or "") != str(claims["sub"]):
                    raise HTTPException(status_code=403, detail="Only the original requester can verify this contractor.")
                if row.get("Status") not in {"DRAFT", "SENT_BACK"}:
                    raise HTTPException(status_code=409, detail="Contractor verification is only available before submission.")
                permit = _form(row)
                recipient = (
                    body.contractorEmail.strip()
                    if body
                    else str(permit.get("contractorEmail") or "").strip()
                )
                user_id = str(row.get("RaisedByUserId") or "")
            else:
                if body is None:
                    raise HTTPException(status_code=404, detail="Work permit not found.")
                recipient = body.contractorEmail.strip()
                permit = {"id": permit_id}
                user_id = str(claims["sub"])
            if "@" not in recipient:
                raise HTTPException(status_code=400, detail="Enter a valid contractor email address before requesting an OTP.")
            cur.execute(
                "SELECT DATEDIFF(SECOND,[CreatedAt],SYSUTCDATETIME()),[VerifiedAt],[ContractorEmail] "
                "FROM [dbo].[EwpContractorOtpChallenges] WITH (UPDLOCK,HOLDLOCK) WHERE [PermitId]=?",
                permit_id,
            )
            existing = cur.fetchone()
            if existing and existing[1] and str(existing[2] or "").casefold() == recipient.casefold():
                raise HTTPException(status_code=409, detail="The contractor email has already been verified.")
            if (
                existing
                and str(existing[2] or "").casefold() == recipient.casefold()
                and existing[0] is not None
                and 0 <= int(existing[0]) < 60
            ):
                raise HTTPException(status_code=429, detail="Wait 60 seconds before requesting another contractor OTP.")

            code = f"{secrets.randbelow(1_000_000):06d}"
            code_hash = _contractor_otp_hash(permit_id, user_id, recipient, code)
            if existing:
                cur.execute(
                    "UPDATE [dbo].[EwpContractorOtpChallenges] "
                    "SET [RaisedByUserId]=?,[ContractorEmail]=?,[CodeHash]=?,"
                    "[ExpiresAt]=DATEADD(MINUTE,10,SYSUTCDATETIME()),[Attempts]=0,"
                    "[VerifiedAt]=NULL,[CreatedAt]=SYSUTCDATETIME() WHERE [PermitId]=?",
                    user_id, recipient, code_hash, permit_id,
                )
            else:
                cur.execute(
                    "INSERT INTO [dbo].[EwpContractorOtpChallenges] "
                    "([PermitId],[RaisedByUserId],[ContractorEmail],[CodeHash],[ExpiresAt]) "
                    "VALUES (?, ?, ?, ?, DATEADD(MINUTE,10,SYSUTCDATETIME()))",
                    permit_id, user_id, recipient, code_hash,
                )

            _send_contractor_otp_email(recipient, code, permit)
            if row:
                _event(cur, row, "CONTRACTOR_OTP_SENT", "Contractor verification code sent by email.", claims)
            return {
                "sent": True,
                "destination": _contractor_email_destination(recipient),
                "expiresInSeconds": 600,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP contractor OTP delivery failed for permit %s", permit_id)
        raise HTTPException(
            status_code=502,
            detail="Unable to send the contractor OTP. Check SMTP configuration and the contractor email address.",
        ) from exc


@router.post("/work-permits/{permit_id}/contractor-otp/verify")
def verify_contractor_otp(
    permit_id: str,
    body: ContractorOtpVerify,
    claims: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    failure: tuple[int, str] | None = None
    result: dict[str, Any] | None = None
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, EXECUTION | {"ADMIN"})
            cur.execute("SELECT * FROM [dbo].[WorkPermits] WHERE [Id]=?", permit_id)
            permit_rows = rows_as_dicts(cur)
            row = permit_rows[0] if permit_rows else None
            if row:
                if role != "ADMIN" and str(row.get("RaisedByUserId") or "") != str(claims["sub"]):
                    raise HTTPException(status_code=403, detail="Only the original requester can verify this contractor.")
                if row.get("Status") not in {"DRAFT", "SENT_BACK"}:
                    raise HTTPException(status_code=409, detail="Contractor verification is only available before submission.")
                permit = _form(row)
                recipient = (
                    body.contractorEmail.strip()
                    if body.contractorEmail
                    else str(permit.get("contractorEmail") or "").strip()
                )
                user_id = str(row.get("RaisedByUserId") or "")
            else:
                recipient = str(body.contractorEmail or "").strip()
                user_id = str(claims["sub"])
                if not recipient:
                    raise HTTPException(status_code=404, detail="Work permit not found.")
            if "@" not in recipient:
                raise HTTPException(status_code=400, detail="Enter the contractor email used to request the OTP.")
            cur.execute(
                "SELECT [RaisedByUserId],[ContractorEmail],[CodeHash],[ExpiresAt],[Attempts],[VerifiedAt],"
                "CASE WHEN [ExpiresAt] <= SYSUTCDATETIME() THEN 1 ELSE 0 END "
                "FROM [dbo].[EwpContractorOtpChallenges] WITH (UPDLOCK,HOLDLOCK) WHERE [PermitId]=?",
                permit_id,
            )
            challenge = cur.fetchone()
            if not challenge:
                raise HTTPException(status_code=409, detail="Request a contractor OTP before verifying it.")
            if (
                str(challenge[0]) != user_id
                or (role != "ADMIN" and str(challenge[0]) != str(claims.get("sub") or ""))
                or str(challenge[1] or "").casefold() != recipient.casefold()
            ):
                raise HTTPException(status_code=409, detail="Contractor details changed. Request a new OTP.")
            if challenge[5]:
                verified_at = challenge[5]
                return {
                    "verified": True,
                    "verifiedAt": verified_at.isoformat() if hasattr(verified_at, "isoformat") else str(verified_at),
                }
            if challenge[6]:
                failure = (400, "The contractor OTP has expired. Request a new code.")
            elif int(challenge[4] or 0) >= 5:
                failure = (429, "Too many incorrect OTP attempts. Request a new code.")
            elif not hmac.compare_digest(
                str(challenge[2]), _contractor_otp_hash(permit_id, str(challenge[0]), recipient, body.code)
            ):
                cur.execute(
                    "UPDATE [dbo].[EwpContractorOtpChallenges] SET [Attempts]=[Attempts]+1 WHERE [PermitId]=?",
                    permit_id,
                )
                failure = (400, "The contractor OTP is incorrect.")
            else:
                cur.execute(
                    "UPDATE [dbo].[EwpContractorOtpChallenges] SET [VerifiedAt]=SYSUTCDATETIME() "
                    "WHERE [PermitId]=? AND [VerifiedAt] IS NULL",
                    permit_id,
                )
                cur.execute(
                    "SELECT [VerifiedAt] FROM [dbo].[EwpContractorOtpChallenges] WHERE [PermitId]=?",
                    permit_id,
                )
                verified_at = cur.fetchone()[0]
                if row:
                    _event(cur, row, "CONTRACTOR_OTP_VERIFIED", "Contractor email verified by OTP.", claims)
                result = {
                    "verified": True,
                    "verifiedAt": verified_at.isoformat() if hasattr(verified_at, "isoformat") else str(verified_at),
                }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP contractor OTP verification failed for permit %s", permit_id)
        raise HTTPException(status_code=503, detail="Unable to verify the contractor OTP.") from exc

    if failure:
        raise HTTPException(status_code=failure[0], detail=failure[1])
    if result is None:
        raise HTTPException(status_code=503, detail="Unable to verify the contractor OTP.")
    return result


@router.post("/work-permits/{permit_id}/submit")
def submit_permit(permit_id: str, claims: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, EXECUTION | {"ADMIN"})
            row = _get(cur, permit_id)
            if role != "ADMIN" and str(row.get("RaisedByUserId") or "") != str(claims["sub"]):
                raise HTTPException(status_code=403, detail="Only the original requester can submit this permit.")
            if row.get("Status") not in {"DRAFT", "SENT_BACK"}:
                raise HTTPException(status_code=409, detail="Only draft or sent-back permits can be submitted.")
            permit = _form(row)
            _ensure_requester_branch(cur, role, claims, permit)
            _set_verified_contractor_signature(cur, row, permit, claims, role)
            _validate_submission(permit)
            _save_form(cur, row, permit, "PENDING_HSE")
            _event(cur, row, "SUBMITTED", "Submitted to HSE for review.", claims)
            return _payload(cur, _get(cur, permit_id))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP submit failed")
        raise HTTPException(status_code=503, detail="Unable to submit the work permit.") from exc


@router.post("/work-permits/{permit_id}/fes-signoff")
def fes_signoff(permit_id: str, claims: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, {"ADMIN", "HSE"})
            row = _get(cur, permit_id)
            if row.get("Status") != "PENDING_HSE" or row.get("PermitType") != "HOT_WORK":
                raise HTTPException(status_code=409, detail="FES sign-off is only available for pending Hot Work permits.")
            permit = _form(row)
            permit.setdefault("gates", {})["fes"] = "DONE"
            _save_form(cur, row, permit)
            _event(cur, row, "FES_SIGNOFF", "Fire / FES sign-off recorded.", claims)
            return _payload(cur, _get(cur, permit_id))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP FES sign-off failed")
        raise HTTPException(status_code=503, detail="Unable to record FES sign-off.") from exc


@router.post("/work-permits/{permit_id}/approve")
def approve_permit(permit_id: str, body: ReviewWrite, claims: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, {"ADMIN", "HSE"})
            row = _get(cur, permit_id)
            if row.get("Status") != "PENDING_HSE":
                raise HTTPException(status_code=409, detail="Only pending permits can be approved.")
            permit = _form(row)
            if row.get("PermitType") == "HOT_WORK" and permit.get("gates", {}).get("fes") != "DONE":
                raise HTTPException(status_code=409, detail="Hot Work requires FES sign-off before HSE approval.")
            if not body.hseValidation or any(x.get("verdict") not in {"OK", "NC"} for x in body.hseValidation.values()):
                raise HTTPException(status_code=400, detail="Record OK or NC for each HSE review block.")
            permit["hseValidation"] = body.hseValidation
            permit.setdefault("gates", {})["hse"] = "DONE"
            prefix = PREFIX[row.get("PermitType") or "COLD"]
            cur.execute("SELECT ISNULL(MAX(TRY_CONVERT(int,RIGHT([PermitNo],4))),0)+1 FROM [dbo].[WorkPermits] WITH (UPDLOCK,HOLDLOCK) WHERE [PermitNo] LIKE ?", f"{prefix}-%")
            number = int(cur.fetchone()[0])
            permit_no = f"{prefix}-{number:04d}"
            name = _name(cur, claims)
            cur.execute(
                "UPDATE [dbo].[WorkPermits] SET [PermitNo]=?,[Status]='APPROVED',[FormData]=?,[ApprovedByName]=?,[ApprovedAt]=SYSUTCDATETIME(),[ReviewedByName]=?,[ReviewedAt]=SYSUTCDATETIME(),[UpdatedAt]=SYSUTCDATETIME() WHERE [Id]=? AND [Status]='PENDING_HSE'",
                permit_no, json.dumps(permit, separators=(",", ":"), ensure_ascii=False), name, name, permit_id,
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=409, detail="The permit changed before approval.")
            row["PermitNo"] = permit_no
            _event(cur, row, "APPROVED", "Approved by HSE.", claims)
            approved = _get(cur, permit_id)
            result = _payload(cur, approved)
            recipient = _contractor_email_for_approval(result)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP approval failed")
        raise HTTPException(status_code=503, detail="Unable to approve the work permit.") from exc
    try:
        if "@" not in recipient:
            raise RuntimeError("The permit has no valid contractor email address.")
        _send_approval_email(result, recipient)
    except Exception as exc:
        logger.exception("EWP permit %s was approved, but the contractor QR email was not sent", permit_id)
        raise HTTPException(
            status_code=502,
            detail="Permit approved, but the contractor QR email could not be sent. Check SMTP configuration and the contractor email address.",
        ) from exc
    return result


@router.post("/work-permits/{permit_id}/resend-approval-email")
def resend_approval_email(permit_id: str, claims: dict[str, Any] = Depends(current_user)) -> dict[str, str]:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, {"ADMIN", "HSE"})
            row = _get(cur, permit_id)
            if row.get("Status") != "APPROVED":
                raise HTTPException(status_code=409, detail="Only approved permits can resend the QR email.")
            permit = _payload(cur, row)
            recipient = _contractor_email_for_approval(permit)
        if "@" not in recipient:
            raise HTTPException(status_code=400, detail="The permit has no valid contractor email address.")
        _send_approval_email(permit, recipient)
        return {"message": "Contractor QR email sent."}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP approval email resend failed for permit %s", permit_id)
        raise HTTPException(status_code=502, detail="Unable to resend the approval email. Check SMTP configuration.") from exc


@router.post("/work-permits/{permit_id}/send-back")
def send_back(permit_id: str, body: ReviewWrite, claims: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, {"ADMIN", "HSE"})
            row = _get(cur, permit_id)
            if row.get("Status") != "PENDING_HSE":
                raise HTTPException(status_code=409, detail="Only pending permits can be sent back.")
            if len(body.note.strip()) < 3:
                raise HTTPException(status_code=400, detail="A clarification note is required.")
            permit = _form(row)
            permit["sendBackNote"] = body.note.strip()
            permit["hseValidation"] = body.hseValidation
            _save_form(cur, row, permit, "SENT_BACK")
            cur.execute("UPDATE [dbo].[WorkPermits] SET [ReviewNote]=?,[ReviewedByName]=?,[ReviewedAt]=SYSUTCDATETIME() WHERE [Id]=?", body.note.strip(), _name(cur, claims), permit_id)
            _event(cur, row, "SENT_BACK", body.note.strip(), claims)
            return _payload(cur, _get(cur, permit_id))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP send back failed")
        raise HTTPException(status_code=503, detail="Unable to send the work permit back.") from exc


@router.post("/work-permits/{permit_id}/reject")
def reject_permit(permit_id: str, body: RejectWrite, claims: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, {"ADMIN", "HSE"})
            row = _get(cur, permit_id)
            if row.get("Status") != "PENDING_HSE":
                raise HTTPException(status_code=409, detail="Only pending permits can be rejected.")
            permit = _form(row)
            permit["rejectionReason"] = body.reason.strip()
            _save_form(cur, row, permit, "REJECTED")
            cur.execute("UPDATE [dbo].[WorkPermits] SET [RejectionReason]=?,[ReviewedByName]=?,[ReviewedAt]=SYSUTCDATETIME() WHERE [Id]=?", body.reason.strip(), _name(cur, claims), permit_id)
            _event(cur, row, "REJECTED", body.reason.strip(), claims)
            return _payload(cur, _get(cur, permit_id))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP rejection failed")
        raise HTTPException(status_code=503, detail="Unable to reject the work permit.") from exc


@router.post("/work-permits/{permit_id}/gate-otp/send")
def send_gate_otp(
    permit_id: str,
    body: GateOtpSend,
    claims: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, {"ADMIN", "SECURITY"})
            row = _get(cur, permit_id)
            _authorized(cur, row, role, claims)
            if row.get("Status") != "APPROVED":
                raise HTTPException(status_code=409, detail="Gate verification is only available for approved permits.")
            _validate_gate_qr(permit_id, body.qrToken)
            permit = _form(row)
            recipient = _contractor_email_for_approval(permit)
            if "@" not in recipient:
                raise HTTPException(status_code=409, detail="The permit has no valid contractor email address.")

            cur.execute(
                "SELECT DATEDIFF(SECOND,[CreatedAt],SYSUTCDATETIME()),[VerifiedAt],[UsedAt],"
                "CASE WHEN [ExpiresAt] <= SYSUTCDATETIME() THEN 1 ELSE 0 END "
                "FROM [dbo].[EwpGateOtpChallenges] WITH (UPDLOCK,HOLDLOCK) WHERE [PermitId]=?",
                permit_id,
            )
            existing = cur.fetchone()
            if existing and existing[1] and not existing[2] and not existing[3]:
                raise HTTPException(status_code=409, detail="The contractor has already verified this gate code.")
            if (
                existing
                and existing[0] is not None
                and 0 <= int(existing[0]) < 60
            ):
                raise HTTPException(status_code=429, detail="Wait 60 seconds before requesting another gate verification code.")

            code = f"{secrets.randbelow(1_000_000):06d}"
            code_hash = _gate_otp_hash(permit_id, recipient, code)
            if existing:
                cur.execute(
                    "UPDATE [dbo].[EwpGateOtpChallenges] SET [ContractorEmail]=?,[CodeHash]=?,"
                    "[ExpiresAt]=DATEADD(MINUTE,10,SYSUTCDATETIME()),[Attempts]=0,"
                    "[VerifiedAt]=NULL,[UsedAt]=NULL,[CreatedAt]=SYSUTCDATETIME() WHERE [PermitId]=?",
                    recipient, code_hash, permit_id,
                )
            else:
                cur.execute(
                    "INSERT INTO [dbo].[EwpGateOtpChallenges] "
                    "([PermitId],[ContractorEmail],[CodeHash],[ExpiresAt]) "
                    "VALUES (?, ?, ?, DATEADD(MINUTE,10,SYSUTCDATETIME()))",
                    permit_id, recipient, code_hash,
                )
            _send_contractor_otp_email(
                recipient,
                code,
                permit,
                purpose="gate check-in",
                verification_url=_gate_checkin_url(permit_id, body.qrToken),
            )
            _event(cur, row, "GATE_OTP_SENT", "Gate check-in verification code sent to the contractor.", claims)
            return {
                "sent": True,
                "destination": _contractor_email_destination(recipient),
                "expiresInSeconds": 600,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP gate OTP delivery failed for permit %s", permit_id)
        raise HTTPException(
            status_code=502,
            detail=(
                "Unable to send the gate verification code. Check the gate OTP database "
                "migration, SMTP configuration, and contractor email address."
            ),
        ) from exc


@router.get("/work-permits/{permit_id}/gate-otp/status")
def gate_otp_status(
    permit_id: str,
    qrToken: str,
    claims: dict[str, Any] = Depends(current_user),
) -> dict[str, bool]:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, {"ADMIN", "SECURITY"})
            row = _get(cur, permit_id)
            _authorized(cur, row, role, claims)
            if row.get("Status") != "APPROVED":
                raise HTTPException(status_code=409, detail="Gate verification is only available for approved permits.")
            _validate_gate_qr(permit_id, qrToken)
            cur.execute(
                "SELECT CASE WHEN [VerifiedAt] IS NOT NULL AND [UsedAt] IS NULL "
                "AND [ExpiresAt] > SYSUTCDATETIME() THEN 1 ELSE 0 END "
                "FROM [dbo].[EwpGateOtpChallenges] WHERE [PermitId]=?",
                permit_id,
            )
            status = cur.fetchone()
            return {"verified": bool(status and status[0])}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP gate OTP status lookup failed for permit %s", permit_id)
        raise HTTPException(status_code=503, detail="Unable to load contractor verification status.") from exc


@router.post("/public/work-permits/{permit_id}/gate-otp/verify")
def verify_gate_otp_by_contractor(
    permit_id: str,
    body: GateOtpVerify,
) -> dict[str, Any]:
    failure: tuple[int, str] | None = None
    result: dict[str, Any] | None = None
    try:
        with cursor() as cur:
            row = _get(cur, permit_id)
            if row.get("Status") != "APPROVED":
                raise HTTPException(status_code=409, detail="Gate check-in is only available for approved permits.")
            _validate_gate_qr(permit_id, body.qrToken)
            recipient = _contractor_email_for_approval(_form(row))
            if "@" not in recipient:
                raise HTTPException(status_code=409, detail="The permit has no valid contractor email address.")

            cur.execute(
                "SELECT [ContractorEmail],[CodeHash],[Attempts],[VerifiedAt],[UsedAt],"
                "CASE WHEN [ExpiresAt] <= SYSUTCDATETIME() THEN 1 ELSE 0 END "
                "FROM [dbo].[EwpGateOtpChallenges] WITH (UPDLOCK,HOLDLOCK) WHERE [PermitId]=?",
                permit_id,
            )
            challenge = cur.fetchone()
            if not challenge:
                raise HTTPException(status_code=409, detail="Request a gate verification code from Security first.")
            if str(challenge[0] or "").casefold() != recipient.casefold():
                raise HTTPException(status_code=409, detail="The contractor email changed. Ask Security to send a new code.")
            if challenge[4]:
                raise HTTPException(status_code=409, detail="This gate verification code has already been used.")
            if challenge[5]:
                failure = (400, "The gate verification code has expired. Ask Security to send a new code.")
            elif int(challenge[2] or 0) >= 5:
                failure = (429, "Too many incorrect code attempts. Ask Security to send a new code.")
            elif not hmac.compare_digest(
                str(challenge[1]),
                _gate_otp_hash(permit_id, recipient, body.code),
            ):
                cur.execute(
                    "UPDATE [dbo].[EwpGateOtpChallenges] SET [Attempts]=[Attempts]+1 WHERE [PermitId]=?",
                    permit_id,
                )
                failure = (400, "The gate verification code is incorrect.")
            else:
                cur.execute(
                    "UPDATE [dbo].[EwpGateOtpChallenges] SET [VerifiedAt]=SYSUTCDATETIME() "
                    "WHERE [PermitId]=? AND [VerifiedAt] IS NULL AND [UsedAt] IS NULL "
                    "AND [ExpiresAt] > SYSUTCDATETIME() AND [Attempts] < 5",
                    permit_id,
                )
                if cur.rowcount == 0:
                    raise HTTPException(status_code=409, detail="This gate verification code has expired or was already used.")
                cur.execute(
                    "SELECT [VerifiedAt] FROM [dbo].[EwpGateOtpChallenges] WHERE [PermitId]=?",
                    permit_id,
                )
                verified_at = cur.fetchone()[0]
                cur.execute(
                    "INSERT INTO [dbo].[ModuleEvents] "
                    "([Id],[ModuleName],[RecordId],[Action],[Note],[ActorUserId],[ActorName],[CreatedAt]) "
                    "VALUES (NEWID(),'PERMIT',?,'GATE_OTP_VERIFIED',?,NULL,'Contractor email OTP',SYSUTCDATETIME())",
                    row["Id"],
                    f"Contractor verified the gate check-in code for {recipient}.",
                )
                _notify_ewp_event(
                    cur,
                    row,
                    "GATE_OTP_VERIFIED",
                    "Contractor verified the gate check-in code.",
                )
                result = {
                    "verified": True,
                    "verifiedAt": verified_at.isoformat() if hasattr(verified_at, "isoformat") else str(verified_at),
                }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Contractor gate OTP verification failed for permit %s", permit_id)
        raise HTTPException(status_code=503, detail="Unable to verify the gate check-in code.") from exc
    if failure:
        raise HTTPException(status_code=failure[0], detail=failure[1])
    if result is None:
        raise HTTPException(status_code=503, detail="Unable to verify the gate check-in code.")
    return result


@router.post("/work-permits/{permit_id}/gate-otp/verify")
def verify_gate_otp(
    permit_id: str,
    body: GateOtpVerify,
    claims: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    failure: tuple[int, str] | None = None
    result: dict[str, Any] | None = None
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, {"ADMIN", "SECURITY"})
            row = _get(cur, permit_id)
            _authorized(cur, row, role, claims)
            if row.get("Status") != "APPROVED":
                raise HTTPException(status_code=409, detail="Gate verification is only available for approved permits.")
            _validate_gate_qr(permit_id, body.qrToken)
            recipient = _contractor_email_for_approval(_form(row))
            if "@" not in recipient:
                raise HTTPException(status_code=409, detail="The permit has no valid contractor email address.")

            cur.execute(
                "SELECT [ContractorEmail],[CodeHash],[ExpiresAt],[Attempts],[VerifiedAt],[UsedAt],"
                "CASE WHEN [ExpiresAt] <= SYSUTCDATETIME() THEN 1 ELSE 0 END "
                "FROM [dbo].[EwpGateOtpChallenges] WITH (UPDLOCK,HOLDLOCK) WHERE [PermitId]=?",
                permit_id,
            )
            challenge = cur.fetchone()
            if not challenge:
                raise HTTPException(status_code=409, detail="Send a gate verification code to the contractor first.")
            if str(challenge[0] or "").casefold() != recipient.casefold():
                raise HTTPException(status_code=409, detail="The contractor email changed. Send a new gate verification code.")
            if challenge[5]:
                raise HTTPException(status_code=409, detail="This gate verification code has already been used.")
            if challenge[6]:
                failure = (400, "The gate verification code has expired. Request a new code.")
            elif challenge[4]:
                verified_at = challenge[4]
                result = {
                    "verified": True,
                    "verifiedAt": verified_at.isoformat() if hasattr(verified_at, "isoformat") else str(verified_at),
                }
            elif int(challenge[3] or 0) >= 5:
                failure = (429, "Too many incorrect code attempts. Request a new gate verification code.")
            elif not hmac.compare_digest(
                str(challenge[1]),
                _gate_otp_hash(permit_id, recipient, body.code),
            ):
                cur.execute(
                    "UPDATE [dbo].[EwpGateOtpChallenges] SET [Attempts]=[Attempts]+1 WHERE [PermitId]=?",
                    permit_id,
                )
                failure = (400, "The gate verification code is incorrect.")
            else:
                cur.execute(
                    "UPDATE [dbo].[EwpGateOtpChallenges] SET [VerifiedAt]=SYSUTCDATETIME() "
                    "WHERE [PermitId]=? AND [VerifiedAt] IS NULL AND [UsedAt] IS NULL",
                    permit_id,
                )
                cur.execute(
                    "SELECT [VerifiedAt] FROM [dbo].[EwpGateOtpChallenges] WHERE [PermitId]=?",
                    permit_id,
                )
                verified_at = cur.fetchone()[0]
                _event(cur, row, "GATE_OTP_VERIFIED", "Contractor verified the gate check-in code.", claims)
                result = {
                    "verified": True,
                    "verifiedAt": verified_at.isoformat() if hasattr(verified_at, "isoformat") else str(verified_at),
                }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP gate OTP verification failed for permit %s", permit_id)
        raise HTTPException(status_code=503, detail="Unable to verify the gate check-in code.") from exc
    if failure:
        raise HTTPException(status_code=failure[0], detail=failure[1])
    if result is None:
        raise HTTPException(status_code=503, detail="Unable to verify the gate check-in code.")
    return result


@router.post("/work-permits/{permit_id}/gate")
def gate_permit(permit_id: str, body: GateWrite, claims: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    denied = False
    result: dict[str, Any]
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, {"ADMIN", "SECURITY"})
            row = _get(cur, permit_id)
            _authorized(cur, row, role, claims)
            if row.get("Status") != "APPROVED":
                raise HTTPException(status_code=409, detail="Security can only verify approved permits.")
            permit = _form(row)
            if body.grant:
                if not body.contractorIdCard.strip() or not body.consent:
                    raise HTTPException(status_code=400, detail="Contractor ID and consent are required to grant entry.")
                _validate_gate_qr(permit_id, body.qrToken)
                today = date.today()
                now = datetime.now().astimezone()
                start = time.fromisoformat(str(permit["timeFrom"]))
                end = time.fromisoformat(str(permit["timeTo"]))
                if today.isoformat() != str(permit["workDate"]) or (now.hour, now.minute) < (start.hour, start.minute) or (now.hour, now.minute) > (end.hour, end.minute):
                    permit.setdefault("deviations", []).append({"at": now.isoformat(), "kind": "ENTRY_OUTSIDE_APPROVED_WINDOW", "note": "Entry attempted outside approved window."})
                    _save_form(cur, row, permit)
                    _event(cur, row, "ENTRY_WINDOW_DEVIATION", "Entry denied outside approved date/time window.", claims)
                    denied = True
                else:
                    cur.execute(
                        "SELECT [VerifiedAt],[UsedAt],"
                        "CASE WHEN [ExpiresAt] <= SYSUTCDATETIME() THEN 1 ELSE 0 END "
                        "FROM [dbo].[EwpGateOtpChallenges] WITH (UPDLOCK,HOLDLOCK) WHERE [PermitId]=?",
                        permit_id,
                    )
                    gate_otp = cur.fetchone()
                    if not gate_otp or not gate_otp[0] or gate_otp[1] or gate_otp[2]:
                        raise HTTPException(
                            status_code=409,
                            detail="The contractor must verify the gate check-in code before entry is granted.",
                        )
                    cur.execute(
                        "UPDATE [dbo].[EwpGateOtpChallenges] SET [UsedAt]=SYSUTCDATETIME() "
                        "WHERE [PermitId]=? AND [VerifiedAt] IS NOT NULL AND [UsedAt] IS NULL "
                        "AND [ExpiresAt] > SYSUTCDATETIME()",
                        permit_id,
                    )
                    if cur.rowcount == 0:
                        raise HTTPException(
                            status_code=409,
                            detail="The contractor gate verification has expired or has already been used.",
                        )
                    permit["contractorIdCard"] = body.contractorIdCard.strip()
                    permit["consentCaptured"] = True
                    permit["entryGrantedAt"] = now.isoformat()
                    permit["entryGrantedBy"] = _name(cur, claims)
                    _save_form(cur, row, permit, "ACTIVE")
                    cur.execute(
                        "UPDATE [dbo].[WorkPermits] SET [ArrivedAt]=SYSUTCDATETIME() WHERE [Id]=?",
                        permit_id,
                    )
                    _event(cur, row, "ENTRY_GRANTED", "Security recorded contractor ID and consent.", claims)
            else:
                reason_parts = [part for part in (body.reason.strip(), body.note.strip()) if part]
                reason = " — ".join(reason_parts)
                if not reason:
                    raise HTTPException(status_code=400, detail="Provide a reason when rejecting entry.")
                permit.setdefault("deviations", []).append({"at": datetime.now(timezone.utc).isoformat(), "kind": "ENTRY_REJECTED", "note": reason})
                _save_form(cur, row, permit)
                _event(cur, row, "ENTRY_REJECTED", reason, claims)
            result = _payload(cur, _get(cur, permit_id))
        if denied:
            raise HTTPException(status_code=409, detail="Entry is permitted only during the approved date and time window.")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP gate decision failed")
        raise HTTPException(status_code=503, detail="Unable to record the gate decision.") from exc


@router.post("/work-permits/{permit_id}/close")
def request_closure(permit_id: str, body: LifecycleWrite, claims: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, EXECUTION | {"ADMIN"})
            row = _get(cur, permit_id)
            if role != "ADMIN" and str(row.get("RaisedByUserId") or "") != str(claims["sub"]):
                raise HTTPException(status_code=403, detail="Only the original requester can close or extend this permit.")
            permit = _form(row)
            if row.get("Status") != "ACTIVE":
                if (
                    body.action == "CANCEL_OPEN_PERMIT"
                    and row.get("Status") in {"DRAFT", "PENDING_HSE", "SENT_BACK", "APPROVED"}
                ):
                    permit["cancellationNote"] = str(
                        body.payload.get("reason") or "Closed by the permit requester."
                    ).strip()
                    _save_form(cur, row, permit, "CLOSED")
                    cur.execute(
                        "UPDATE [dbo].[WorkPermits] SET [CompletedAt]=SYSUTCDATETIME() WHERE [Id]=?",
                        permit_id,
                    )
                    _event(
                        cur,
                        row,
                        "CLOSED_BY_REQUESTER",
                        permit["cancellationNote"],
                        claims,
                    )
                    return _payload(cur, _get(cur, permit_id))
                raise HTTPException(status_code=409, detail="Only active permits can be closed or extended.")
            if body.action == "FINAL_CLOSURE":
                evaluation = body.payload.get("ownerEvaluation") or {}
                if not str(evaluation.get("feedback") or "").strip():
                    raise HTTPException(status_code=400, detail="Completion feedback is required.")
                if isinstance(body.payload.get("fireWatchChecks"), dict):
                    permit.setdefault("fireWatch", {})["checks"] = body.payload["fireWatchChecks"]
                if row.get("PermitType") == "HOT_WORK" and not all((permit.get("fireWatch") or {}).get("checks", {}).get(f"hour{i}") for i in range(1, 5)):
                    raise HTTPException(status_code=400, detail="Hot Work requires Fire Watch checks at hours 1, 2, 3, and 4.")
                permit["ownerEvaluation"] = evaluation
                status = "CLOSURE_REQUESTED"
                event, note = status, "Final closure submitted to HSE."
            elif body.action == "REQUEST_EXTENSION":
                extension = body.payload
                if len(str(extension.get("justification") or "").strip()) < 3:
                    raise HTTPException(status_code=400, detail="Extension justification is required.")
                try:
                    start = time.fromisoformat(str(extension["timeFrom"]))
                    end = time.fromisoformat(str(extension["timeTo"]))
                except (KeyError, ValueError) as exc:
                    raise HTTPException(status_code=400, detail="Valid extension start and end times are required.") from exc
                if end <= start:
                    raise HTTPException(status_code=400, detail="Extension end time must follow start time.")
                permit["extensionRequest"] = extension
                status = "EXTENSION_REQUESTED"
                event, note = status, str(extension["justification"]).strip()
            else:
                raise HTTPException(status_code=400, detail="Choose final closure or request extension.")
            _save_form(cur, row, permit, status)
            _event(cur, row, event, note, claims)
            return _payload(cur, _get(cur, permit_id))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP closure request failed")
        raise HTTPException(status_code=503, detail="Unable to submit the closure request.") from exc


@router.post("/work-permits/{permit_id}/confirm-closure")
def confirm_closure(permit_id: str, body: LifecycleWrite, claims: dict[str, Any] = Depends(current_user)) -> Any:
    try:
        with cursor() as cur:
            role = _role(cur, claims)
            _allow(role, {"ADMIN", "HSE"})
            row = _get(cur, permit_id)
            permit = _form(row)
            if row.get("Status") == "CLOSURE_REQUESTED":
                evaluation = body.payload.get("hseEvaluation") or {}
                if not str(evaluation.get("remarks") or "").strip():
                    raise HTTPException(status_code=400, detail="HSE completion inspection feedback is required.")
                permit["hseEvaluation"] = evaluation
                _save_form(cur, row, permit, "CLOSED")
                cur.execute("UPDATE [dbo].[WorkPermits] SET [CompletedAt]=SYSUTCDATETIME() WHERE [Id]=?", permit_id)
                _event(cur, row, "CLOSED", str(evaluation["remarks"]).strip(), claims)
                return _payload(cur, _get(cur, permit_id))
            if row.get("Status") != "EXTENSION_REQUESTED" or body.action != "APPROVE_EXTENSION":
                raise HTTPException(status_code=409, detail="There is no extension request to approve.")
            if role != "HSE":
                raise HTTPException(
                    status_code=403,
                    detail="Only HSE can approve a permit extension.",
                )
            extension = permit.get("extensionRequest") or {}
            extension_date, start, end, event_note, requires_gate_reverification = _apply_permit_extension(
                permit,
                extension,
                _name(cur, claims),
                datetime.now(timezone.utc),
            )
            status = "APPROVED" if requires_gate_reverification else "ACTIVE"
            _save_form(cur, row, permit, status)
            cur.execute(
                "UPDATE [dbo].[WorkPermits] SET [Status]=?,[WorkDate]=?,[StartDate]=?,[EndDate]=?,[TimeFrom]=?,[TimeTo]=?,[UpdatedAt]=SYSUTCDATETIME() WHERE [Id]=?",
                status,
                extension_date,
                extension_date,
                extension_date,
                start,
                end,
                permit_id,
            )
            _event(cur, row, "EXTENSION_APPROVED", event_note, claims)
            return _payload(cur, _get(cur, permit_id))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("EWP closure confirmation failed")
        raise HTTPException(status_code=503, detail="Unable to confirm the closure or extension.") from exc
