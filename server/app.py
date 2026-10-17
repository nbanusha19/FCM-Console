from __future__ import annotations

import json
import base64
import hashlib
import hmac
import html
import io
import os
import logging
import math
import re
import secrets
import smtplib
import ssl
import uuid
import urllib.parse
from datetime import date, datetime, time, timezone
from email.message import EmailMessage
from email.utils import make_msgid
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.responses import FileResponse, HTMLResponse

from config import settings
from database import cursor, rows_as_dicts
from email_templates import branded_email_html, otp_email_html
from security import create_access_token, current_user, hash_password, verify_password

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vms-api")

app = FastAPI(title="VMS1 Application API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


class LoginRequest(BaseModel):
    email: str
    password: str


class UserWrite(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str
    password: str | None = None
    role: str
    branchId: str | None = None
    employeeId: str | None = None
    phone: str | None = None
    status: str = "ACTIVE"


class BranchWrite(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    location: str | None = None
    phone: str | None = None
    email: str | None = None
    status: str = "ACTIVE"


class RoleWrite(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    status: str = "ACTIVE"


class RpcRequest(BaseModel):
    incident: str | None = Field(default=None, alias="_incident")
    status: str | None = Field(default=None, alias="_status")


class VisitRejectRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class VisitorTokenRequest(BaseModel):
    token: str = Field(min_length=32, max_length=128)


class VisitorCheckInOtpRequest(VisitorTokenRequest):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class VisitorCheckInOtpVerifyRequest(VisitorCheckInOtpRequest):
    code: str = Field(pattern=r"^\d{6}$")


class BranchGeofenceWrite(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radius_m: int = Field(default=100, alias="radiusM", ge=25, le=5000)


class HelpdeskFeedbackRequest(BaseModel):
    building_id: str = Field(alias="buildingId", min_length=1, max_length=100)
    area_id: str | None = Field(default=None, alias="areaId", max_length=100)
    feedback: str = Field(min_length=3, max_length=2000)
    rating: int = Field(ge=1, le=5)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class HelpdeskTicketFeedbackRequest(BaseModel):
    ticket_id: str = Field(alias="ticketId", min_length=1, max_length=100)
    feedback: str = Field(min_length=3, max_length=2000)
    rating: int = Field(ge=1, le=5)


class PublicHelpdeskOtpRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class PublicHelpdeskOtpVerifyRequest(PublicHelpdeskOtpRequest):
    code: str = Field(pattern=r"^\d{6}$")


class PublicHelpdeskTicketRequest(BaseModel):
    token: str = Field(min_length=32, max_length=4096)
    name: str = Field(min_length=1, max_length=200)
    area_id: str = Field(alias="areaId", min_length=1, max_length=100)
    category_id: str = Field(alias="categoryId", min_length=1, max_length=100)
    subcategory_id: str | None = Field(default=None, alias="subcategoryId", max_length=100)
    priority: str = "MEDIUM"
    description: str = Field(min_length=10, max_length=4000)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class PublicHelpdeskFeedbackRequest(BaseModel):
    token: str = Field(min_length=32, max_length=4096)
    ticket_id: str = Field(alias="ticketId", min_length=1, max_length=100)
    name: str = Field(default="", max_length=200)
    feedback: str = Field(min_length=3, max_length=2000)
    rating: int = Field(ge=1, le=5)


class EmergencyEmailResponseRequest(BaseModel):
    token: str = Field(min_length=32, max_length=2048)


class VisitorCardRequest(BaseModel):
    card_id: str = Field(min_length=1, max_length=200)
    gate: str = Field(default="Main gate", min_length=1, max_length=100)


class VmsNotificationReadRequest(BaseModel):
    ids: list[str] | None = Field(default=None, max_length=200)


class WorkPermitWriteRequest(BaseModel):
    permit: dict[str, Any]


class WorkPermitReviewRequest(BaseModel):
    hseValidation: dict[str, dict[str, Any]] = Field(default_factory=dict)
    note: str = ""


class WorkPermitRejectRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)


class WorkPermitGateRequest(BaseModel):
    grant: bool
    contractorIdCard: str = ""
    consent: bool = False
    reason: str = ""
    note: str = ""


class WorkPermitClosureRequest(BaseModel):
    action: str
    payload: dict[str, Any] = Field(default_factory=dict)


class HelpdeskAssignmentRequest(BaseModel):
    providerId: str = Field(min_length=1, max_length=100)


class IssueVisitorCardRequest(BaseModel):
    card_id: str = Field(min_length=1, max_length=200)


class QueryRequest(BaseModel):
    action: str = "select"
    data: dict[str, Any] | list[dict[str, Any]] | None = None
    filters: list[dict[str, Any]] = Field(default_factory=list)
    order: list[dict[str, Any]] = Field(default_factory=list)
    columns: str = "*"
    limit: int | None = None
    count: bool = False
    head: bool = False


# Logical names used by the current frontend are mapped only to known SQL objects.
TABLES: dict[str, tuple[str, str | None]] = {
    "profiles": ("AppUsers", None),
    "branches": ("Branches", None),
    "visit_requests": ("Visits", None),
    "visit_events": ("ModuleEvents", "VISIT"),
    "guest_cards": ("AppSettings", None),
    "visitor_types": ("AppSettings", None),
    "vms_locations": ("AppSettings", None),
    "emergencies": ("EvacuationIncidents", None),
    "emg_incident_employees": ("EvacuationResponses", None),
    "emg_activity": ("ModuleEvents", "EMERGENCY"),
    "emg_assembly_points": ("EvacSites", None),
    "emg_incident_types": ("AppSettings", None),
    "safety_reports": ("AppSettings", None),
    "work_permits": ("WorkPermits", None),
    "ewp_workers": ("WorkPermitWorkers", None),
    "ewp_attendance": ("WorkPermitAttendance", None),
    "ewp_events": ("ModuleEvents", "PERMIT"),
    "ewp_vendors": ("AppSettings", None),
    "ewp_locations": ("AppSettings", None),
    "hd_tickets": ("HelpdeskTickets", None),
    "hd_ticket_events": ("ModuleEvents", "HELPDESK"),
    "hd_evidence": ("FileUploads", "HELPDESK"),
    "hd_notifications": ("AppSettings", None),
    "hd_categories": ("AppSettings", None),
    "hd_subcategories": ("AppSettings", None),
    "hd_services": ("AppSettings", None),
    "hd_providers": ("AppSettings", None),
    "hd_buildings": ("AppSettings", None),
    "hd_building_floors": ("AppSettings", None),
    "hd_building_areas": ("AppSettings", None),
    "hd_feedback": ("AppSettings", None),
    "user_roles": ("AppSettings", None),
}


FIELD_OVERRIDES: dict[str, dict[str, str]] = {
    "profiles": {
        "id": "Id",
        "name": "Name",
        "email": "Email",
        "phone": "Phone",
        "department": "Department",
        "designation": "Designation",
        "ntid": "EmployeeNo",
        "building": "Building",
        "branch_id": "BranchId",
        "employee_id": "EmployeeNo",
        "role": "Role",
        "status": "IsActive",
        "is_active": "IsActive",
        "created_at": "CreatedAt",
        "updated_at": "UpdatedAt",
    },
    "branches": {
        "id": "Id", "code": "Code", "name": "Name", "address": "Address",
        "city": "City", "state": "State", "phone": "Phone", "email": "Email",
        "location": "Address",
        "manager_id": "ManagerUserId", "status": "IsActive", "active": "IsActive",
        "created_at": "CreatedAt",
    },
    "visit_requests": {
        "id": "Id", "request_no": "RequestNo", "visitor_code": "VisitorCode",
        "qr_token": "QrTokenHash", "visitor_name": "VisitorName",
        "visitor_employee_id": "VisitorEmployeeId",
        "visitor_branch_id": "VisitorBranchId",
        "visitor_type": "VisitorType", "company": "Company", "email": "Email",
        "phone": "Phone", "designation": "Designation", "purpose": "Purpose",
        "host_id": "HostUserId", "host_name": "HostName",
        "host_department": "HostDepartment", "location": "Location",
        "visit_date": "VisitDate", "expected_arrival": "ExpectedArrival",
        "expected_departure": "ExpectedDeparture", "source": "Source",
        "status": "Status", "requested_by": "RequestedByUserId",
        "requested_by_name": "RequestedByName", "reviewed_by_name": "ReviewedByName",
        "reviewed_at": "ReviewedAt", "rejection_reason": "RejectionReason",
        "cancelled_at": "CancelledAt", "invitation_sent_at": "InvitationSentAt",
        "arrival_gate": "ArrivalGate", "arrived_at": "ArrivedAt",
        "arrived_by_name": "ArrivedByName", "checked_in_at": "CheckedInAt",
        "checked_in_by_name": "CheckedInByName", "checked_out_at": "CheckedOutAt",
        "checked_out_by_name": "CheckedOutByName", "remarks": "Remarks",
        "created_at": "CreatedAt", "updated_at": "UpdatedAt",
        "guest_card_id": "GuestCardNumber",
    },
    "emergencies": {
        "id": "Id", "incident_no": "IncidentNo", "emergency_type": "EmergencyType",
        "title": "Title", "location": "Location", "building": "Building",
        "floor": "Floor", "area": "Area", "description": "Description",
        "remark": "Description", "assembly_point": "AssemblyPoint",
        "assembly_point_id": "SiteId", "status": "Status",
        "triggered_by": "TriggeredByUserId", "triggered_by_name": "TriggeredByName",
        "triggered_at": "TriggeredAt", "resolved_at": "ClosedAt",
        "resolved_by_name": "ClosedByName", "stopped_at": "ClosedAt",
        "stopped_by_name": "ClosedByName", "closed_at": "ClosedAt",
        "closed_by_name": "ClosedByName", "created_at": "TriggeredAt",
    },
    "emg_incident_employees": {
        "id": "Id", "incident_id": "IncidentId", "employee_id": "UserId",
        "safety_status": "SafetyStatus", "assistance_status": "AssistanceStatus",
        "notification_status": "NotificationStatus", "read_at": "ReadAt",
        "response_time": "RespondedAt", "handled_at": "HandledAt",
        "handled_by_name": "HandledByName", "employee_ntid": "EmployeeNtId",
        "created_at": "CreatedAt",
    },
    "safety_reports": {
        "id": "id", "emergency_id": "emergency_id", "person_id": "person_id",
        "person_name": "person_name", "status": "status",
        "reported_by": "reported_by", "reported_by_name": "reported_by_name",
        "recorded_at": "recorded_at",
    },
    "emg_assembly_points": {
        "id": "Id", "name": "Name", "location": "Location",
        "description": "Description", "active": "IsActive",
        "created_at": "CreatedAt",
    },
    "work_permits": {
        "id": "Id", "permit_no": "PermitNo", "permit_type": "PermitType",
        "status": "Status", "contractor": "Contractor", "vendor_id": "VendorId",
        "vendor_name": "VendorName", "vendor_email": "VendorEmail",
        "location": "Location", "service": "Service",
        "work_description": "WorkDescription", "additional_details": "AdditionalDetails",
        "precautions": "Precautions", "work_date": "WorkDate",
        "start_date": "StartDate", "end_date": "EndDate", "time_from": "TimeFrom",
        "time_to": "TimeTo", "workmen_count": "WorkmenCount",
        "worker_count": "WorkerCount", "supervisor_name": "SupervisorName",
        "supervisor_mobile": "SupervisorMobile", "raised_by": "RaisedByUserId",
        "raised_by_name": "RaisedByName", "approved_by_name": "ApprovedByName",
        "approved_at": "ApprovedAt", "reviewed_by_name": "ReviewedByName",
        "reviewed_at": "ReviewedAt", "review_note": "ReviewNote",
        "rejection_reason": "RejectionReason", "rejected_by_name": "ReviewedByName",
        "rejected_at": "ReviewedAt", "arrived_by_name": "RaisedByName",
        "arrived_at": "ArrivedAt", "completed_at": "CompletedAt",
        "vendor_notified_at": "ApprovedAt", "vendor_submitted_at": "ReviewedAt",
        "vendor_start_date": "StartDate", "vendor_end_date": "EndDate",
        "vendor_token": "VendorTokenHash", "vendor_token_expires_at": "VendorTokenExpiresAt",
        "form_data": "FormData",
        "created_at": "CreatedAt", "updated_at": "UpdatedAt",
    },
    "ewp_workers": {
        "id": "Id", "permit_id": "PermitId", "worker_ref": "WorkerRef",
        "name": "Name", "contact": "Contact", "pass_no": "PassNo",
        "registered_at": "RegisteredAt", "registered_by_name": "RegisteredByName",
        "created_at": "CreatedAt",
    },
    "ewp_attendance": {
        "id": "Id", "permit_id": "PermitId", "worker_id": "WorkerId",
        "day": "WorkDay", "check_in_at": "CheckInAt", "check_in_by_name": "CheckInByName",
        "check_out_at": "CheckOutAt", "check_out_by_name": "CheckOutByName",
    },
    "hd_tickets": {
        "id": "Id", "ticket_no": "TicketNo", "raiser_id": "RaisedByUserId",
        "raiser_name": "RaisedByName", "raiser_email": "RaisedByEmail",
        "category_id": "Category", "category_name": "Category",
        "subcategory_id": "Subcategory", "subcategory_name": "Subcategory",
        "service_id": "ServiceName", "service_name": "ServiceName",
        "provider_id": "ProviderName", "provider_name": "ProviderName",
        "description": "Description", "location": "Location", "priority": "Priority",
        "branch_id": "BranchId", "building_id": "BuildingId",
        "building_area_id": "BuildingAreaId", "floor_name": "FloorName",
        "area_name": "AreaName",
        "status": "Status",
        "assigned_at": "AssignedAt", "closed_at": "ClosedAt",
        "closed_by_name": "ClosedByName", "created_at": "CreatedAt",
        "updated_at": "UpdatedAt",
    },
    "hd_evidence": {
        "id": "Id", "ticket_id": "RecordId", "file_name": "FileName",
        "file_url": "StoragePath", "uploaded_by": "UploadedByUserId",
        "uploaded_by_name": "UploadedByName", "created_at": "UploadedAt",
    },
}

IDENTIFIER = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
ROLE_ADMIN = {"ADMIN"}
HELPDESK_PRIORITIES = {"HIGH", "MEDIUM", "LOW"}
VISITOR_TYPE_CODES = {"EMPLOYEE", "EXTERNAL"}
UNSTORED_FIELDS: dict[str, set[str]] = {
    "emergencies": {"assembly_point"},
    "emg_incident_employees": {
        "employee_name", "employee_email", "department", "employee_ntid",
        "building", "reported_by_name", "reporter_id",
    },
    "hd_evidence": {"uploaded_by_name"},
    "hd_tickets": {"_building_id", "_area_id", "_latitude", "_longitude"},
}


def _snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def _json_value(value: Any) -> Any:
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def _encode_row(row: dict[str, Any]) -> dict[str, Any]:
    return {_snake(key): _json_value(value) for key, value in row.items()}


def _table_name(logical: str) -> tuple[str, str | None]:
    if logical not in TABLES:
        raise HTTPException(status_code=404, detail=f"Unknown application table: {logical}")
    physical, module = TABLES[logical]
    return f"[dbo].[{physical}]", module


def _next_helpdesk_ticket_no(cur: Any, year: int | None = None) -> str:
    ticket_year = year or datetime.now().year
    cur.execute(
        """
        SET NOCOUNT ON;
        DECLARE @lock_result int;
        EXEC @lock_result = sys.sp_getapplock
            @Resource = ?,
            @LockMode = 'Exclusive',
            @LockOwner = 'Transaction',
            @LockTimeout = 10000;
        SELECT @lock_result;
        """,
        f"HelpdeskTicketNo:{ticket_year}",
    )
    lock_result = cur.fetchone()
    if not lock_result or int(lock_result[0]) < 0:
        raise RuntimeError("Unable to acquire the Helpdesk ticket-number lock.")
    cur.execute(
        """
        SELECT ISNULL(MAX(TRY_CONVERT(bigint, SUBSTRING([TicketNo], 9, 50))), 0) + 1
        FROM [dbo].[HelpdeskTickets]
        WHERE [TicketNo] LIKE ?
        """,
        f"HD-{ticket_year}-%",
    )
    next_number = cur.fetchone()
    if not next_number or next_number[0] is None:
        raise RuntimeError("Unable to generate a Helpdesk ticket number.")
    return f"HD-{ticket_year}-{int(next_number[0]):05d}"


def _next_emergency_incident_no(cur: Any, year: int | None = None) -> str:
    incident_year = year or datetime.now().year
    cur.execute(
        """
        SET NOCOUNT ON;
        DECLARE @lock_result int;
        EXEC @lock_result = sys.sp_getapplock
            @Resource = ?,
            @LockMode = 'Exclusive',
            @LockOwner = 'Transaction',
            @LockTimeout = 10000;
        SELECT @lock_result;
        """,
        f"EmergencyIncidentNo:{incident_year}",
    )
    lock_result = cur.fetchone()
    if not lock_result or int(lock_result[0]) < 0:
        raise RuntimeError("Unable to acquire the emergency incident-number lock.")
    cur.execute(
        """
        SELECT ISNULL(MAX(TRY_CONVERT(bigint, SUBSTRING([IncidentNo], 10, 50))), 0) + 1
        FROM [dbo].[EvacuationIncidents]
        WHERE [IncidentNo] LIKE ?
        """,
        f"EMG-{incident_year}-%",
    )
    next_number = cur.fetchone()
    if not next_number or next_number[0] is None:
        raise RuntimeError("Unable to generate an emergency incident number.")
    return f"EMG-{incident_year}-{int(next_number[0]):05d}"


def _helpdesk_priority(value: Any) -> str:
    priority = str(value or "MEDIUM").strip().upper()
    if priority not in HELPDESK_PRIORITIES:
        raise HTTPException(
            status_code=400,
            detail="Priority must be High, Medium, or Low.",
        )
    return priority


def _field(logical: str, name: str, module: str | None) -> str:
    if not IDENTIFIER.fullmatch(name):
        raise HTTPException(status_code=400, detail="Invalid column name.")
    if logical == "hd_evidence" and name == "uploaded_by_name":
        raise HTTPException(status_code=400, detail="Uploader names are derived from the user directory.")
    mapped = FIELD_OVERRIDES.get(logical, {}).get(name)
    if mapped is None:
        mapped = "".join(part[:1].upper() + part[1:] for part in name.split("_"))
    if module:
        if name in {"visit_id", "incident_id", "permit_id", "ticket_id"}:
            mapped = "RecordId"
        elif name in {"event", "action"}:
            mapped = "Action"
        elif name in {"note", "description"}:
            mapped = "Note"
        elif name in {"actor_id", "performed_by"}:
            mapped = "ActorUserId"
        elif name in {"actor_name", "performed_by_name"}:
            mapped = "ActorName"
        elif name in {"created_at", "at"}:
            mapped = "CreatedAt"
    if logical == "hd_evidence" and name == "created_at":
        mapped = "UploadedAt"
    if logical == "profiles" and name == "status":
        return "IsActive"
    if logical == "profiles" and name == "building":
        raise HTTPException(status_code=400, detail="Building is not a stored user field.")
    return mapped


def _db_value(logical: str, name: str, value: Any) -> Any:
    if logical in {"profiles", "branches"} and name in {"status", "active", "is_active"}:
        if name == "status":
            return str(value).upper() == "ACTIVE"
        return bool(value)
    if logical == "visit_requests" and name == "qr_token" and value:
        return hashlib.sha256(str(value).encode()).hexdigest()
    if logical == "work_permits" and name == "form_data" and isinstance(value, (dict, list)):
        return json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    return value


def _new_visitor_code() -> str:
    return "".join(
        secrets.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") for _ in range(6)
    )


def _prepare_visit_insert(row_data: dict[str, Any]) -> dict[str, Any]:
    prepared = dict(row_data)
    year = datetime.now().year
    if not prepared.get("request_no"):
        prepared["request_no"] = f"REQ-{year}-{uuid.uuid4().hex[:12].upper()}"
    if not prepared.get("visitor_code"):
        prepared["visitor_code"] = _new_visitor_code()
    if not prepared.get("qr_token"):
        prepared["qr_token"] = secrets.token_urlsafe(32)
    return prepared


def _validate_visit_schedule(row_data: dict[str, Any], now: datetime | None = None) -> None:
    visit_date_value = row_data.get("visit_date")
    arrival_value = row_data.get("expected_arrival")
    if not visit_date_value or not arrival_value:
        return
    try:
        visit_date = (
            visit_date_value.date()
            if isinstance(visit_date_value, datetime)
            else date.fromisoformat(str(visit_date_value)[:10])
        )
        arrival = (
            arrival_value
            if isinstance(arrival_value, time)
            else time.fromisoformat(str(arrival_value))
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Enter a valid visit date and start time.") from exc

    current = now or datetime.now(ZoneInfo("Asia/Kolkata"))
    if current.tzinfo is not None:
        current = current.astimezone(ZoneInfo("Asia/Kolkata")).replace(tzinfo=None)
    if visit_date < current.date():
        raise HTTPException(status_code=400, detail="Visit date cannot be in the past.")
    if visit_date == current.date() and arrival <= current.time().replace(second=0, microsecond=0):
        raise HTTPException(
            status_code=400,
            detail="Invalid time. Please select a proper time schedule.",
        )


def _apply_internal_visitor(cur: Any, row_data: dict[str, Any]) -> None:
    if row_data.get("visitor_type") != "EMPLOYEE":
        row_data.pop("visitor_employee_id", None)
        row_data.pop("visitor_branch_id", None)
        return

    employee_id = str(row_data.get("visitor_employee_id") or "").strip()
    branch_id = str(row_data.get("visitor_branch_id") or "").strip()
    if not employee_id or not branch_id:
        raise HTTPException(
            status_code=400,
            detail="Choose the internal visitor's branch and employee.",
        )

    cur.execute(
        """
        SELECT employee.[Id], employee.[Name], employee.[Email], employee.[Phone],
               employee.[Department], employee.[Designation], employee.[BranchId],
               branch.[Name] AS [BranchName]
        FROM [dbo].[AppUsers] AS employee
        INNER JOIN [dbo].[Branches] AS branch ON branch.[Id] = employee.[BranchId]
        WHERE employee.[Id] = ? AND employee.[IsActive] = 1
          AND branch.[IsActive] = 1
        """,
        employee_id,
    )
    employee = cur.fetchone()
    if employee is None or str(employee.BranchId) != branch_id:
        raise HTTPException(
            status_code=400,
            detail="The selected internal visitor is no longer active in that branch.",
        )

    cur.execute(
        """
        SELECT TOP (1) [Id]
        FROM [dbo].[Branches]
        WHERE [IsActive] = 1 AND ([Name] = ? OR [Address] = ?)
        """,
        row_data.get("location"),
        row_data.get("location"),
    )
    destination = cur.fetchone()
    if destination is None:
        raise HTTPException(status_code=400, detail="Choose a valid visit branch.")
    if str(destination.Id) == branch_id:
        raise HTTPException(
            status_code=400,
            detail="Internal visitors must be from the branch other than the visit location.",
        )
    email = str(employee.Email or "").strip()
    phone = str(employee.Phone or "").strip()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(
            status_code=400,
            detail="The selected employee's directory profile needs a valid email address.",
        )
    phone_digits = re.sub(r"\D", "", phone)
    if len(phone_digits) < 8 or len(phone_digits) > 15:
        raise HTTPException(
            status_code=400,
            detail="The selected employee's directory profile needs a valid phone number.",
        )

    row_data.update(
        visitor_employee_id=employee_id,
        visitor_branch_id=branch_id,
        visitor_name=str(employee.Name or ""),
        email=email,
        phone=phone,
        designation=str(employee.Designation or ""),
        company=str(employee.BranchName or ""),
    )


def _visitor_checkin_url(token: str) -> str:
    origin = settings.public_app_url
    parsed = urllib.parse.urlsplit(origin)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        raise RuntimeError("Set PUBLIC_APP_URL to the public client URL before sending visitor invitations.")
    if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError("PUBLIC_APP_URL must use HTTPS outside local development.")
    return f"{origin.rstrip('/')}/gate/{urllib.parse.quote(token, safe='')}/verify"


def _visitor_qr_token(visit_id: str) -> str:
    if not settings.jwt_secret or len(settings.jwt_secret) < 32:
        raise RuntimeError("Configure JWT_SECRET with at least 32 characters.")
    return hmac.new(
        settings.jwt_secret.encode(),
        f"vms-visitor-pass:{visit_id}".encode(),
        hashlib.sha256,
    ).hexdigest()


def _send_visitor_invitation(visit: dict[str, Any], token: str) -> str:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError(
            "Visitor email is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL on the API host."
        )
    if settings.smtp_use_tls and settings.smtp_use_ssl:
        raise RuntimeError("Configure either SMTP_USE_TLS or SMTP_USE_SSL, not both.")
    if bool(settings.smtp_username) != bool(settings.smtp_password):
        raise RuntimeError("Set both SMTP_USERNAME and SMTP_PASSWORD, or leave both empty.")

    import qrcode

    url = _visitor_checkin_url(token)
    qr = qrcode.make(url)
    image = io.BytesIO()
    qr.save(image, format="PNG")

    visitor_name = str(visit.get("name") or visit.get("visitor_name") or "Visitor")
    visit_date = str(visit.get("visitDate") or visit.get("visit_date") or "")
    arrival = str(visit.get("expectedArrival") or visit.get("expected_arrival") or "")
    departure = str(visit.get("expectedDeparture") or visit.get("expected_departure") or "")
    location = str(visit.get("location") or "")
    host = str(visit.get("hostName") or visit.get("host_name") or visit.get("hostEmployeeId") or "")
    purpose = str(visit.get("purpose") or "")
    request_no = str(visit.get("requestId") or visit.get("request_no") or "")
    visitor_code = str(visit.get("visitorId") or visit.get("visitor_code") or "")
    safe = lambda value: html.escape(value, quote=True)

    text = "\n".join(
        [
            f"Dear {visitor_name},",
            "",
            "Your visit request has been approved.",
            f"Date: {visit_date}",
            f"Time: {arrival} - {departure}",
            f"Location: {location}",
            f"Host: {host}",
            f"Purpose: {purpose}",
            f"Request: {request_no}",
            f"Visitor ID: {visitor_code}",
            "",
            f"Open your secure visitor pass and check in: {url}",
        ]
    )
    html_body = branded_email_html(
        "Visitor Management",
        "Your visit is approved",
        f"<p>Dear {safe(visitor_name)},</p>"
        "<p>Your visit request has been approved.</p>"
        f"<p><strong>Date:</strong> {safe(visit_date)}<br>"
        f"<strong>Time:</strong> {safe(arrival)} - {safe(departure)}<br>"
        f"<strong>Location:</strong> {safe(location)}<br>"
        f"<strong>Host:</strong> {safe(host)}<br>"
        f"<strong>Purpose:</strong> {safe(purpose)}<br>"
        f"<strong>Request:</strong> {safe(request_no)}<br>"
        f"<strong>Visitor ID:</strong> {safe(visitor_code)}</p>"
        f'<p><a href="{safe(url)}" style="display:inline-block;padding:12px 20px;'
        'background-color:#155eef;color:#ffffff;text-decoration:none;'
        'font-weight:bold;border-radius:6px">Check in now</a></p>'
        '<p><img src="cid:visitor-qr" alt="Visitor check-in QR code" '
        'width="220" height="220"></p>',
        preheader=f"Your visit to {location} has been approved.",
    )
    message = EmailMessage()
    message["Subject"] = f"Your visit is approved - {visit_date}"
    message["From"] = settings.smtp_from_email
    message["To"] = str(visit["email"])
    message["Message-ID"] = make_msgid()
    message.set_content(text)
    message.add_alternative(html_body, subtype="html")
    message.get_payload()[-1].add_related(
        image.getvalue(),
        maintype="image",
        subtype="png",
        cid="<visitor-qr>",
        filename="visitor-check-in-qr.png",
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
        raise RuntimeError("The SMTP server could not accept the visitor invitation.") from exc
    return str(message["Message-ID"])


def _emergency_response_url() -> str:
    origin = settings.public_app_url
    parsed = urllib.parse.urlsplit(origin)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        raise RuntimeError("Set PUBLIC_APP_URL to the client URL before sending emergency alerts.")
    if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError("PUBLIC_APP_URL must use HTTPS outside local development.")
    return f"{origin.rstrip('/')}/emergency"


def _emergency_email_response_token(
    incident_id: str, user_id: str, status: str, expires: int | None = None
) -> str:
    if not settings.jwt_secret or len(settings.jwt_secret) < 32:
        raise RuntimeError("Configure JWT_SECRET with at least 32 characters.")
    if status not in {"SAFE", "NEEDS_ASSISTANCE"}:
        raise ValueError("Invalid emergency response status.")
    payload = json.dumps(
        {
            "incident": incident_id,
            "user": user_id,
            "status": status,
            "exp": expires or int(datetime.now(timezone.utc).timestamp()) + 7 * 24 * 60 * 60,
        },
        separators=(",", ":"),
    ).encode()
    encoded = base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")
    signature = hmac.new(
        settings.jwt_secret.encode(), encoded.encode(), hashlib.sha256
    ).hexdigest()
    return f"{encoded}.{signature}"


def _decode_emergency_email_response_token(token: str) -> dict[str, Any]:
    try:
        if not settings.jwt_secret or len(settings.jwt_secret) < 32:
            raise ValueError("Emergency response signing is not configured.")
        encoded, signature = token.split(".", 1)
        expected = hmac.new(
            settings.jwt_secret.encode(), encoded.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("Invalid emergency response signature.")
        payload = json.loads(
            base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        )
        if int(payload["exp"]) <= int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("Emergency response link has expired.")
        if (
            not isinstance(payload.get("incident"), str)
            or not payload["incident"]
            or not isinstance(payload.get("user"), str)
            or not payload["user"]
            or payload.get("status") not in {"SAFE", "NEEDS_ASSISTANCE"}
        ):
            raise ValueError("Invalid emergency response token data.")
        return payload
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=403, detail="This emergency response link is invalid or expired."
        ) from exc


def _emergency_email_response_url(token: str) -> str:
    api_origin = settings.api_public_url
    parsed = urllib.parse.urlsplit(api_origin)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        raise RuntimeError("Set API_PUBLIC_URL to the public API URL before sending emergency alerts.")
    if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError("API_PUBLIC_URL must use HTTPS outside local development.")
    return (
        f"{api_origin.rstrip('/')}/emergencies/email-response?"
        f"{urllib.parse.urlencode({'token': token})}"
    )


def _send_emergency_response_email(recipient: dict[str, Any], incident: dict[str, Any]) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("Emergency email is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL.")
    if settings.smtp_use_tls and settings.smtp_use_ssl:
        raise RuntimeError("Configure either SMTP_USE_TLS or SMTP_USE_SSL, not both.")
    if bool(settings.smtp_username) != bool(settings.smtp_password):
        raise RuntimeError("Set both SMTP_USERNAME and SMTP_PASSWORD, or leave both empty.")

    safe_response_url = _emergency_email_response_url(
        _emergency_email_response_token(
            str(incident["Id"]), str(recipient["Id"]), "SAFE"
        )
    )
    support_response_url = _emergency_email_response_url(
        _emergency_email_response_token(
            str(incident["Id"]), str(recipient["Id"]), "NEEDS_ASSISTANCE"
        )
    )
    response_url = _emergency_response_url()
    name = str(recipient.get("Name") or "Colleague")
    location = ", ".join(
        str(value)
        for value in (
            incident.get("Location"),
            incident.get("Building"),
            incident.get("Floor"),
            incident.get("Area"),
        )
        if value
    )
    title = str(incident.get("Title") or incident.get("EmergencyType") or "Emergency")
    assembly = str(incident.get("AssemblyPoint") or "the designated safe assembly point")
    safe = lambda value: html.escape(str(value), quote=True)
    message = EmailMessage()
    message["Subject"] = f"EMERGENCY ALERT: {title}"
    message["From"] = settings.smtp_from_email
    message["To"] = str(recipient["Email"])
    message["Message-ID"] = make_msgid()
    message.set_content(
        "\n".join(
            [
                f"Hello {name},",
                "",
                f"An emergency has been declared: {title}.",
                f"Location: {location}",
                f"Proceed to: {assembly}",
                "",
                "Evacuate immediately using the nearest safe route. Do not use elevators.",
                "Choose your response using one of these secure links:",
                f"I'm safe: {safe_response_url}",
                f"I need support: {support_response_url}",
                f"Emergency response: {response_url}",
            ]
        )
    )
    message.add_alternative(
        branded_email_html(
            "Emergency Evacuation",
            title,
            f"<p>Hello {safe(name)},</p>"
            f"<p><strong>Emergency:</strong> {safe(title)}<br>"
            f"<strong>Location:</strong> {safe(location)}<br>"
            f"<strong>Proceed to:</strong> {safe(assembly)}</p>"
            "<p><strong>Evacuate immediately using the nearest safe route. Do not use elevators.</strong></p>"
            "<p>Choose one response below. You will be asked to confirm it before it is recorded.</p>"
            f'<p><a href="{safe(safe_response_url)}" '
            'style="display:inline-block;margin-right:8px;padding:12px 18px;'
            'background:#15803d;color:#ffffff;text-decoration:none;font-weight:bold;'
            'border-radius:6px">I AM SAFE</a>'
            f'<a href="{safe(support_response_url)}" '
            'style="display:inline-block;padding:12px 18px;background:#b91c1c;'
            'color:#ffffff;text-decoration:none;font-weight:bold;border-radius:6px">'
            "I NEED SUPPORT</a></p>"
            "<p>Your response will be recorded against your account.</p>"
            f'<p><a href="{safe(response_url)}" style="color:#155eef;font-weight:bold">'
            "Open emergency response</a></p>",
            preheader=f"Urgent: {title}. Evacuate and record your response.",
            accent="#b42318",
        ),
        subtype="html",
    )
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


def _send_helpdesk_ticket_email(
    recipient: dict[str, Any], ticket: dict[str, Any]
) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("Helpdesk email is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL.")
    if settings.smtp_use_tls and settings.smtp_use_ssl:
        raise RuntimeError("Configure either SMTP_USE_TLS or SMTP_USE_SSL, not both.")
    if bool(settings.smtp_username) != bool(settings.smtp_password):
        raise RuntimeError("Set both SMTP_USERNAME and SMTP_PASSWORD, or leave both empty.")

    ticket_no = str(ticket.get("ticket_no") or ticket.get("id") or "New ticket")
    ticket_url = None
    if settings.public_app_url:
        ticket_url = urllib.parse.urljoin(
            settings.public_app_url.rstrip("/") + "/",
            f"hd-ticket/{urllib.parse.quote(str(ticket.get('id') or ''), safe='')}",
        )
    safe = lambda value: html.escape(str(value or ""), quote=True)
    message = EmailMessage()
    message["Subject"] = f"New Helpdesk ticket — {ticket_no}"
    message["From"] = settings.smtp_from_email
    message["To"] = str(recipient["Email"]).strip()
    body = (
        f"A new Helpdesk ticket has been created.\n\n"
        f"Ticket: {ticket_no}\n"
        f"Category: {ticket.get('category_name') or ''}\n"
        f"Sub-category: {ticket.get('subcategory_name') or 'General'}\n"
        f"Service: {ticket.get('service_name') or ''}\n"
        f"Location: {ticket.get('location') or ''}\n"
        f"Priority: {ticket.get('priority') or ''}\n"
        f"Raised by: {ticket.get('raiser_name') or ''}\n"
        f"Description: {ticket.get('description') or ''}\n"
    )
    if ticket_url:
        body += f"\nOpen ticket: {ticket_url}\n"
    message.set_content(body)
    message.add_alternative(
        branded_email_html(
            "Helpdesk",
            f"New ticket {ticket_no}",
            "<p>A new Helpdesk ticket has been created.</p>"
            f"<p><strong>Ticket:</strong> {safe(ticket_no)}<br>"
            f"<strong>Category:</strong> {safe(ticket.get('category_name'))}<br>"
            f"<strong>Sub-category:</strong> {safe(ticket.get('subcategory_name') or 'General')}<br>"
            f"<strong>Service:</strong> {safe(ticket.get('service_name'))}<br>"
            f"<strong>Location:</strong> {safe(ticket.get('location'))}<br>"
            f"<strong>Priority:</strong> {safe(ticket.get('priority'))}<br>"
            f"<strong>Raised by:</strong> {safe(ticket.get('raiser_name'))}</p>"
            f"<p>{safe(ticket.get('description'))}</p>"
            + (
                f'<p><a href="{safe(ticket_url)}" style="display:inline-block;padding:12px 20px;'
                'background-color:#155eef;color:#ffffff;text-decoration:none;font-weight:bold;'
                f'border-radius:6px">Open ticket</a></p>'
                if ticket_url
                else ""
            ),
            preheader=f"New Helpdesk ticket {ticket_no} requires attention.",
        ),
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
        raise RuntimeError("The SMTP server could not accept the Helpdesk ticket email.") from exc


def _send_helpdesk_closed_ticket_emails(
    recipients: list[dict[str, Any]], ticket: dict[str, Any]
) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        logger.error(
            "Helpdesk closure email is not configured for ticket %s",
            ticket.get("ticket_no") or ticket.get("id"),
        )
        return
    if settings.smtp_use_tls and settings.smtp_use_ssl:
        logger.error("Configure either SMTP_USE_TLS or SMTP_USE_SSL, not both.")
        return
    if bool(settings.smtp_username) != bool(settings.smtp_password):
        logger.error("Set both SMTP_USERNAME and SMTP_PASSWORD, or leave both empty.")
        return

    ticket_no = str(ticket.get("ticket_no") or ticket.get("id") or "Helpdesk ticket")
    app_ticket_url = None
    if settings.public_app_url:
        app_ticket_url = urllib.parse.urljoin(
            settings.public_app_url.rstrip("/") + "/",
            f"hd-ticket/{urllib.parse.quote(str(ticket.get('id') or ''), safe='')}",
        )
    feedback_url = None
    if settings.public_app_url and ticket.get("building_id"):
        feedback_url = urllib.parse.urljoin(
            settings.public_app_url.rstrip("/") + "/",
            "hd-raise?"
            + urllib.parse.urlencode({"building": str(ticket["building_id"])}),
        )

    safe = lambda value: html.escape(str(value or ""), quote=True)
    unique_recipients: dict[str, dict[str, Any]] = {}
    for recipient in recipients:
        email = str(recipient.get("Email") or "").strip()
        if email:
            key = email.casefold()
            if key not in unique_recipients:
                unique_recipients[key] = {**recipient, "Email": email}
            else:
                for marker in ("PublicRequester", "TicketRaiser"):
                    if recipient.get(marker):
                        unique_recipients[key][marker] = True

    for recipient in unique_recipients.values():
        ticket_url = app_ticket_url
        if recipient.get("PublicRequester"):
            ticket_url = None
            if settings.public_app_url and ticket.get("building_id") and ticket.get("id"):
                ticket_url = urllib.parse.urljoin(
                    settings.public_app_url.rstrip("/") + "/",
                    "hd-raise?"
                    + urllib.parse.urlencode(
                        {
                            "building": str(ticket["building_id"]),
                            "ticket": str(ticket["id"]),
                        }
                    ),
                )
        recipient_feedback_url = feedback_url
        if (
            recipient.get("TicketRaiser")
            and settings.public_app_url
            and ticket.get("building_id")
            and ticket.get("id")
        ):
            recipient_feedback_url = urllib.parse.urljoin(
                settings.public_app_url.rstrip("/") + "/",
                "hd-raise?"
                + urllib.parse.urlencode(
                    {
                        "building": str(ticket["building_id"]),
                        "ticket": str(ticket["id"]),
                    }
                ),
            )
            ticket_url = None
        message = EmailMessage()
        message["Subject"] = f"Helpdesk ticket closed — {ticket_no}"
        message["From"] = settings.smtp_from_email
        message["To"] = recipient["Email"]
        body = (
            f"Hello {recipient.get('Name') or 'there'},\n\n"
            f"Helpdesk ticket {ticket_no} has been resolved and closed.\n"
            f"We'd love to hear your feedback about the work.\n"
        )
        if ticket_url:
            body += f"\nView ticket: {ticket_url}\n"
        if recipient_feedback_url:
            body += f"Share feedback: {recipient_feedback_url}\n"
        message.set_content(body)
        message.add_alternative(
            branded_email_html(
                "Helpdesk",
                f"Ticket {ticket_no} closed",
                f"<p>Hello {safe(recipient.get('Name') or 'there')},</p>"
                f"<p>Helpdesk ticket <strong>{safe(ticket_no)}</strong> has been resolved and closed.</p>"
                "<p>We'd love to hear your feedback about the work.</p>"
                + (
                    f'<p><a href="{safe(ticket_url)}" style="display:inline-block;padding:12px 20px;'
                    'background-color:#155eef;color:#ffffff;text-decoration:none;font-weight:bold;'
                    f'border-radius:6px">View ticket</a></p>'
                    if ticket_url
                    else ""
                )
                + (
                    f'<p><a href="{safe(recipient_feedback_url)}" style="display:inline-block;padding:12px 20px;'
                    'background-color:#e8f0ff;color:#155eef;text-decoration:none;font-weight:bold;'
                    f'border-radius:6px">Share your feedback</a></p>'
                    if recipient_feedback_url
                    else ""
                ),
                preheader=f"Helpdesk ticket {ticket_no} has been resolved and closed.",
            ),
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
        except (OSError, smtplib.SMTPException, RuntimeError):
            logger.exception(
                "Helpdesk closure email delivery failed for ticket %s and recipient %s",
                ticket_no,
                recipient["Email"],
            )


def _prepare_branch_manager_visit(
    row_data: dict[str, Any], manager_name: str, manages_location: bool
) -> dict[str, Any]:
    prepared = dict(row_data)
    prepared["status"] = "APPROVED" if manages_location else "PENDING"
    if manages_location:
        prepared["reviewed_by_name"] = manager_name
        prepared["reviewed_at"] = datetime.now(timezone.utc).replace(tzinfo=None)
    else:
        prepared.pop("reviewed_by_name", None)
        prepared.pop("reviewed_at", None)
    return prepared


def _prepare_admin_visit(row_data: dict[str, Any], admin_name: str) -> dict[str, Any]:
    prepared = dict(row_data)
    prepared["status"] = "APPROVED"
    prepared["reviewed_by_name"] = admin_name
    prepared["reviewed_at"] = datetime.now(timezone.utc).replace(tzinfo=None)
    return prepared


def _visitor_email_decision_token(
    visit_id: str,
    manager_id: str,
    action: str,
    expires: int | None = None,
) -> str:
    if not settings.jwt_secret or len(settings.jwt_secret) < 32:
        raise RuntimeError("Configure JWT_SECRET with at least 32 characters.")
    if action not in {"APPROVE", "REJECT"}:
        raise ValueError("Invalid visitor request action.")
    payload = json.dumps(
        {
            "visit": visit_id,
            "manager": manager_id,
            "action": action,
            "exp": expires or int(datetime.now(timezone.utc).timestamp()) + 48 * 60 * 60,
        },
        separators=(",", ":"),
    ).encode()
    encoded = base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")
    signature = hmac.new(
        settings.jwt_secret.encode(), encoded.encode(), hashlib.sha256
    ).hexdigest()
    return f"{encoded}.{signature}"


def _decode_visitor_email_decision_token(token: str) -> dict[str, Any]:
    try:
        if not settings.jwt_secret or len(settings.jwt_secret) < 32:
            raise ValueError("Visitor request signing is not configured.")
        encoded, signature = token.split(".", 1)
        expected = hmac.new(
            settings.jwt_secret.encode(), encoded.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("Invalid visitor request signature.")
        payload = json.loads(
            base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        )
        if int(payload["exp"]) <= int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("Visitor request link has expired.")
        if (
            not isinstance(payload.get("visit"), str)
            or not payload["visit"]
            or not isinstance(payload.get("manager"), str)
            or not payload["manager"]
            or payload.get("action") not in {"APPROVE", "REJECT"}
        ):
            raise ValueError("Invalid visitor request token data.")
        return payload
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=403, detail="This visitor approval link is invalid or expired."
        ) from exc


def _visitor_email_decision_url(token: str) -> str:
    api_origin = settings.api_public_url
    parsed = urllib.parse.urlsplit(api_origin)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        raise RuntimeError("Set API_PUBLIC_URL to the public API URL before sending approval emails.")
    if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError("API_PUBLIC_URL must use HTTPS outside local development.")
    return (
        f"{api_origin.rstrip('/')}/visits/email-decision?"
        f"{urllib.parse.urlencode({'token': token})}"
    )


def _send_branch_manager_visit_request_email(
    recipient: dict[str, Any], visit: dict[str, Any]
) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("Visitor approval email is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL.")
    if settings.smtp_use_tls and settings.smtp_use_ssl:
        raise RuntimeError("Configure either SMTP_USE_TLS or SMTP_USE_SSL, not both.")
    if bool(settings.smtp_username) != bool(settings.smtp_password):
        raise RuntimeError("Set both SMTP_USERNAME and SMTP_PASSWORD, or leave both empty.")

    manager_id = str(recipient["Id"])
    visit_id = str(visit["id"])
    approve_url = _visitor_email_decision_url(
        _visitor_email_decision_token(visit_id, manager_id, "APPROVE")
    )
    reject_url = _visitor_email_decision_url(
        _visitor_email_decision_token(visit_id, manager_id, "REJECT")
    )
    visitor_name = str(visit.get("name") or visit.get("visitor_name") or "Visitor")
    visit_date = visit.get("visitDate") or visit.get("visit_date")
    host_name = visit.get("hostName") or visit.get("host_name")
    safe = lambda value: html.escape(str(value or ""), quote=True)
    message = EmailMessage()
    message["Subject"] = f"Visitor approval required — {visitor_name}"
    message["From"] = settings.smtp_from_email
    message["To"] = str(recipient["Email"])
    message.set_content(
        f"A visitor request requires your approval.\n\n"
        f"Visitor: {visitor_name}\n"
        f"Location: {visit.get('location') or ''}\n"
        f"Date: {visit_date or ''}\n"
        f"Host: {host_name or ''}\n"
        f"Purpose: {visit.get('purpose') or ''}\n\n"
        f"Approve: {approve_url}\nReject: {reject_url}\n"
        "Links expire in 48 hours. You will be asked to confirm the decision."
    )
    message.add_alternative(
        branded_email_html(
            "Visitor Management",
            "Visitor approval required",
            "<p>A visitor request requires your approval.</p>"
            f"<p><strong>Visitor:</strong> {safe(visitor_name)}<br>"
            f"<strong>Location:</strong> {safe(visit.get('location'))}<br>"
            f"<strong>Date:</strong> {safe(visit_date)}<br>"
            f"<strong>Host:</strong> {safe(host_name)}<br>"
            f"<strong>Purpose:</strong> {safe(visit.get('purpose'))}</p>"
            f'<p><a href="{safe(approve_url)}" style="display:inline-block;margin-right:8px;'
            'padding:12px 20px;background-color:#155eef;color:#ffffff;text-decoration:none;'
            'font-weight:bold;border-radius:6px">Approve request</a></p>'
            f'<p><a href="{safe(reject_url)}" style="display:inline-block;padding:12px 20px;'
            'background-color:#b42318;color:#ffffff;text-decoration:none;font-weight:bold;'
            'border-radius:6px">Reject request</a></p>'
            "<p>Links expire in 48 hours. The decision is recorded only after you confirm it.</p>",
            preheader=f"Approval required for visitor {visitor_name}.",
        ),
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
        raise RuntimeError("The SMTP server could not accept the visitor approval email.") from exc


def _send_branch_manager_visit_approved_email(
    recipient: dict[str, Any], visit: dict[str, Any]
) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("Visitor schedule email is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL.")
    if settings.smtp_use_tls and settings.smtp_use_ssl:
        raise RuntimeError("Configure either SMTP_USE_TLS or SMTP_USE_SSL, not both.")
    if bool(settings.smtp_username) != bool(settings.smtp_password):
        raise RuntimeError("Set both SMTP_USERNAME and SMTP_PASSWORD, or leave both empty.")

    visitor_name = str(visit.get("name") or visit.get("visitor_name") or "Visitor")
    visit_date = visit.get("visitDate") or visit.get("visit_date") or ""
    arrival = visit.get("expectedArrival") or visit.get("expected_arrival") or ""
    departure = visit.get("expectedDeparture") or visit.get("expected_departure") or ""
    location = visit.get("location") or ""
    host = visit.get("hostName") or visit.get("host_name") or ""
    purpose = visit.get("purpose") or ""
    request_no = visit.get("requestId") or visit.get("request_no") or ""
    visitor_code = visit.get("visitorId") or visit.get("visitor_code") or ""
    safe = lambda value: html.escape(str(value or ""), quote=True)
    message = EmailMessage()
    message["Subject"] = f"Visitor scheduled to visit {location} — {visitor_name}"
    message["From"] = settings.smtp_from_email
    message["To"] = str(recipient["Email"])
    message.set_content(
        f"This visitor is scheduled to visit your branch.\n\n"
        f"Visitor: {visitor_name}\n"
        f"Date: {visit_date}\n"
        f"Time: {arrival} - {departure}\n"
        f"Location: {location}\n"
        f"Host: {host}\n"
        f"Purpose: {purpose}\n"
        f"Request: {request_no}\n"
        f"Visitor ID: {visitor_code}\n"
    )
    message.add_alternative(
        branded_email_html(
            "Visitor Management",
            "Visitor scheduled",
            "<p>This visitor is scheduled to visit your branch.</p>"
            f"<p><strong>Visitor:</strong> {safe(visitor_name)}<br>"
            f"<strong>Date:</strong> {safe(visit_date)}<br>"
            f"<strong>Time:</strong> {safe(arrival)} - {safe(departure)}<br>"
            f"<strong>Location:</strong> {safe(location)}<br>"
            f"<strong>Host:</strong> {safe(host)}<br>"
            f"<strong>Purpose:</strong> {safe(purpose)}<br>"
            f"<strong>Request:</strong> {safe(request_no)}<br>"
            f"<strong>Visitor ID:</strong> {safe(visitor_code)}</p>",
            preheader=f"{visitor_name} is scheduled to visit {location} on {visit_date}.",
        ),
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
        raise RuntimeError("The SMTP server could not accept the visitor schedule email.") from exc


def _notify_branch_managers_of_approved_visit(
    cur: Any, visit: dict[str, Any]
) -> str:
    location = str(visit.get("location") or "").strip()
    if not location and visit.get("id"):
        cur.execute(
            "SELECT [Location] FROM [dbo].[Visits] WHERE [Id] = ?",
            visit["id"],
        )
        row = cur.fetchone()
        location = str(row[0] or "").strip() if row else ""
    scheduled_visit = {**visit, "location": location}
    cur.execute(
        """
        SELECT manager.[Id], manager.[Email], manager.[Name]
        FROM [dbo].[AppUsers] AS manager
        JOIN [dbo].[Branches] AS branch
          ON branch.[Id] = manager.[BranchId]
        WHERE manager.[Role] = 'BRANCH_MANAGER'
          AND manager.[IsActive] = 1
          AND NULLIF(LTRIM(RTRIM(manager.[Email])), '') IS NOT NULL
          AND (branch.[Name] = ? OR branch.[Address] = ?)
        ORDER BY manager.[Id]
        """,
        location,
        location,
    )
    managers = rows_as_dicts(cur)
    if not managers:
        logger.warning(
            "Approved visit %s has no active Branch Manager with an email for location %s",
            visit.get("id") or visit.get("requestId") or "unknown",
            location,
        )
        return "NO_RECIPIENT"

    failures = 0
    for manager in managers:
        try:
            _send_branch_manager_visit_approved_email(manager, scheduled_visit)
        except Exception:
            failures += 1
            logger.exception(
                "Branch Manager schedule email delivery failed for visit %s and manager %s",
                visit.get("id") or visit.get("requestId") or "unknown",
                manager.get("Id"),
            )
    if failures == len(managers):
        return "FAILED"
    return "PARTIAL" if failures else "SENT"


def _from_sql_value(logical: str, key: str, value: Any) -> Any:
    if logical == "profiles":
        if key == "status":
            return "ACTIVE" if value else "INACTIVE"
        if key == "employee_id":
            return str(value) if value is not None else None
    return _json_value(value)


def _select_fields(logical: str, columns: str, module: str | None) -> list[str]:
    if columns.strip() == "*":
        if logical == "hd_evidence":
            return [
                "[Id]", "[ModuleName]", "[RecordId]", "[FileName]", "[StoragePath]",
                "[UploadedByUserId]", "[UploadedAt]",
                "(SELECT [Name] FROM [dbo].[AppUsers] WHERE [Id] = [FileUploads].[UploadedByUserId]) AS [UploadedByName]",
            ]
        if logical == "emergencies":
            return [
                "[EvacuationIncidents].*",
                "(SELECT [Name] FROM [dbo].[EvacSites] WHERE [Id] = [EvacuationIncidents].[SiteId]) AS [AssemblyPoint]",
            ]
        if logical == "emg_incident_employees":
            return [
                "[EvacuationResponses].*",
                "(SELECT [Name] FROM [dbo].[AppUsers] WHERE [Id] = [EvacuationResponses].[UserId]) AS [EmployeeName]",
                "(SELECT [Email] FROM [dbo].[AppUsers] WHERE [Id] = [EvacuationResponses].[UserId]) AS [EmployeeEmail]",
                "(SELECT [Department] FROM [dbo].[AppUsers] WHERE [Id] = [EvacuationResponses].[UserId]) AS [Department]",
                "(SELECT [EmployeeNo] FROM [dbo].[AppUsers] WHERE [Id] = [EvacuationResponses].[UserId]) AS [EmployeeNtId]",
            ]
        return ["*"]
    fields = [part.strip() for part in columns.split(",") if part.strip()]
    if not fields or any(not IDENTIFIER.fullmatch(field) for field in fields):
        raise HTTPException(status_code=400, detail="Invalid selected column.")
    if logical == "profiles" and "password_hash" in fields:
        raise HTTPException(status_code=403, detail="Password hashes are not available through the database API.")
    mapped = [
        "CAST(NULL AS nvarchar(200)) AS [Building]"
        if logical == "profiles" and field == "building"
        else "(SELECT [Name] FROM [dbo].[AppUsers] WHERE [Id] = [FileUploads].[UploadedByUserId]) AS [UploadedByName]"
        if logical == "hd_evidence" and field == "uploaded_by_name"
        else "(SELECT [Name] FROM [dbo].[AppUsers] WHERE [Id] = [EvacuationResponses].[UserId]) AS [EmployeeName]"
        if logical == "emg_incident_employees" and field == "employee_name"
        else "(SELECT [Email] FROM [dbo].[AppUsers] WHERE [Id] = [EvacuationResponses].[UserId]) AS [EmployeeEmail]"
        if logical == "emg_incident_employees" and field == "employee_email"
        else "(SELECT [Department] FROM [dbo].[AppUsers] WHERE [Id] = [EvacuationResponses].[UserId]) AS [Department]"
        if logical == "emg_incident_employees" and field == "department"
        else "(SELECT [EmployeeNo] FROM [dbo].[AppUsers] WHERE [Id] = [EvacuationResponses].[UserId]) AS [EmployeeNtId]"
        if logical == "emg_incident_employees" and field == "employee_ntid"
        else "(SELECT [Name] FROM [dbo].[EvacSites] WHERE [Id] = [EvacuationIncidents].[SiteId]) AS [AssemblyPoint]"
        if logical == "emergencies" and field == "assembly_point"
        else f"[{_field(logical, field, module)}]"
        for field in fields
    ]
    if logical == "profiles":
        mapped = [field for field in mapped if field != "[PasswordHash]"]
    return list(dict.fromkeys(mapped))


def _normalize(logical: str, row: dict[str, Any], module: str | None) -> dict[str, Any]:
    data = dict(row)
    if module:
        data.setdefault("ModuleName", module)
    result: dict[str, Any] = {}
    inverse = {value: key for key, value in FIELD_OVERRIDES.get(logical, {}).items()}
    for column, value in data.items():
        if column in {"ModuleName", "RecordId"}:
            if column == "ModuleName":
                continue
            alias = {
                "VISIT": "visit_id", "EMERGENCY": "incident_id",
                "PERMIT": "permit_id", "HELPDESK": "ticket_id",
            }.get(module or "")
            if alias:
                result[alias] = _json_value(value)
                continue
        key = inverse.get(column, _snake(column))
        if logical == "profiles" and column == "IsActive":
            result["status"] = "ACTIVE" if value else "INACTIVE"
            result["active"] = bool(value)
            result["active"] = bool(value)
            continue
        if logical == "branches" and column == "IsActive":
            result["status"] = "ACTIVE" if value else "INACTIVE"
            result["active"] = bool(value)
            continue
        if logical == "visit_events" and column == "Action":
            result["event"] = _json_value(value)
            continue
        if logical == "work_permits" and column == "FormData" and isinstance(value, str):
            try:
                result["form_data"] = json.loads(value)
            except json.JSONDecodeError:
                logger.exception("Invalid JSON stored in dbo.WorkPermits.FormData")
                raise HTTPException(status_code=500, detail="A work permit contains invalid saved form data.")
            continue
        if logical == "emergencies" and column == "TriggeredAt":
            timestamp = _json_value(value)
            result["triggered_at"] = timestamp
            result["created_at"] = timestamp
            continue
        result[key] = _json_value(value)
    if logical == "emg_incident_employees":
        result.setdefault("employee_name", "")
        result.setdefault("employee_email", "")
        result.setdefault("department", "")
    if logical == "emergencies":
        result.setdefault("assembly_point", "")
    return result


def _ensure_admin(user: dict[str, Any]) -> None:
    if _current_role(user) not in ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Administrator access is required.")


def _require_roles(user: dict[str, Any], roles: set[str]) -> None:
    if _current_role(user) not in roles:
        raise HTTPException(status_code=403, detail="You do not have permission to perform this operation.")


def _require_visit_create_access(user: dict[str, Any], row_data: dict[str, Any]) -> None:
    role = _current_role(user)
    if role == "SECURITY" and str(row_data.get("source", "")).upper() == "WALK_IN":
        return
    if role not in {"ADMIN", "BRANCH_MANAGER", "EMPLOYEE"}:
        raise HTTPException(status_code=403, detail="You do not have permission to create this visitor request.")


def _require_safety_report_mutation_access(user: dict[str, Any], action: str) -> None:
    if action in {"insert", "upsert", "update"}:
        _require_roles(user, {"ADMIN", "HSE", "FIRE_WARDEN"})
    elif action == "delete":
        _require_roles(user, {"ADMIN", "HSE"})


def _current_role(user: dict[str, Any]) -> str:
    try:
        with cursor() as cur:
            cur.execute(
                "SELECT [Role], [IsActive] FROM [dbo].[AppUsers] WHERE [Id] = ?",
                user.get("sub"),
            )
            row = cur.fetchone()
    except Exception as exc:
        logger.exception("Role validation failed")
        raise HTTPException(status_code=503, detail="Unable to validate the current account.") from exc
    if not row or not row.IsActive:
        raise HTTPException(status_code=401, detail="The account is inactive or no longer exists.")
    return str(row.Role or "").upper()


def _scope_clause(
    table: str, claims: dict[str, Any]
) -> tuple[str, list[Any]]:
    role = str(claims.get("role", "")).upper()
    if table in {"visit_requests", "visit_events"}:
        if role in {"BRANCH_MANAGER", "SECURITY"}:
            branch_scope = _branch_visit_scope("[Location]")
            if table == "visit_requests":
                return branch_scope, [claims["sub"]]
            return (
                f"[RecordId] IN (SELECT [Id] FROM [dbo].[Visits] WHERE {branch_scope})",
                [claims["sub"]],
            )
        if role == "ADMIN":
            return "", []
        if table == "visit_requests":
            return "([RequestedByUserId] = ? OR [HostUserId] = ?)", [claims["sub"], claims["sub"]]
        return (
            "[RecordId] IN (SELECT [Id] FROM [dbo].[Visits] WHERE [RequestedByUserId] = ? OR [HostUserId] = ?)",
            [claims["sub"], claims["sub"]],
        )
    if table == "emg_incident_employees":
        if role in {"ADMIN", "HSE", "FIRE_WARDEN"}:
            return "", []
        return "[UserId] = ?", [claims["sub"]]
    if table == "emg_activity":
        if role in {"ADMIN", "HSE", "FIRE_WARDEN"}:
            return "", []
        return (
            "[RecordId] IN (SELECT [IncidentId] FROM [dbo].[EvacuationResponses] WHERE [UserId] = ?)",
            [claims["sub"]],
        )
    if table in {"work_permits", "ewp_workers", "ewp_attendance", "ewp_events"}:
        if role in {"ADMIN", "HSE"}:
            return "", []
        if role == "SECURITY":
            if table == "work_permits":
                return (
                    "[Status] IN ('APPROVED','ACTIVE') "
                    "AND LOWER(LTRIM(RTRIM(JSON_VALUE([FormData], '$.branchId')))) = "
                    "(SELECT LOWER(LTRIM(RTRIM(CONVERT(nvarchar(100), [BranchId])))) "
                    "FROM [dbo].[AppUsers] WHERE [Id] = ? AND [BranchId] IS NOT NULL)",
                    [claims["sub"]],
                )
            return "1 = 0", []
        if role not in {"EMPLOYEE", "BRANCH_MANAGER"}:
            return "1 = 0", []
        if table == "work_permits":
            return "[RaisedByUserId] = ?", [claims["sub"]]
        if table == "ewp_events":
            return (
                "[RecordId] IN (SELECT [Id] FROM [dbo].[WorkPermits] WHERE [RaisedByUserId] = ?)",
                [claims["sub"]],
            )
        return (
            "[PermitId] IN (SELECT [Id] FROM [dbo].[WorkPermits] WHERE [RaisedByUserId] = ?)",
            [claims["sub"]],
        )
    if table in {"hd_tickets", "hd_ticket_events", "hd_evidence"}:
        if role in {"ADMIN", "SERVICE_PROVIDER"}:
            return "", []
        if table == "hd_tickets":
            return "[RaisedByUserId] = ?", [claims["sub"]]
        return (
            "[RecordId] IN (SELECT [Id] FROM [dbo].[HelpdeskTickets] WHERE [RaisedByUserId] = ?)",
            [claims["sub"]],
        )
    return "", []


def _branch_visit_scope(location: str) -> str:
    return f"""
        EXISTS (
            SELECT 1
            FROM [dbo].[AppUsers] AS manager
            JOIN [dbo].[Branches] AS branch ON branch.[Id] = manager.[BranchId]
            WHERE manager.[Id] = ?
              AND ({location} = branch.[Name] OR {location} = branch.[Address])
        )
    """


def _require_visit_branch_access(cur: Any, visit_id: str, claims: dict[str, Any]) -> None:
    cur.execute(
        """
        SELECT CASE
            WHEN manager.[Role] NOT IN ('BRANCH_MANAGER', 'SECURITY')
              OR EXISTS (
                  SELECT 1
                  FROM [dbo].[Branches] AS branch
                  WHERE branch.[Id] = manager.[BranchId]
                    AND (target.[Location] = branch.[Name] OR target.[Location] = branch.[Address])
              )
            THEN 1 ELSE 0
        END
        FROM [dbo].[Visits] AS target
        JOIN [dbo].[AppUsers] AS manager ON manager.[Id] = ?
        WHERE target.[Id] = ?
        """,
        claims["sub"],
        visit_id,
    )
    row = cur.fetchone()
    if row is not None and not row[0]:
        raise HTTPException(
            status_code=403,
            detail="You can only access visitor requests for your assigned branch.",
        )


def _email_visitor_manager_claims(
    cur: Any, visit_id: str, manager_id: str
) -> tuple[dict[str, Any], str]:
    cur.execute(
        """
        SELECT actor.[Role], actor.[IsActive], visit.[Status], visit.[Location],
               branch.[Name], branch.[Address], visit.[Id]
        FROM [dbo].[AppUsers] AS actor
        LEFT JOIN [dbo].[Branches] AS branch ON branch.[Id] = actor.[BranchId]
        LEFT JOIN [dbo].[Visits] AS visit ON visit.[Id] = ?
        WHERE actor.[Id] = ?
        """,
        visit_id,
        manager_id,
    )
    row = cur.fetchone()
    if not row or row[6] is None:
        raise HTTPException(status_code=404, detail="Visitor request not found.")
    if not row[1] or str(row[0] or "").upper() != "BRANCH_MANAGER":
        raise HTTPException(status_code=403, detail="This approval link is not assigned to an active Branch Manager.")
    if row[3] not in {row[4], row[5]}:
        raise HTTPException(status_code=403, detail="This approval link is not for your assigned branch.")
    return (
        {"sub": manager_id, "role": "BRANCH_MANAGER"},
        str(row[2] or "").strip().upper(),
    )


def _require_card_issue_access(cur: Any, visit_id: str, claims: dict[str, Any]) -> None:
    cur.execute(
        """
        SELECT actor.[Role], actor.[IsActive], branch.[Name], branch.[Address],
               target.[Location], target.[Status], target.[Id]
        FROM [dbo].[AppUsers] AS actor
        LEFT JOIN [dbo].[Branches] AS branch ON branch.[Id] = actor.[BranchId]
        LEFT JOIN [dbo].[Visits] AS target ON target.[Id] = ?
        WHERE actor.[Id] = ?
        """,
        visit_id,
        claims["sub"],
    )
    row = cur.fetchone()
    if not row or not row[1]:
        raise HTTPException(status_code=401, detail="The account is inactive or no longer exists.")
    if row[6] is None:
        raise HTTPException(status_code=404, detail="Visitor request not found.")
    role = str(row[0] or "").upper()
    if role not in {"ADMIN", "BRANCH_MANAGER", "SECURITY"}:
        raise HTTPException(status_code=403, detail="Only Admin, Branch Manager, or Security can issue visitor cards.")
    if role in {"BRANCH_MANAGER", "SECURITY"} and row[4] not in {row[2], row[3]}:
        raise HTTPException(
            status_code=403,
            detail="You can only issue visitor cards for visits at your assigned branch.",
        )
    if row[5] not in {"APPROVED", "CARD_ISSUED", "CHECKED_IN"}:
        raise HTTPException(status_code=409, detail="Cards can only be issued for approved or checked-in visits.")


def _legacy_visit(cur: Any, visit_id: str) -> dict[str, Any] | None:
        cur.execute(
            """
            SELECT v.*, b.[Id] AS [ResolvedBranchId]
            FROM [dbo].[Visits] AS v
            OUTER APPLY (
                SELECT TOP (1) branch.[Id]
                FROM [dbo].[Branches] AS branch
                WHERE branch.[Name] = v.[Location] OR branch.[Address] = v.[Location]
                ORDER BY CASE WHEN branch.[Name] = v.[Location] THEN 0 ELSE 1 END
            ) AS b
            WHERE v.[Id] = ?
            """,
            visit_id,
        )
        rows = rows_as_dicts(cur)
        if not rows:
            return None
        row = rows[0]
        result = {
            "id": str(row["Id"]),
            "requestId": row.get("RequestNo") or "",
            "visitorId": row.get("VisitorCode"),
            "visitorType": row.get("VisitorType") or "EXTERNAL",
            "origin": row.get("Source") or "PRE_REGISTERED",
            "status": row.get("Status") or "PENDING",
            "name": row.get("VisitorName") or "",
            "employeeIdNo": "",
            "company": row.get("Company") or "",
            "sourceBranchId": str(row["VisitorBranchId"]) if row.get("VisitorBranchId") else None,
            "branchId": str(row["ResolvedBranchId"]) if row.get("ResolvedBranchId") else str(row.get("Location") or ""),
            "departmentId": row.get("HostDepartment") or "",
            "designation": row.get("Designation") or "",
            "email": row.get("Email") or "",
            "phone": row.get("Phone") or "",
            "address": "",
            "purpose": row.get("Purpose") or "",
            "visitDate": _json_value(row.get("VisitDate")),
            "expectedArrival": _json_value(row.get("ExpectedArrival")),
            "expectedDeparture": _json_value(row.get("ExpectedDeparture")),
            "hostEmployeeId": str(row["HostUserId"]) if row.get("HostUserId") else "",
            "hostName": row.get("HostName") or "",
            "hostDepartmentId": row.get("HostDepartment") or "",
            "remarks": row.get("Remarks") or "",
            "requestedById": str(row["RequestedByUserId"]) if row.get("RequestedByUserId") else "",
            "requestedAt": _json_value(row.get("CreatedAt")),
            "approvedById": None,
            "approvedAt": _json_value(row.get("ReviewedAt")),
            "rejectionReason": row.get("RejectionReason"),
            "rejectedAt": _json_value(row.get("ReviewedAt")) if row.get("RejectionReason") else None,
            "cancelledAt": _json_value(row.get("CancelledAt")),
            "emailSentAt": _json_value(row.get("InvitationSentAt")),
            "whatsappSentAt": None,
            "checkInAt": _json_value(row.get("CheckedInAt") or row.get("ArrivedAt")),
            "checkInBy": row.get("CheckedInByName") or row.get("ArrivedByName"),
            "checkOutAt": _json_value(row.get("CheckedOutAt")),
            "checkOutBy": row.get("CheckedOutByName"),
            "cardNumber": row.get("GuestCardNumber"),
            "photoUrl": None,
            "timeline": [],
            "accessEvents": [],
            "portalUrl": None,
        }
        return result


def _current_user_name(claims: dict[str, Any]) -> str:
        try:
            with cursor() as cur:
                cur.execute("SELECT [Name] FROM [dbo].[AppUsers] WHERE [Id] = ?", claims["sub"])
                row = cur.fetchone()
        except Exception as exc:
            logger.exception("Current user lookup failed")
            raise HTTPException(status_code=503, detail="Unable to validate the current account.") from exc
        if not row:
            raise HTTPException(status_code=401, detail="The account no longer exists.")
        return str(row.Name or "")


@app.post("/api/helpdesk/tickets/{ticket_id}/claim")
def claim_helpdesk_ticket(
    ticket_id: str, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    _require_roles(claims, {"SERVICE_PROVIDER"})
    provider_name = _current_user_name(claims)
    try:
        with cursor() as cur:
            cur.execute(
                """
                UPDATE [dbo].[HelpdeskTickets]
                SET [ProviderName] = ?, [Status] = 'ASSIGNED',
                    [AssignedAt] = SYSUTCDATETIME(), [UpdatedAt] = SYSUTCDATETIME()
                OUTPUT INSERTED.*
                WHERE [Id] = ? AND [Status] = 'NEW'
                  AND ([ProviderName] IS NULL OR LTRIM(RTRIM([ProviderName])) = '')
                """,
                provider_name, ticket_id,
            )
            rows = rows_as_dicts(cur)
            if not rows:
                raise HTTPException(
                    status_code=409,
                    detail="This ticket is no longer available to claim.",
                )
            return _normalize("hd_tickets", rows[0], None)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Helpdesk ticket claim failed")
        raise HTTPException(
            status_code=503, detail="Unable to claim the ticket."
        ) from exc


@app.post("/api/helpdesk/tickets/{ticket_id}/assign-and-start")
def assign_and_start_helpdesk_ticket(
    ticket_id: str,
    body: HelpdeskAssignmentRequest,
    claims: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    _require_roles(claims, {"SERVICE_PROVIDER"})
    actor_name = _current_user_name(claims)
    try:
        with cursor() as cur:
            provider = next(
                (
                    row
                    for row in _read_virtual(cur, "hd_providers")
                    if str(row.get("id") or "") == body.providerId
                    and row.get("active") is True
                ),
                None,
            )
            if provider is None:
                raise HTTPException(
                    status_code=400,
                    detail="Select an active service provider.",
                )
            provider_name = str(provider.get("name") or "").strip()
            if not provider_name:
                raise HTTPException(
                    status_code=400,
                    detail="The selected service provider has no name.",
                )
            cur.execute(
                """
                UPDATE [dbo].[HelpdeskTickets]
                SET [ProviderName] = ?, [Status] = 'IN_PROGRESS',
                    [AssignedAt] = SYSUTCDATETIME(), [UpdatedAt] = SYSUTCDATETIME()
                OUTPUT INSERTED.*
                WHERE [Id] = ? AND [Status] = 'NEW'
                  AND ([ProviderName] IS NULL OR LTRIM(RTRIM([ProviderName])) = '')
                """,
                provider_name, ticket_id,
            )
            rows = rows_as_dicts(cur)
            if not rows:
                raise HTTPException(
                    status_code=409,
                    detail="This ticket is no longer available to assign.",
                )
            cur.execute(
                """
                INSERT INTO [dbo].[ModuleEvents]
                    ([Id], [ModuleName], [RecordId], [Action], [Note],
                     [ActorUserId], [ActorName], [CreatedAt])
                VALUES (NEWID(), 'HELPDESK', ?, 'Provider assigned and work started',
                        ?, ?, ?, SYSUTCDATETIME())
                """,
                ticket_id,
                f"Assigned to {provider_name}; work started.",
                claims["sub"],
                actor_name,
            )
            return _normalize("hd_tickets", rows[0], None)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Helpdesk assignment and start failed")
        raise HTTPException(
            status_code=503, detail="Unable to assign the provider and start work."
        ) from exc


def _public_visit_by_token(cur: Any, visit_id: str, token: str) -> dict[str, Any]:
    digest = hashlib.sha256(token.encode()).hexdigest()
    cur.execute(
        "SELECT * FROM [dbo].[Visits] WHERE [Id] = ? AND [QrTokenHash] = ?",
        visit_id,
        digest,
    )
    rows = rows_as_dicts(cur)
    if not rows:
        raise HTTPException(status_code=404, detail="This visitor pass is invalid or has expired.")
    row = rows[0]
    if row.get("Status") not in {"APPROVED", "CARD_ISSUED", "CHECKED_IN", "CHECKED_OUT"}:
        raise HTTPException(status_code=410, detail="This visitor pass is no longer active.")
    if _json_value(row.get("VisitDate")) < date.today().isoformat():
        raise HTTPException(status_code=410, detail="This visitor pass has expired.")
    return row


def _public_visit_by_qr_token(cur: Any, token: str) -> dict[str, Any]:
    digest = hashlib.sha256(token.encode()).hexdigest()
    cur.execute("SELECT * FROM [dbo].[Visits] WHERE [QrTokenHash] = ?", digest)
    rows = rows_as_dicts(cur)
    if not rows:
        raise HTTPException(status_code=404, detail="This visitor pass is invalid or has expired.")
    row = rows[0]
    if row.get("Status") not in {"APPROVED", "CARD_ISSUED", "CHECKED_IN", "CHECKED_OUT"}:
        raise HTTPException(status_code=410, detail="This visitor pass is no longer active.")
    if _json_value(row.get("VisitDate")) < date.today().isoformat():
        raise HTTPException(status_code=410, detail="This visitor pass has expired.")
    return row


def _visitor_checkin_otp_hash(visit_id: str, email: str, code: str) -> str:
    if not settings.jwt_secret or len(settings.jwt_secret) < 32:
        raise HTTPException(
            status_code=503, detail="Visitor check-in OTP signing is not configured."
        )
    payload = f"vms-visitor-checkin-otp:{visit_id}:{email.casefold()}:{code}"
    return hmac.new(
        settings.jwt_secret.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()


def _visitor_email_destination(email: str) -> str:
    local, separator, domain = email.partition("@")
    if not separator:
        return "the registered email address"
    return f"{local[:1]}***@{domain}"


def _send_visitor_checkin_otp_email(email: str, code: str, visit: dict[str, Any]) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("Visitor check-in email is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL.")
    if settings.smtp_use_tls and settings.smtp_use_ssl:
        raise RuntimeError("Configure either SMTP_USE_TLS or SMTP_USE_SSL, not both.")
    if bool(settings.smtp_username) != bool(settings.smtp_password):
        raise RuntimeError("Set both SMTP_USERNAME and SMTP_PASSWORD, or leave both empty.")

    visitor_name = str(visit.get("VisitorName") or "Visitor")
    visitor_code = str(visit.get("VisitorCode") or "")
    message = EmailMessage()
    message["Subject"] = f"Your VMS check-in verification code — {visitor_code}"
    message["From"] = settings.smtp_from_email
    message["To"] = email
    message.set_content(
        f"Hello {visitor_name},\n\n"
        f"Your VMS check-in verification code is {code}.\n"
        "It expires in 10 minutes and can be used once. "
        "Enter it on the visitor check-in page to verify your email, then confirm check-in.\n\n"
        "If you did not request this code, you can ignore this email."
    )
    message.add_alternative(
        otp_email_html(
            "Visitor Management",
            "Verify your visitor check-in",
            f"Hello {visitor_name}, your check-in verification code is:",
            code,
            "This code expires in 10 minutes and can be used once. Enter it on the visitor check-in page to verify your email, then confirm check-in. If you did not request it, you can ignore this email.",
            preheader="Your visitor check-in verification code.",
        ),
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
        raise RuntimeError(
            "The SMTP server could not accept the visitor check-in verification email."
        ) from exc


def _distance_meters(
    latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float
) -> float:
    earth_radius_m = 6_371_000
    phi_a = math.radians(latitude_a)
    phi_b = math.radians(latitude_b)
    delta_phi = math.radians(latitude_b - latitude_a)
    delta_lambda = math.radians(longitude_b - longitude_a)
    haversine = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi_a) * math.cos(phi_b) * math.sin(delta_lambda / 2) ** 2
    )
    return earth_radius_m * 2 * math.atan2(
        math.sqrt(haversine), math.sqrt(max(0.0, 1 - haversine))
    )


def _require_visitor_inside_geofence(
    cur: Any, visit: dict[str, Any], latitude: float, longitude: float
) -> float:
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        raise HTTPException(status_code=400, detail="A valid device location is required.")
    cur.execute(
        """
        SELECT TOP (1) fence.[Latitude], fence.[Longitude], fence.[RadiusMeters]
        FROM [dbo].[Branches] AS branch
        LEFT JOIN [dbo].[VmsBranchGeofences] AS fence
          ON fence.[BranchId] = branch.[Id]
        WHERE branch.[IsActive] = 1
          AND (branch.[Name] = ? OR branch.[Address] = ?)
        ORDER BY CASE WHEN branch.[Name] = ? THEN 0 ELSE 1 END
        """,
        visit.get("Location"),
        visit.get("Location"),
        visit.get("Location"),
    )
    fence = cur.fetchone()
    if not fence:
        raise HTTPException(
            status_code=409,
            detail="This visit location is not mapped to an active branch. Contact the VMS administrator.",
        )
    if fence[0] is None or fence[1] is None or fence[2] is None:
        raise HTTPException(
            status_code=409,
            detail="Geofence coordinates are not configured for this branch. Contact the VMS administrator.",
        )
    distance = _distance_meters(
        latitude, longitude, float(fence[0]), float(fence[1])
    )
    if distance > float(fence[2]):
        raise HTTPException(
            status_code=403,
            detail=(
                f"You are outside this branch's {int(fence[2])} m check-in area "
                f"(approximately {int(round(distance))} m away)."
            ),
        )
    return distance


def _require_helpdesk_building_context(
    cur: Any,
    building_id: str,
    area_id: str | None,
    latitude: Any,
    longitude: Any,
) -> tuple[dict[str, Any], dict[str, Any] | None, str]:
    try:
        latitude_value = float(latitude)
        longitude_value = float(longitude)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Allow device location to submit this request.") from exc
    if (
        not math.isfinite(latitude_value)
        or not math.isfinite(longitude_value)
        or not -90 <= latitude_value <= 90
        or not -180 <= longitude_value <= 180
    ):
        raise HTTPException(status_code=400, detail="A valid device location is required.")

    buildings = _read_virtual(cur, "hd_buildings")
    building = next(
        (
            row for row in buildings
            if str(row.get("id") or "") == building_id and row.get("active", True)
        ),
        None,
    )
    if not building:
        raise HTTPException(status_code=404, detail="This Helpdesk building is unavailable.")
    try:
        fence_latitude = float(building["latitude"])
        fence_longitude = float(building["longitude"])
        radius_m = int(building.get("radius_m", 100))
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=409,
            detail="The Helpdesk building geofence is not configured. Contact the administrator.",
        ) from exc
    if (
        not math.isfinite(fence_latitude)
        or not math.isfinite(fence_longitude)
        or not -90 <= fence_latitude <= 90
        or not -180 <= fence_longitude <= 180
        or not 25 <= radius_m <= 5000
    ):
        raise HTTPException(
            status_code=409,
            detail="The Helpdesk building geofence is invalid. Contact the administrator.",
        )
    distance = _distance_meters(
        latitude_value, longitude_value, fence_latitude, fence_longitude
    )
    if distance > radius_m:
        raise HTTPException(
            status_code=403,
            detail=f"You are outside this building's {radius_m} m Helpdesk area.",
        )

    branch_id = str(building.get("branch_id") or "")
    cur.execute(
        "SELECT [Name] FROM [dbo].[Branches] WHERE [Id] = ? AND [IsActive] = 1",
        branch_id,
    )
    branch = cur.fetchone()
    if not branch:
        raise HTTPException(status_code=409, detail="The building is not assigned to an active branch.")
    area: dict[str, Any] | None = None
    if area_id:
        area = next(
            (
                row for row in _read_virtual(cur, "hd_building_areas")
                if str(row.get("id") or "") == area_id
                and str(row.get("building_id") or "") == building_id
                and row.get("active", True)
            ),
            None,
        )
        if not area:
            raise HTTPException(status_code=400, detail="Choose an active area in this building.")
        configured_floors = [
            floor
            for floor in _read_virtual(cur, "hd_building_floors")
            if str(floor.get("name") or "").strip().casefold()
            == str(area.get("floor") or "").strip().casefold()
        ]
        if configured_floors and not any(floor.get("active", True) for floor in configured_floors):
            raise HTTPException(status_code=400, detail="Choose an area on an active floor.")
    return building, area, str(branch[0] or "")


def _require_helpdesk_branch_access(
    cur: Any, branch_id: str, claims: dict[str, Any]
) -> None:
    if _current_role(claims) == "ADMIN":
        return
    cur.execute(
        "SELECT [BranchId] FROM [dbo].[AppUsers] WHERE [Id] = ? AND [IsActive] = 1",
        claims["sub"],
    )
    user = cur.fetchone()
    if not user or not user[0] or str(user[0]) != str(branch_id):
        raise HTTPException(
            status_code=403,
            detail="You can only submit Helpdesk requests for your assigned branch.",
        )


def _public_helpdesk_otp_hash(building_id: str, email: str, code: str) -> str:
    if not settings.jwt_secret or len(settings.jwt_secret) < 32:
        raise HTTPException(status_code=503, detail="Helpdesk email verification is not configured.")
    payload = f"helpdesk-qr-otp:{building_id}:{email.casefold()}:{code}"
    return hmac.new(settings.jwt_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def _public_helpdesk_token(building_id: str, email: str) -> str:
    if not settings.jwt_secret or len(settings.jwt_secret) < 32:
        raise HTTPException(status_code=503, detail="Helpdesk email verification is not configured.")
    payload = {
        "building_id": building_id,
        "email": email.casefold(),
        "exp": int(datetime.now(timezone.utc).timestamp()) + 7200,
        "nonce": secrets.token_urlsafe(16),
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode()
    ).decode().rstrip("=")
    signature = hmac.new(settings.jwt_secret.encode(), encoded.encode(), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def _verify_public_helpdesk_token(token: str, building_id: str) -> dict[str, str]:
    try:
        if not settings.jwt_secret or len(settings.jwt_secret) < 32:
            raise ValueError("Helpdesk guest tokens are not configured.")
        encoded, signature = token.split(".", 1)
        expected = hmac.new(
            settings.jwt_secret.encode(), encoded.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("Invalid signature.")
        payload = json.loads(
            base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        )
        if int(payload["exp"]) < int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("Expired token.")
        if str(payload["building_id"]) != building_id:
            raise ValueError("Token is for a different building.")
        email = str(payload["email"]).strip().casefold()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            raise ValueError("Invalid email.")
        return {"building_id": building_id, "email": email}
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=401, detail="Your Helpdesk verification has expired. Verify your email again."
        ) from exc


def _send_public_helpdesk_otp(email: str, code: str, building_name: str) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("Helpdesk email is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL.")
    if settings.smtp_use_tls and settings.smtp_use_ssl:
        raise RuntimeError("Configure either SMTP_USE_TLS or SMTP_USE_SSL, not both.")
    if bool(settings.smtp_username) != bool(settings.smtp_password):
        raise RuntimeError("Set both SMTP_USERNAME and SMTP_PASSWORD, or leave both empty.")
    message = EmailMessage()
    message["Subject"] = "Your FCM Helpdesk verification code"
    message["From"] = settings.smtp_from_email
    message["To"] = email
    message.set_content(
        f"Your FCM Helpdesk verification code for {building_name} is {code}.\n\n"
        "This code expires in 10 minutes. Do not share it with anyone."
    )
    message.add_alternative(
        otp_email_html(
            "Helpdesk",
            "Verify your email",
            f"Your verification code for {building_name} is:",
            code,
            "This code expires in 10 minutes. Do not share it with anyone.",
            preheader=f"Your Helpdesk email verification code for {building_name}.",
        ),
        subtype="html",
    )
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


def _require_helpdesk_building_deletable(cur: Any, building_id: str) -> None:
    cur.execute(
        "SELECT TOP (1) [Id] FROM [dbo].[HelpdeskTickets] WHERE [BuildingId] = ?",
        building_id,
    )
    if cur.fetchone():
        raise HTTPException(
            status_code=409,
            detail="This building is used by existing tickets. Deactivate it instead to preserve ticket history.",
        )
    if any(
        str(record.get("building_id") or "") == building_id
        for record in _read_virtual(cur, "hd_feedback")
    ):
        raise HTTPException(
            status_code=409,
            detail="This building has feedback history. Deactivate it instead to preserve records.",
        )


def _active_helpdesk_building(cur: Any, building_id: str) -> dict[str, Any]:
    building = next(
        (
            row for row in _read_virtual(cur, "hd_buildings")
            if str(row.get("id") or "") == building_id and row.get("active", True)
        ),
        None,
    )
    if not building:
        raise HTTPException(status_code=404, detail="This Helpdesk building is unavailable.")
    return building


def _public_helpdesk_requester(
    cur: Any, email: str, submitted_name: str
) -> tuple[str | None, str]:
    cur.execute(
        """
        SELECT TOP (1) [Id], [Name]
        FROM [dbo].[AppUsers]
        WHERE [IsActive] = 1 AND LOWER(LTRIM(RTRIM([Email]))) = ?
        """,
        email,
    )
    requester = cur.fetchone()
    requester_id = str(requester[0]) if requester and requester[0] else None
    requester_name = (
        str(requester[1])
        if requester and requester[1]
        else submitted_name.strip()
    )
    return requester_id, requester_name


def _helpdesk_feedback_ticket_options(
    cur: Any,
    building_id: str,
    submitter_email: str,
    submitter_id: str | None = None,
    only_closed: bool = True,
) -> list[dict[str, Any]]:
    feedback_rows = _read_virtual(cur, "hd_feedback")
    submitted_ids = {
        str(row.get("ticket_id"))
        for row in feedback_rows
        if row.get("feedback_type") == "TICKET"
        and (
            str(row.get("submitted_by_email") or "").strip().casefold()
            == submitter_email.casefold()
            or (
                submitter_id is not None
                and str(row.get("submitted_by") or "") == submitter_id
            )
        )
    }
    owner_filter = "LOWER(LTRIM(RTRIM([RaisedByEmail]))) = ?"
    parameters: list[Any] = [building_id, submitter_email.casefold()]
    if submitter_id is not None:
        owner_filter = f"({owner_filter} OR [RaisedByUserId] = ?)"
        parameters.append(submitter_id)
    closed_filter = " AND [Status] = 'CLOSED'" if only_closed else ""
    cur.execute(
        f"""
        SELECT [Id], [TicketNo], [Category], [Status], [Description], [CreatedAt]
        FROM [dbo].[HelpdeskTickets]
        WHERE [BuildingId] = ? AND {owner_filter}{closed_filter}
        ORDER BY [CreatedAt] DESC
        """,
        *parameters,
    )
    return [
        {
            "id": str(row.get("Id") or ""),
            "ticket_no": str(row.get("TicketNo") or ""),
            "category_name": str(row.get("Category") or ""),
            "description": str(row.get("Description") or ""),
            "status": str(row.get("Status") or ""),
            "created_at": str(_json_value(row.get("CreatedAt")) or ""),
            "feedback_submitted": str(row.get("Id") or "") in submitted_ids,
        }
        for row in rows_as_dicts(cur)
        if not only_closed or str(row.get("Status") or "").strip().upper() == "CLOSED"
    ]


def _helpdesk_branch_name(cur: Any, branch_id: str | None) -> str:
    if not branch_id:
        return ""
    cur.execute("SELECT [Name] FROM [dbo].[Branches] WHERE [Id] = ?", branch_id)
    row = cur.fetchone()
    return str(row[0] or "") if row else ""


def _enrich_helpdesk_feedback_display_fields(
    cur: Any, feedback_rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    result = [dict(row) for row in feedback_rows]
    emails = {
        str(row.get("submitted_by_email") or row.get("submitted_by") or "")
        .strip()
        .casefold()
        for row in result
        if (
            not str(row.get("submitted_by_name") or "").strip()
            or str(row.get("submitted_by_name") or "").strip().casefold()
            == str(row.get("submitted_by_email") or row.get("submitted_by") or "").strip().casefold()
        )
        and "@" in str(row.get("submitted_by_email") or row.get("submitted_by") or "")
    }
    user_ids = {
        str(row.get("submitted_by") or "")
        for row in result
        if not row.get("submitted_by_name")
        and row.get("submitted_by")
        and "@" not in str(row.get("submitted_by"))
    }
    names_by_email: dict[str, str] = {}
    names_by_id: dict[str, str] = {}
    for values, field, target in (
        (sorted(emails), "Email", names_by_email),
        (sorted(user_ids), "Id", names_by_id),
    ):
        for start in range(0, len(values), 900):
            batch = values[start : start + 900]
            if not batch:
                continue
            placeholders = ", ".join("?" for _ in batch)
            comparison = (
                "LOWER(LTRIM(RTRIM([Email])))"
                if field == "Email"
                else "CONVERT(nvarchar(100), [Id])"
            )
            cur.execute(
                f"""
                SELECT [Id], [Name], [Email]
                FROM [dbo].[AppUsers]
                WHERE [IsActive] = 1 AND {comparison} IN ({placeholders})
                """,
                *batch,
            )
            for user in rows_as_dicts(cur):
                name = str(user.get("Name") or "").strip()
                if name:
                    key = (
                        str(user.get(field) or "").strip().casefold()
                        if field == "Email"
                        else str(user.get(field) or "")
                    )
                    target[key] = name

    branch_ids = sorted(
        {
            str(row.get("branch_id") or "")
            for row in result
            if row.get("branch_id") and not str(row.get("branch_name") or "").strip()
        }
    )
    branches_by_id: dict[str, str] = {}
    for start in range(0, len(branch_ids), 900):
        batch = branch_ids[start : start + 900]
        if not batch:
            continue
        placeholders = ", ".join("?" for _ in batch)
        cur.execute(
            f"SELECT [Id], [Name] FROM [dbo].[Branches] WHERE [Id] IN ({placeholders})",
            *batch,
        )
        for branch in rows_as_dicts(cur):
            name = str(branch.get("Name") or "").strip()
            if name:
                branches_by_id[str(branch.get("Id") or "")] = name

    for row in result:
        email = str(row.get("submitted_by_email") or row.get("submitted_by") or "").strip().casefold()
        current_name = str(row.get("submitted_by_name") or "").strip()
        if email and (not current_name or current_name.casefold() == email):
            row["submitted_by_name"] = names_by_email.get(email, current_name or email)
        elif not current_name:
            submitter_id = str(row.get("submitted_by") or "")
            row["submitted_by_name"] = names_by_id.get(submitter_id, email)
        if not str(row.get("branch_name") or "").strip():
            row["branch_name"] = branches_by_id.get(str(row.get("branch_id") or ""), "")
    return result


@app.get("/api/public/helpdesk/{building_id}/bootstrap")
def public_helpdesk_bootstrap(building_id: str) -> dict[str, Any]:
    try:
        with cursor() as cur:
            building = _active_helpdesk_building(cur, building_id)
            public_building = {
                key: value for key, value in building.items()
                if key not in {"latitude", "longitude"}
            }
            return {
                "building": public_building,
                "floors": [
                    row for row in _read_virtual(cur, "hd_building_floors")
                    if row.get("active", True)
                ],
                "areas": [
                    row for row in _read_virtual(cur, "hd_building_areas")
                    if row.get("active", True)
                    and str(row.get("building_id") or "") == building_id
                ],
                "categories": [
                    row for row in _read_virtual(cur, "hd_categories")
                    if row.get("active", True)
                ],
                "subcategories": [
                    row for row in _read_virtual(cur, "hd_subcategories")
                    if row.get("active", True)
                ],
                "services": [
                    row for row in _read_virtual(cur, "hd_services")
                    if row.get("active", True)
                ],
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Public Helpdesk catalog loading failed")
        raise HTTPException(status_code=503, detail="Unable to load this building's Helpdesk catalog.") from exc


@app.post("/api/public/helpdesk/{building_id}/otp")
def send_public_helpdesk_otp(
    building_id: str, body: PublicHelpdeskOtpRequest
) -> dict[str, Any]:
    email = body.email.strip().casefold()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    now = int(datetime.now(timezone.utc).timestamp())
    challenge_id = f"{building_id}:{email}"
    try:
        with cursor() as cur:
            building = _active_helpdesk_building(cur, building_id)
            challenges = _read_virtual(cur, "hd_public_otp_challenges")
            existing = next((item for item in challenges if item.get("id") == challenge_id), None)
            if existing and now - int(existing.get("created_at", 0)) < 60:
                raise HTTPException(status_code=429, detail="Wait 60 seconds before requesting another code.")
            code = f"{secrets.randbelow(1_000_000):06d}"
            challenge = {
                "id": challenge_id,
                "code_hash": _public_helpdesk_otp_hash(building_id, email, code),
                "created_at": now,
                "expires_at": now + 600,
                "attempts": 0,
                "used": False,
            }
            challenges = [item for item in challenges if item.get("id") != challenge_id]
            _write_virtual(cur, "hd_public_otp_challenges", ([challenge] + challenges)[:10000])
            _send_public_helpdesk_otp(email, code, str(building.get("name") or "your building"))
            return {"sent": True, "expiresInSeconds": 600, "resendAfterSeconds": 60}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Public Helpdesk OTP delivery failed")
        raise HTTPException(status_code=502, detail="Unable to send the verification code. Check email settings and try again.") from exc


@app.post("/api/public/helpdesk/{building_id}/verify")
def verify_public_helpdesk_otp(
    building_id: str, body: PublicHelpdeskOtpVerifyRequest
) -> dict[str, Any]:
    email = body.email.strip().casefold()
    challenge_id = f"{building_id}:{email}"
    now = int(datetime.now(timezone.utc).timestamp())
    invalid_code = False
    try:
        with cursor() as cur:
            _active_helpdesk_building(cur, building_id)
            challenges = _read_virtual(cur, "hd_public_otp_challenges")
            challenge = next((item for item in challenges if item.get("id") == challenge_id), None)
            if not challenge or challenge.get("used"):
                raise HTTPException(status_code=409, detail="Request a new verification code.")
            if now > int(challenge.get("expires_at", 0)):
                raise HTTPException(status_code=400, detail="The verification code expired. Request a new one.")
            if int(challenge.get("attempts", 0)) >= 5:
                raise HTTPException(status_code=429, detail="Too many incorrect codes. Request a new one.")
            code_hash = _public_helpdesk_otp_hash(building_id, email, body.code)
            if not hmac.compare_digest(str(challenge.get("code_hash") or ""), code_hash):
                challenge["attempts"] = int(challenge.get("attempts", 0)) + 1
                _write_virtual(cur, "hd_public_otp_challenges", challenges)
                invalid_code = True
            else:
                challenge["used"] = True
                _write_virtual(cur, "hd_public_otp_challenges", challenges)
                result = {"token": _public_helpdesk_token(building_id, email), "email": email}
        if invalid_code:
            raise HTTPException(status_code=400, detail="The verification code is incorrect.")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Public Helpdesk OTP verification failed")
        raise HTTPException(status_code=503, detail="Unable to verify the code. Please try again.") from exc


@app.get("/api/public/helpdesk/{building_id}/tickets")
def list_public_helpdesk_tickets(
    building_id: str, token: str = Query(..., min_length=32, max_length=4096)
) -> list[dict[str, Any]]:
    identity = _verify_public_helpdesk_token(token, building_id)
    try:
        with cursor() as cur:
            _active_helpdesk_building(cur, building_id)
            return _helpdesk_feedback_ticket_options(
                cur, building_id, identity["email"], only_closed=False
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Public Helpdesk ticket listing failed")
        raise HTTPException(status_code=503, detail="Unable to load Helpdesk tickets.") from exc


@app.get("/api/public/helpdesk/{building_id}/tickets/{ticket_id}/history")
def get_public_helpdesk_ticket_history(
    building_id: str,
    ticket_id: str,
    token: str = Query(..., min_length=32, max_length=4096),
) -> dict[str, Any]:
    identity = _verify_public_helpdesk_token(token, building_id)
    try:
        with cursor() as cur:
            cur.execute(
                """
                SELECT * FROM [dbo].[HelpdeskTickets]
                WHERE [Id] = ? AND [BuildingId] = ?
                  AND LOWER(LTRIM(RTRIM([RaisedByEmail]))) = ?
                """,
                ticket_id,
                building_id,
                identity["email"],
            )
            rows = rows_as_dicts(cur)
            if not rows:
                raise HTTPException(status_code=404, detail="This Helpdesk ticket was not found.")
            ticket = _normalize("hd_tickets", rows[0], None)
            cur.execute(
                """
                SELECT [Action], [Note], [ActorName], [CreatedAt]
                FROM [dbo].[ModuleEvents]
                WHERE [ModuleName] = 'HELPDESK' AND [RecordId] = ?
                ORDER BY [CreatedAt], [Id]
                """,
                ticket_id,
            )
            events = [
                {
                    "action": str(row.get("Action") or ""),
                    "remarks": str(row.get("Note") or ""),
                    "performed_by_name": str(row.get("ActorName") or ""),
                    "created_at": str(_json_value(row.get("CreatedAt")) or ""),
                }
                for row in rows_as_dicts(cur)
            ]
            return {
                "ticket": {
                    "id": ticket_id,
                    "ticket_no": str(ticket.get("ticket_no") or ""),
                    "category_name": str(ticket.get("category_name") or ""),
                    "subcategory_name": str(ticket.get("subcategory_name") or ""),
                    "description": str(ticket.get("description") or ""),
                    "location": str(ticket.get("location") or ""),
                    "priority": str(ticket.get("priority") or ""),
                    "status": str(ticket.get("status") or ""),
                    "created_at": str(ticket.get("created_at") or ""),
                    "updated_at": str(ticket.get("updated_at") or ""),
                    "closed_at": str(ticket.get("closed_at") or ""),
                },
                "events": events,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Public Helpdesk ticket history failed")
        raise HTTPException(status_code=503, detail="Unable to load ticket history.") from exc


@app.get("/api/helpdesk/tickets/feedback-options")
def list_helpdesk_feedback_ticket_options(
    building_id: str = Query(..., min_length=1, max_length=200),
    claims: dict[str, Any] = Depends(current_user),
) -> list[dict[str, Any]]:
    role = _current_role(claims)
    if role not in {"ADMIN", "BRANCH_MANAGER", "EMPLOYEE"}:
        raise HTTPException(status_code=403, detail="You do not have permission to view ticket feedback options.")
    try:
        with cursor() as cur:
            building = _active_helpdesk_building(cur, building_id)
            _require_helpdesk_branch_access(cur, str(building["branch_id"]), claims)
            cur.execute(
                "SELECT [Email] FROM [dbo].[AppUsers] WHERE [Id] = ? AND [IsActive] = 1",
                claims["sub"],
            )
            user = cur.fetchone()
            if not user or not str(user[0] or "").strip():
                raise HTTPException(status_code=401, detail="A valid email is required for ticket feedback.")
            return _helpdesk_feedback_ticket_options(
                cur,
                building_id,
                str(user[0]).strip().casefold(),
                str(claims["sub"]),
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Helpdesk feedback ticket options failed")
        raise HTTPException(status_code=503, detail="Unable to load Helpdesk tickets.") from exc


@app.post("/api/public/helpdesk/{building_id}/tickets")
def create_public_helpdesk_ticket(
    building_id: str, body: PublicHelpdeskTicketRequest
) -> dict[str, Any]:
    identity = _verify_public_helpdesk_token(body.token, building_id)
    description = body.description.strip()
    if len(description) < 10:
        raise HTTPException(status_code=400, detail="Describe the issue in at least 10 characters.")
    requester_name = body.name.strip()
    if len(requester_name) < 2:
        raise HTTPException(status_code=400, detail="Enter your name.")
    priority = _helpdesk_priority(body.priority)
    try:
        with cursor() as cur:
            building, area, branch_name = _require_helpdesk_building_context(
                cur, building_id, body.area_id, body.latitude, body.longitude
            )
            if not area:
                raise HTTPException(status_code=400, detail="Select an active area in this building.")
            categories = _read_virtual(cur, "hd_categories")
            category = next(
                (item for item in categories if item.get("active", True) and str(item.get("id")) == body.category_id),
                None,
            )
            if not category:
                raise HTTPException(status_code=400, detail="Select an active service category.")
            subcategory = None
            if body.subcategory_id:
                subcategory = next(
                    (
                        item for item in _read_virtual(cur, "hd_subcategories")
                        if item.get("active", True)
                        and str(item.get("id")) == body.subcategory_id
                        and str(item.get("category_id")) == body.category_id
                    ),
                    None,
                )
                if not subcategory:
                    raise HTTPException(status_code=400, detail="Select a valid sub-category.")
            elif any(
                item.get("active", True) and str(item.get("category_id")) == body.category_id
                for item in _read_virtual(cur, "hd_subcategories")
            ):
                raise HTTPException(status_code=400, detail="Select a sub-category.")
            services = _read_virtual(cur, "hd_services")
            service = next(
                (
                    item for item in services
                    if item.get("active", True)
                    and str(item.get("category_id")) == body.category_id
                    and (
                        str(item.get("subcategory_id") or "") == str((subcategory or {}).get("id") or "")
                        or (not subcategory and not item.get("subcategory_id"))
                    )
                ),
                None,
            )
            providers = _read_virtual(cur, "hd_providers")
            provider = next(
                (item for item in providers if item.get("active", True) and item.get("id") == (service or {}).get("provider_id")),
                None,
            )
            ticket_id = str(uuid.uuid4())
            ticket_no = _next_helpdesk_ticket_no(cur)
            requester_id, raiser_name = _public_helpdesk_requester(
                cur, identity["email"], requester_name
            )
            location = " · ".join(
                part for part in (branch_name, str(building.get("name") or ""), str(area.get("floor") or ""), str(area.get("name") or ""))
                if part
            )
            cur.execute(
                """
                INSERT INTO [dbo].[HelpdeskTickets]
                    ([Id], [TicketNo], [RaisedByUserId], [RaisedByName], [RaisedByEmail],
                     [Category], [Subcategory], [ServiceName], [ProviderName], [Description],
                     [Location], [Priority], [Status], [BranchId], [BuildingId], [BuildingAreaId],
                     [FloorName], [AreaName], [CreatedAt], [UpdatedAt])
                OUTPUT INSERTED.*
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?,
                        SYSUTCDATETIME(), SYSUTCDATETIME())
                """,
                ticket_id, ticket_no, requester_id, raiser_name, identity["email"], category["name"],
                (subcategory or {}).get("name") or "", (service or {}).get("name") or "",
                (provider or {}).get("name") or "", description, location, priority,
                building["branch_id"], building_id, area["id"], area["floor"], area["name"],
            )
            rows = rows_as_dicts(cur)
            if not rows:
                raise RuntimeError("The public Helpdesk ticket was not created.")
            ticket = _normalize("hd_tickets", rows[0], None)
            try:
                cur.execute(
                    """
                    INSERT INTO [dbo].[ModuleEvents]
                        ([Id], [ModuleName], [RecordId], [Action], [Note],
                         [ActorUserId], [ActorName], [CreatedAt])
                    VALUES (NEWID(), 'HELPDESK', ?, 'Ticket created', ?, ?, ?, SYSUTCDATETIME())
                    """,
                    ticket_id,
                    f"Ticket raised by {raiser_name}.",
                    requester_id,
                    raiser_name,
                )
            except Exception:
                logger.exception(
                    "Public Helpdesk ticket %s was created, but its activity event could not be stored",
                    ticket_no,
                )
            _notify_public_helpdesk_ticket(cur, ticket)
            return ticket
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Public Helpdesk ticket creation failed")
        raise HTTPException(status_code=503, detail="Unable to raise the ticket. Please try again.") from exc


def _notify_public_helpdesk_ticket(cur: Any, ticket: dict[str, Any]) -> None:
    cur.execute(
        """
        SELECT [Id], [Name], [Email], [Role]
        FROM [dbo].[AppUsers]
        WHERE [IsActive] = 1 AND [Role] IN ('SERVICE_PROVIDER', 'ADMIN')
          AND (? IS NULL OR [Id] <> ?)
        ORDER BY [Id]
        """,
        ticket.get("raiser_id"), ticket.get("raiser_id"),
    )
    recipients = rows_as_dicts(cur)
    now = datetime.now(timezone.utc).isoformat()
    if recipients:
        notifications = _read_virtual(cur, "hd_notifications")
        _write_virtual(
            cur,
            "hd_notifications",
            (
                [
                    {
                        "id": str(uuid.uuid4()),
                        "recipient_id": str(recipient["Id"]),
                        "ticket_id": str(ticket["id"]),
                        "title": "New Helpdesk ticket",
                        "message": f"Ticket {ticket.get('ticket_no')} has been raised by {ticket.get('raiser_name') or 'a user'}.",
                        "type": "NEW",
                        "is_read": False,
                        "created_at": now,
                    }
                    for recipient in recipients
                ] + notifications
            )[:10000],
        )
    for recipient in recipients:
        if recipient.get("Role") != "SERVICE_PROVIDER" or not str(recipient.get("Email") or "").strip():
            continue
        try:
            _send_helpdesk_ticket_email(recipient, ticket)
        except Exception:
            logger.exception(
                "Public Helpdesk ticket email delivery failed for ticket %s and provider %s",
                ticket.get("ticket_no"), recipient.get("Id"),
            )


@app.post("/api/public/helpdesk/{building_id}/feedback")
def submit_public_helpdesk_ticket_feedback(
    building_id: str, body: PublicHelpdeskFeedbackRequest
) -> dict[str, Any]:
    identity = _verify_public_helpdesk_token(body.token, building_id)
    try:
        with cursor() as cur:
            cur.execute(
                """
                SELECT * FROM [dbo].[HelpdeskTickets]
                WHERE [Id] = ? AND [BuildingId] = ?
                """,
                body.ticket_id, building_id,
            )
            tickets = rows_as_dicts(cur)
            if not tickets:
                raise HTTPException(status_code=404, detail="This Helpdesk ticket was not found.")
            ticket = _normalize("hd_tickets", tickets[0], None)
            if str(ticket.get("raiser_email") or "").strip().casefold() != identity["email"]:
                raise HTTPException(status_code=404, detail="This Helpdesk ticket was not found.")
            if str(ticket.get("status") or "").strip().upper() != "CLOSED":
                raise HTTPException(
                    status_code=409,
                    detail="Feedback can only be submitted for closed tickets.",
                )
            feedback_rows = _read_virtual(cur, "hd_feedback")
            if any(
                row.get("feedback_type") == "TICKET"
                and str(row.get("ticket_id")) == body.ticket_id
                and str(row.get("submitted_by_email") or row.get("submitted_by") or "")
                .strip()
                .casefold()
                == identity["email"]
                for row in feedback_rows
            ):
                raise HTTPException(status_code=409, detail="You have already submitted feedback for this ticket.")
            if len(feedback_rows) >= 10000:
                raise HTTPException(status_code=413, detail="Helpdesk feedback capacity exceeded.")
            cur.execute(
                """
                SELECT TOP (1) [Name]
                FROM [dbo].[AppUsers]
                WHERE [IsActive] = 1 AND LOWER(LTRIM(RTRIM([Email]))) = ?
                """,
                identity["email"],
            )
            submitter = cur.fetchone()
            submitter_name = (
                str(submitter[0] or "").strip()
                if submitter and submitter[0]
                else body.name.strip()
            )
            row = {
                "id": str(uuid.uuid4()),
                "feedback_type": "TICKET",
                "ticket_id": body.ticket_id,
                "ticket_no": ticket.get("ticket_no"),
                "branch_id": ticket.get("branch_id"),
                "branch_name": _helpdesk_branch_name(
                    cur, str(ticket.get("branch_id") or "")
                ),
                "building_id": ticket.get("building_id") or building_id,
                "building_name": str(ticket.get("location") or ""),
                "area_id": ticket.get("building_area_id"),
                "floor_name": str(ticket.get("floor_name") or ""),
                "area_name": str(ticket.get("area_name") or ""),
                "feedback": body.feedback.strip(),
                "rating": body.rating,
                "submitted_by": identity["email"],
                "submitted_by_email": identity["email"],
                "submitted_by_name": submitter_name or identity["email"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            feedback_rows.insert(0, row)
            _write_virtual(cur, "hd_feedback", feedback_rows)
            return row
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Public Helpdesk ticket feedback submission failed")
        raise HTTPException(status_code=503, detail="Unable to submit ticket feedback.") from exc


@app.post("/api/helpdesk/tickets/{ticket_id}/feedback")
def submit_helpdesk_ticket_feedback(
    ticket_id: str,
    body: HelpdeskTicketFeedbackRequest,
    claims: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    if body.ticket_id != ticket_id:
        raise HTTPException(status_code=400, detail="Ticket reference does not match the request.")
    role = _current_role(claims)
    if role not in {"ADMIN", "BRANCH_MANAGER", "EMPLOYEE"}:
        raise HTTPException(status_code=403, detail="You do not have permission to submit ticket feedback.")
    try:
        with cursor() as cur:
            cur.execute(
                "SELECT * FROM [dbo].[HelpdeskTickets] WHERE [Id] = ?",
                ticket_id,
            )
            rows = rows_as_dicts(cur)
            if not rows:
                raise HTTPException(status_code=404, detail="You cannot submit feedback for this ticket.")
            ticket = _normalize("hd_tickets", rows[0], None)
            cur.execute(
                "SELECT [Email] FROM [dbo].[AppUsers] WHERE [Id] = ? AND [IsActive] = 1",
                claims["sub"],
            )
            user_row = cur.fetchone()
            current_email = str(user_row[0] or "").strip().casefold() if user_row else ""
            if not current_email:
                raise HTTPException(status_code=401, detail="A valid email is required for ticket feedback.")
            if (
                str(ticket.get("raiser_id") or "") != str(claims["sub"])
                and str(ticket.get("raiser_email") or "").strip().casefold() != current_email
            ):
                raise HTTPException(
                    status_code=403,
                    detail="Only the ticket raiser can submit feedback.",
                )
            if str(ticket.get("status") or "").strip().upper() != "CLOSED":
                raise HTTPException(
                    status_code=409,
                    detail="Feedback can only be submitted for closed tickets.",
                )
            if role in {"EMPLOYEE", "BRANCH_MANAGER"}:
                _require_helpdesk_branch_access(
                    cur, str(ticket.get("branch_id") or ""), claims
                )
            feedback_rows = _read_virtual(cur, "hd_feedback")
            if any(
                row.get("feedback_type") == "TICKET"
                and str(row.get("ticket_id")) == ticket_id
                and (
                    (
                        bool(current_email)
                        and str(row.get("submitted_by_email") or "").strip().casefold()
                        == current_email
                    )
                    or str(row.get("submitted_by") or "") == str(claims["sub"])
                )
                for row in feedback_rows
            ):
                raise HTTPException(status_code=409, detail="You have already submitted feedback for this ticket.")
            if len(feedback_rows) >= 10000:
                raise HTTPException(status_code=413, detail="Helpdesk feedback capacity exceeded.")
            row = {
                "id": str(uuid.uuid4()),
                "feedback_type": "TICKET",
                "ticket_id": ticket_id,
                "ticket_no": ticket.get("ticket_no"),
                "branch_id": ticket.get("branch_id"),
                "branch_name": _helpdesk_branch_name(
                    cur, str(ticket.get("branch_id") or "")
                ),
                "building_id": ticket.get("building_id") or "",
                "building_name": str(ticket.get("location") or ""),
                "area_id": ticket.get("building_area_id"),
                "floor_name": str(ticket.get("floor_name") or ""),
                "area_name": str(ticket.get("area_name") or ""),
                "feedback": body.feedback.strip(),
                "rating": body.rating,
                "submitted_by": str(claims["sub"]),
                "submitted_by_email": current_email,
                "submitted_by_name": _current_user_name(claims),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            feedback_rows.insert(0, row)
            _write_virtual(cur, "hd_feedback", feedback_rows)
            return row
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Helpdesk ticket feedback submission failed")
        raise HTTPException(status_code=503, detail="Unable to submit ticket feedback.") from exc


@app.post("/api/helpdesk/feedback")
def submit_helpdesk_feedback(
    body: HelpdeskFeedbackRequest,
    claims: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    _require_roles(claims, {"ADMIN", "BRANCH_MANAGER", "EMPLOYEE"})
    feedback = body.feedback.strip()
    if len(feedback) < 3:
        raise HTTPException(status_code=400, detail="Feedback must contain at least 3 characters.")
    if not body.area_id:
        raise HTTPException(status_code=400, detail="Select a floor and an area.")
    try:
        with cursor() as cur:
            building, area, branch_name = _require_helpdesk_building_context(
                cur,
                body.building_id,
                body.area_id,
                body.latitude,
                body.longitude,
            )
            _require_helpdesk_branch_access(cur, str(building["branch_id"]), claims)
            record = {
                "id": str(uuid.uuid4()),
                "branch_id": str(building["branch_id"]),
                "branch_name": branch_name,
                "building_id": str(building["id"]),
                "building_name": str(building["name"]),
                "area_id": str(area["id"]) if area else None,
                "floor_name": str(area["floor"]) if area else "",
                "area_name": str(area["name"]) if area else "",
                "feedback": feedback,
                "rating": body.rating,
                "submitted_by": str(claims["sub"]),
                "submitted_by_name": _current_user_name(claims),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            records = _read_virtual(cur, "hd_feedback")
            records.insert(0, record)
            if len(records) > 10000:
                raise HTTPException(status_code=413, detail="Helpdesk feedback capacity exceeded.")
            _write_virtual(cur, "hd_feedback", records)
            return record
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Helpdesk feedback submission failed")
        raise HTTPException(status_code=503, detail="Unable to submit feedback.") from exc


@app.get("/api/helpdesk/feedback")
def list_helpdesk_feedback(
    claims: dict[str, Any] = Depends(current_user),
) -> list[dict[str, Any]]:
    _ensure_admin(claims)
    try:
        with cursor() as cur:
            return _enrich_helpdesk_feedback_display_fields(
                cur, _read_virtual(cur, "hd_feedback")
            )
    except Exception as exc:
        logger.exception("Helpdesk feedback listing failed")
        raise HTTPException(status_code=503, detail="Unable to load Helpdesk feedback.") from exc


def _visitor_checkin_window(
    visit: dict[str, Any], now: datetime | None = None
) -> tuple[bool, str]:
    try:
        visit_date_value = visit.get("VisitDate") or visit.get("visit_date")
        arrival_value = visit.get("ExpectedArrival") or visit.get("expected_arrival")
        departure_value = visit.get("ExpectedDeparture") or visit.get("expected_departure")
        visit_date = (
            visit_date_value.date()
            if isinstance(visit_date_value, datetime)
            else visit_date_value
            if isinstance(visit_date_value, date)
            else date.fromisoformat(str(visit_date_value)[:10])
        )
        arrival = (
            arrival_value
            if isinstance(arrival_value, time)
            else time.fromisoformat(str(arrival_value))
        )
        departure = (
            departure_value
            if isinstance(departure_value, time)
            else time.fromisoformat(str(departure_value))
        )
    except (TypeError, ValueError):
        return False, "Check-in is unavailable because the visit schedule is incomplete."

    timezone = ZoneInfo("Asia/Kolkata")
    current = now or datetime.now(timezone)
    if current.tzinfo is not None:
        current = current.astimezone(timezone).replace(tzinfo=None)
    start = datetime.combine(visit_date, arrival)
    end = datetime.combine(visit_date, departure)
    if departure <= arrival:
        return False, "Check-in is unavailable because the visit schedule is invalid."
    if current < start:
        return False, f"Check-in opens at {arrival.strftime('%H:%M')} IST on {visit_date.isoformat()}."
    if current >= end:
        return False, (
            f"The check-in window ended at {departure.strftime('%H:%M')} IST."
        )
    return True, f"Check-in is available until {departure.strftime('%H:%M')} IST."


def _require_visitor_checkin_window(
    visit: dict[str, Any], now: datetime | None = None
) -> None:
    available, message = _visitor_checkin_window(visit, now)
    if not available:
        raise HTTPException(status_code=409, detail=message)


def _public_visit_payload(
    row: dict[str, Any], check_in_verified: bool = False
) -> dict[str, Any]:
    visit = _normalize("visit_requests", row, None)
    checkin_available, checkin_window_message = _visitor_checkin_window(row)
    payload = {
        field: visit.get(field)
        for field in (
            "id", "request_no", "visitor_name", "visitor_code", "company",
            "purpose", "location", "visit_date", "expected_arrival",
            "expected_departure", "host_name", "status", "checked_in_at", "checked_out_at",
        )
    }
    payload["check_in_available"] = (
        checkin_available
        if visit.get("status") in {"APPROVED", "CARD_ISSUED"}
        else False
    )
    payload["check_in_window_message"] = (
        checkin_window_message
        if visit.get("status") in {"APPROVED", "CARD_ISSUED"}
        else ""
    )
    payload["check_in_verified"] = check_in_verified
    return payload


def _visitor_checkin_otp_verified(cur: Any, visit_id: str) -> bool:
    cur.execute(
        """
        SELECT CASE WHEN [UsedAt] >= DATEADD(MINUTE, -10, SYSUTCDATETIME())
                    THEN 1 ELSE 0 END
        FROM [dbo].[VmsVisitorCheckInOtpChallenges]
        WHERE [VisitId] = ?
        """,
        visit_id,
    )
    row = cur.fetchone()
    return bool(row and row[0])


@app.post("/api/public/visits/{visit_id}/pass")
def public_visitor_pass(
        visit_id: str, body: VisitorTokenRequest
) -> dict[str, Any]:
        try:
            with cursor() as cur:
                row = _public_visit_by_token(cur, visit_id, body.token)
                verified = (
                    row.get("Status") in {"APPROVED", "CARD_ISSUED"}
                    and _visitor_checkin_otp_verified(cur, visit_id)
                )
                return _public_visit_payload(row, verified)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Public visitor pass lookup failed")
            raise HTTPException(status_code=503, detail="Unable to load this visitor pass.") from exc


@app.get("/api/public/visitor-passes/{token}")
def public_visitor_pass_by_qr_token(token: str) -> dict[str, Any]:
    try:
        with cursor() as cur:
            row = _public_visit_by_qr_token(cur, token)
            verified = (
                row.get("Status") in {"APPROVED", "CARD_ISSUED"}
                and _visitor_checkin_otp_verified(cur, str(row["Id"]))
            )
            return _public_visit_payload(row, verified)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Public visitor pass lookup by QR token failed")
        raise HTTPException(status_code=503, detail="Unable to load this visitor pass.") from exc


@app.post("/api/public/visits/{visit_id}/check-in/otp")
def send_visitor_checkin_otp(
    visit_id: str, body: VisitorCheckInOtpRequest
) -> dict[str, Any]:
    try:
        with cursor() as cur:
            visit = _public_visit_by_token(cur, visit_id, body.token)
            if visit.get("Status") not in {"APPROVED", "CARD_ISSUED"}:
                raise HTTPException(status_code=409, detail="This visit is no longer available for check-in.")
            _require_visitor_checkin_window(visit)
            _require_visitor_inside_geofence(
                cur, visit, body.latitude, body.longitude
            )
            email = str(visit.get("Email") or "").strip()
            if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
                raise HTTPException(
                    status_code=409,
                    detail="A valid visitor email is not on this request. Ask the host to update the request.",
                )
            cur.execute(
                """
                SELECT DATEDIFF(SECOND, [CreatedAt], SYSUTCDATETIME()), [UsedAt]
                FROM [dbo].[VmsVisitorCheckInOtpChallenges] WITH (UPDLOCK, HOLDLOCK)
                WHERE [VisitId] = ?
                """,
                visit_id,
            )
            existing = cur.fetchone()
            if (
                existing
                and existing[0] is not None
                and 0 <= int(existing[0]) < 60
            ):
                raise HTTPException(
                    status_code=429,
                    detail="Wait 60 seconds before requesting another check-in code.",
                )

            code = f"{secrets.randbelow(1_000_000):06d}"
            code_hash = _visitor_checkin_otp_hash(visit_id, email, code)
            if existing:
                cur.execute(
                    """
                    UPDATE [dbo].[VmsVisitorCheckInOtpChallenges]
                    SET [RecipientEmail] = ?, [CodeHash] = ?,
                        [ExpiresAt] = DATEADD(MINUTE, 10, SYSUTCDATETIME()),
                        [Attempts] = 0, [UsedAt] = NULL,
                        [CreatedAt] = SYSUTCDATETIME()
                    WHERE [VisitId] = ?
                    """,
                    email,
                    code_hash,
                    visit_id,
                )
            else:
                cur.execute(
                    """
                    INSERT INTO [dbo].[VmsVisitorCheckInOtpChallenges]
                        ([VisitId], [RecipientEmail], [CodeHash], [ExpiresAt])
                    VALUES (?, ?, ?, DATEADD(MINUTE, 10, SYSUTCDATETIME()))
                    """,
                    visit_id,
                    email,
                    code_hash,
                )
            _send_visitor_checkin_otp_email(email, code, visit)
            return {
                "sent": True,
                "destination": _visitor_email_destination(email),
                "expiresInSeconds": 600,
                "resendAfterSeconds": 60,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Visitor check-in OTP delivery failed for visit %s", visit_id)
        raise HTTPException(
            status_code=502,
            detail="Unable to send the check-in code. Check the visitor email and SMTP configuration.",
        ) from exc


@app.post("/api/public/visits/{visit_id}/check-in/verify")
def verify_visitor_checkin_otp(
    visit_id: str, body: VisitorCheckInOtpVerifyRequest
) -> dict[str, Any]:
    failure: tuple[int, str] | None = None
    result: dict[str, Any] | None = None
    try:
        with cursor() as cur:
            visit = _public_visit_by_token(cur, visit_id, body.token)
            if visit.get("Status") not in {"APPROVED", "CARD_ISSUED"}:
                raise HTTPException(status_code=409, detail="This visit has already been checked in.")
            _require_visitor_checkin_window(visit)
            _require_visitor_inside_geofence(
                cur, visit, body.latitude, body.longitude
            )
            email = str(visit.get("Email") or "").strip()
            cur.execute(
                """
                SELECT [RecipientEmail], [CodeHash], [ExpiresAt], [Attempts], [UsedAt],
                       CASE WHEN [ExpiresAt] <= SYSUTCDATETIME() THEN 1 ELSE 0 END
                FROM [dbo].[VmsVisitorCheckInOtpChallenges] WITH (UPDLOCK, HOLDLOCK)
                WHERE [VisitId] = ?
                """,
                visit_id,
            )
            challenge = cur.fetchone()
            if not challenge:
                raise HTTPException(
                    status_code=409, detail="Request a check-in verification code first."
                )
            if challenge[4]:
                raise HTTPException(
                    status_code=409,
                    detail="This check-in code has already been used. Request a new code if needed.",
                )
            if str(challenge[0] or "").casefold() != email.casefold():
                raise HTTPException(
                    status_code=409,
                    detail="The visitor email on this request has changed. Ask the host to resend the pass.",
                )
            if challenge[5]:
                failure = (400, "The check-in code has expired. Request a new code.")
            elif int(challenge[3] or 0) >= 5:
                failure = (429, "Too many incorrect codes. Request a new code.")
            elif not hmac.compare_digest(
                str(challenge[1]),
                _visitor_checkin_otp_hash(visit_id, email, body.code),
            ):
                cur.execute(
                    """
                    UPDATE [dbo].[VmsVisitorCheckInOtpChallenges]
                    SET [Attempts] = [Attempts] + 1
                    WHERE [VisitId] = ? AND [UsedAt] IS NULL
                    """,
                    visit_id,
                )
                failure = (400, "The check-in code is incorrect.")
            else:
                cur.execute(
                    """
                    UPDATE [dbo].[VmsVisitorCheckInOtpChallenges]
                    SET [UsedAt] = SYSUTCDATETIME()
                    WHERE [VisitId] = ? AND [UsedAt] IS NULL
                      AND [ExpiresAt] > SYSUTCDATETIME() AND [Attempts] < 5
                    """,
                    visit_id,
                )
                if cur.rowcount == 0:
                    raise HTTPException(
                        status_code=409,
                        detail="This check-in code has expired or has already been used.",
                    )
                cur.execute("SELECT * FROM [dbo].[Visits] WHERE [Id] = ?", visit_id)
                updated = rows_as_dicts(cur)
                if not updated:
                    raise HTTPException(status_code=404, detail="Visitor request not found.")
                result = _public_visit_payload(updated[0], check_in_verified=True)
        if failure:
            raise HTTPException(status_code=failure[0], detail=failure[1])
        if result is None:
            raise HTTPException(status_code=503, detail="Unable to verify the visitor email.")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Visitor check-in OTP verification failed for visit %s", visit_id)
        raise HTTPException(
            status_code=503, detail="Unable to verify the visitor email."
        ) from exc


@app.post("/api/public/visits/{visit_id}/check-in")
def public_visitor_check_in(
        visit_id: str, body: VisitorCheckInOtpRequest
) -> dict[str, Any]:
    try:
        with cursor() as cur:
            visit = _public_visit_by_token(cur, visit_id, body.token)
            if visit.get("Status") not in {"APPROVED", "CARD_ISSUED"}:
                raise HTTPException(status_code=409, detail="This visit is no longer available for check-in.")
            _require_visitor_checkin_window(visit)
            _require_visitor_inside_geofence(cur, visit, body.latitude, body.longitude)
            email = str(visit.get("Email") or "").strip()
            cur.execute(
                """
                SELECT [RecipientEmail], [UsedAt]
                FROM [dbo].[VmsVisitorCheckInOtpChallenges] WITH (UPDLOCK, HOLDLOCK)
                WHERE [VisitId] = ? AND [UsedAt] IS NOT NULL
                  AND [UsedAt] >= DATEADD(MINUTE, -10, SYSUTCDATETIME())
                """,
                visit_id,
            )
            challenge = cur.fetchone()
            if not challenge:
                raise HTTPException(
                    status_code=409,
                    detail="Verify the visitor email code before checking in.",
                )
            if str(challenge[0] or "").casefold() != email.casefold():
                raise HTTPException(
                    status_code=409,
                    detail="The visitor email on this request has changed. Ask the host to resend the pass.",
                )
            cur.execute(
                """
                UPDATE [dbo].[Visits]
                SET [Status] = 'CHECKED_IN', [CheckedInAt] = SYSUTCDATETIME(),
                    [CheckedInByName] = 'Visitor QR OTP',
                    [ArrivedAt] = SYSUTCDATETIME(), [ArrivedByName] = 'Visitor QR OTP',
                    [ArrivalGate] = 'Visitor QR OTP self check-in',
                    [UpdatedAt] = SYSUTCDATETIME()
                WHERE [Id] = ? AND [QrTokenHash] = ?
                  AND [Status] IN ('APPROVED', 'CARD_ISSUED')
                  AND [VisitDate] = CONVERT(date, DATEADD(MINUTE, 330, SYSUTCDATETIME()))
                  AND CONVERT(time(0), DATEADD(MINUTE, 330, SYSUTCDATETIME())) >= [ExpectedArrival]
                  AND CONVERT(time(0), DATEADD(MINUTE, 330, SYSUTCDATETIME())) < [ExpectedDeparture]
                """,
                visit_id,
                hashlib.sha256(body.token.encode()).hexdigest(),
            )
            if cur.rowcount == 0:
                raise HTTPException(
                    status_code=409,
                    detail="This visit must be approved and within its scheduled check-in window.",
                )
            cur.execute(
                """
                INSERT INTO [dbo].[ModuleEvents]
                    ([Id], [ModuleName], [RecordId], [Action], [Note],
                     [ActorUserId], [ActorName], [CreatedAt])
                VALUES (NEWID(), 'VISIT', ?, 'CHECKED_IN',
                        'Checked in using visitor QR and email OTP',
                        NULL, 'Visitor QR OTP', SYSUTCDATETIME())
                """,
                visit_id,
            )
            cur.execute("SELECT * FROM [dbo].[Visits] WHERE [Id] = ?", visit_id)
            updated = rows_as_dicts(cur)
            if not updated:
                raise HTTPException(status_code=404, detail="Visitor request not found.")
            _append_vms_notification(
                cur,
                visit,
                kind="CHECKED_IN",
                title="Visitor checked in",
                body=f"{visit.get('VisitorName') or 'Visitor'} checked in after email OTP verification.",
            )
            return _public_visit_payload(updated[0])
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Public visitor check-in failed")
        raise HTTPException(status_code=503, detail="Unable to check in with this visitor pass.") from exc


@app.post("/api/public/visits/{visit_id}/check-out")
def public_visitor_check_out(
        visit_id: str, body: VisitorTokenRequest
) -> dict[str, Any]:
        try:
            with cursor() as cur:
                row = _public_visit_by_token(cur, visit_id, body.token)
                if row.get("Status") != "CHECKED_IN":
                    raise HTTPException(status_code=409, detail="Only checked-in visitors can check out.")
                card_id = row.get("GuestCardNumber")
                cur.execute(
                    """
                    UPDATE [dbo].[Visits]
                    SET [Status] = 'CHECKED_OUT', [CheckedOutAt] = SYSUTCDATETIME(),
                        [CheckedOutByName] = 'Visitor email pass', [UpdatedAt] = SYSUTCDATETIME()
                    WHERE [Id] = ? AND [QrTokenHash] = ? AND [Status] = 'CHECKED_IN'
                    """,
                    visit_id,
                    hashlib.sha256(body.token.encode()).hexdigest(),
                )
                if cur.rowcount == 0:
                    raise HTTPException(status_code=409, detail="Only checked-in visitors can check out.")
                if card_id:
                    cards = _read_virtual(cur, "guest_cards")
                    for card in cards:
                        if card.get("id") == str(card_id) and card.get("current_visit_id") == visit_id:
                            card.update(
                                status="RETURNED",
                                current_visit_id=None,
                                updated_at=datetime.now(timezone.utc).isoformat(),
                            )
                            break
                    _write_virtual(cur, "guest_cards", cards)
                cur.execute(
                    """
                    INSERT INTO [dbo].[ModuleEvents]
                        ([Id], [ModuleName], [RecordId], [Action], [Note], [ActorUserId], [ActorName], [CreatedAt])
                    VALUES (NEWID(), 'VISIT', ?, 'CHECKED_OUT', 'Checked out using visitor email pass',
                            NULL, 'Visitor email pass', SYSUTCDATETIME())
                    """,
                    visit_id,
                )
                cur.execute("SELECT * FROM [dbo].[Visits] WHERE [Id] = ?", visit_id)
                updated = rows_as_dicts(cur)
                if not updated:
                    raise HTTPException(status_code=404, detail="Visitor request not found.")
                visitor_name = str(row.get("VisitorName") or "Visitor")
                _append_vms_notification(
                    cur,
                    row,
                    kind="CHECKED_OUT",
                    title="Visitor checked out",
                    body=f"{visitor_name} checked out using the visitor email pass.",
                )
                return _public_visit_payload(updated[0])
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Public visitor check-out failed")
            raise HTTPException(status_code=503, detail="Unable to check out with this visitor pass.") from exc


@app.post("/api/visitor-requests/lookup-qr")
def lookup_visitor_qr(
        body: VisitorTokenRequest,
        claims: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
        _require_roles(claims, {"ADMIN", "BRANCH_MANAGER", "SECURITY"})
        try:
            with cursor() as cur:
                digest = hashlib.sha256(body.token.encode()).hexdigest()
                cur.execute(
                    "SELECT TOP (1) * FROM [dbo].[Visits] WHERE [QrTokenHash] IN (?, ?)",
                    digest,
                    body.token,
                )
                rows = rows_as_dicts(cur)
                if not rows:
                    raise HTTPException(status_code=404, detail="No visit matches this QR code.")
                visit = rows[0]
                _require_visit_branch_access(cur, str(visit["Id"]), claims)
                return _normalize("visit_requests", visit, None)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Visitor QR lookup failed")
            raise HTTPException(status_code=503, detail="Unable to look up this visitor QR.") from exc


@app.post("/api/visitor-requests/{visit_id}/check-in")
def manual_visitor_check_in(
        visit_id: str,
        body: VisitorCardRequest,
        claims: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
        raise HTTPException(
            status_code=403,
            detail="Staff check-in is disabled. Visitors must use the secure link in their invitation email.",
        )
        _require_roles(claims, {"ADMIN", "BRANCH_MANAGER"})
        actor = _current_user_name(claims)
        try:
            with cursor() as cur:
                _require_visit_branch_access(cur, visit_id, claims)
                cards = _read_virtual(cur, "guest_cards")
                card = next((item for item in cards if item.get("id") == body.card_id), None)
                if card is None or card.get("status") not in {"AVAILABLE", "RETURNED"}:
                    raise HTTPException(status_code=409, detail="That guest card is no longer available.")
                cur.execute(
                    """
                    UPDATE [dbo].[Visits]
                    SET [Status] = 'CHECKED_IN', [CheckedInAt] = SYSUTCDATETIME(),
                        [CheckedInByName] = ?, [GuestCardNumber] = ?,
                        [ArrivedAt] = SYSUTCDATETIME(), [ArrivedByName] = ?,
                        [ArrivalGate] = ?, [UpdatedAt] = SYSUTCDATETIME()
                    WHERE [Id] = ? AND [Status] = 'APPROVED'
                      AND [VisitDate] = CAST(SYSUTCDATETIME() AS date)
                      AND ([GuestCardNumber] IS NULL OR [GuestCardNumber] = '')
                    """,
                    actor, body.card_id, actor, body.gate.strip(), visit_id,
                )
                if cur.rowcount == 0:
                    raise HTTPException(
                        status_code=409,
                        detail="This visit must be approved, scheduled for today, and not already checked in.",
                    )
                card.update(
                    status="IN_USE",
                    current_visit_id=visit_id,
                    updated_at=datetime.now(timezone.utc).isoformat(),
                )
                _write_virtual(cur, "guest_cards", cards)
                cur.execute("SELECT * FROM [dbo].[Visits] WHERE [Id] = ?", visit_id)
                rows = rows_as_dicts(cur)
                if not rows:
                    raise HTTPException(status_code=404, detail="Visitor request not found.")
                return _normalize("visit_requests", rows[0], None)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Manual visitor check-in failed")
            raise HTTPException(status_code=503, detail="Unable to check in the visitor.") from exc


@app.post("/api/visitor-requests/{visit_id}/issue-card")
def issue_visitor_card(
        visit_id: str,
        body: IssueVisitorCardRequest,
        claims: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
        try:
            with cursor() as cur:
                _require_card_issue_access(cur, visit_id, claims)
                _require_visit_branch_access(cur, visit_id, claims)
                cur.execute(
                    "SELECT [GuestCardNumber] FROM [dbo].[Visits] WHERE [Id] = ? AND [Status] IN ('APPROVED', 'CHECKED_IN')",
                    visit_id,
                )
                visit_row = cur.fetchone()
                if not visit_row:
                    raise HTTPException(status_code=409, detail="A card can only be issued for an approved or checked-in visit.")
                if visit_row[0]:
                    raise HTTPException(status_code=409, detail="A guest card is already assigned to this visit.")
                cards = _read_virtual(cur, "guest_cards")
                card = next((item for item in cards if item.get("id") == body.card_id), None)
                if card is None or card.get("status") not in {"AVAILABLE", "RETURNED"}:
                    raise HTTPException(status_code=409, detail="That guest card is no longer available.")
                cur.execute(
                    """
                    UPDATE [dbo].[Visits]
                    SET [GuestCardNumber] = ?, [UpdatedAt] = SYSUTCDATETIME()
                    WHERE [Id] = ? AND [Status] IN ('APPROVED', 'CHECKED_IN')
                      AND ([GuestCardNumber] IS NULL OR [GuestCardNumber] = '')
                    """,
                    body.card_id, visit_id,
                )
                if cur.rowcount == 0:
                    raise HTTPException(status_code=409, detail="A guest card is already assigned to this visit.")
                card.update(
                    status="IN_USE",
                    current_visit_id=visit_id,
                    updated_at=datetime.now(timezone.utc).isoformat(),
                )
                _write_virtual(cur, "guest_cards", cards)
                visit = _legacy_visit(cur, visit_id)
                if visit is not None:
                    _append_vms_notification(
                        cur,
                        visit,
                        kind="CARD_ISSUED",
                        title="Visitor card issued",
                        body=f"Guest card {body.card_id} was issued to {visit['name']}.",
                        audience=["ADMIN", "SECURITY", "BRANCH_MANAGER"],
                    )
                return {"visit_id": visit_id, "card": card}
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Visitor card issuance failed")
            raise HTTPException(status_code=503, detail="Unable to issue the visitor card.") from exc


@app.post("/api/visitor-requests/{visit_id}/return-card")
def return_visitor_card(
        visit_id: str, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
        try:
            with cursor() as cur:
                _require_roles(claims, {"ADMIN", "BRANCH_MANAGER", "SECURITY"})
                _require_visit_branch_access(cur, visit_id, claims)
                cur.execute(
                    "SELECT [GuestCardNumber] FROM [dbo].[Visits] WHERE [Id] = ? AND [Status] = 'CHECKED_IN'",
                    visit_id,
                )
                row = cur.fetchone()
                if not row or not row[0]:
                    raise HTTPException(status_code=409, detail="This checked-in visitor has no assigned card to return.")
                cards = _read_virtual(cur, "guest_cards")
                card = next(
                    (
                        item for item in cards
                        if item.get("id") == str(row[0]) and item.get("current_visit_id") == visit_id
                    ),
                    None,
                )
                if card is None:
                    raise HTTPException(status_code=409, detail="The assigned card is not currently issued to this visit.")
                card.update(
                    status="RETURNED",
                    current_visit_id=None,
                    updated_at=datetime.now(timezone.utc).isoformat(),
                )
                _write_virtual(cur, "guest_cards", cards)
                cur.execute(
                    """
                    INSERT INTO [dbo].[ModuleEvents]
                        ([Id], [ModuleName], [RecordId], [Action], [Note], [ActorUserId], [ActorName], [CreatedAt])
                    VALUES (NEWID(), 'VISIT', ?, 'CARD_RETURNED', 'Visitor card returned to Security',
                            ?, ?, SYSUTCDATETIME())
                    """,
                    visit_id, claims["sub"], _current_user_name(claims),
                )
                return {"visit_id": visit_id, "card": card}
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Visitor card return failed")
            raise HTTPException(status_code=503, detail="Unable to record the returned visitor card.") from exc


@app.post("/api/visitor-requests/{visit_id}/check-out")
def visitor_check_out(
        visit_id: str, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
        raise HTTPException(
            status_code=403,
            detail="Staff check-out is disabled. Visitors return their card to Security, then check out through their email pass.",
        )
        _require_roles(claims, {"ADMIN", "BRANCH_MANAGER", "SECURITY"})
        actor = _current_user_name(claims)
        try:
            with cursor() as cur:
                _require_visit_branch_access(cur, visit_id, claims)
                cur.execute(
                    "SELECT [GuestCardNumber] FROM [dbo].[Visits] WHERE [Id] = ? AND [Status] = 'CHECKED_IN'",
                    visit_id,
                )
                visit_row = cur.fetchone()
                if not visit_row:
                    raise HTTPException(status_code=409, detail="Only checked-in visitors can check out.")
                card_id = visit_row[0]
                cur.execute(
                    """
                    UPDATE [dbo].[Visits]
                    SET [Status] = 'CHECKED_OUT', [CheckedOutAt] = SYSUTCDATETIME(),
                        [CheckedOutByName] = ?, [UpdatedAt] = SYSUTCDATETIME()
                    WHERE [Id] = ? AND [Status] = 'CHECKED_IN'
                    """,
                    actor, visit_id,
                )
                if cur.rowcount == 0:
                    raise HTTPException(status_code=409, detail="Only checked-in visitors can check out.")
                if card_id:
                    cards = _read_virtual(cur, "guest_cards")
                    for card in cards:
                        if card.get("id") == str(card_id) and card.get("current_visit_id") == visit_id:
                            card.update(
                                status="RETURNED",
                                current_visit_id=None,
                                updated_at=datetime.now(timezone.utc).isoformat(),
                            )
                            break
                    _write_virtual(cur, "guest_cards", cards)
                cur.execute("SELECT * FROM [dbo].[Visits] WHERE [Id] = ?", visit_id)
                rows = rows_as_dicts(cur)
                if not rows:
                    raise HTTPException(status_code=404, detail="Visitor request not found.")
                return _normalize("visit_requests", rows[0], None)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Visitor check-out failed")
            raise HTTPException(status_code=503, detail="Unable to check out the visitor.") from exc


@app.get("/api/visits")
def list_visits(claims: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
        role = _current_role(claims)
        sql = "SELECT visit.[Id] FROM [dbo].[Visits] AS visit"
        params: list[Any] = []
        if role in {"BRANCH_MANAGER", "SECURITY"}:
            sql += f" WHERE {_branch_visit_scope('visit.[Location]')}"
            params.append(claims["sub"])
        elif role != "ADMIN":
            sql += " WHERE visit.[RequestedByUserId] = ? OR visit.[HostUserId] = ?"
            params.extend([claims["sub"], claims["sub"]])
        sql += " ORDER BY visit.[CreatedAt] DESC"
        try:
            with cursor() as cur:
                cur.execute(sql, params)
                ids = [str(row[0]) for row in cur.fetchall()]
                visits = [_legacy_visit(cur, visit_id) for visit_id in ids]
                return [visit for visit in visits if visit is not None]
        except Exception as exc:
            logger.exception("Visit listing failed")
            raise HTTPException(status_code=503, detail="Unable to load visits.") from exc


def _visitor_email_decision_page(
    token: str,
    action: str,
    *,
    submitted: bool = False,
    current_status: str = "PENDING",
) -> HTMLResponse:
    action_label = "approve" if action == "APPROVE" else "reject"
    past_tense = "approved" if action == "APPROVE" else "rejected"
    noun = "approval" if action == "APPROVE" else "rejection"
    if current_status != "PENDING":
        status_label = html.escape(current_status.replace("_", " ").title())
        content = (
            "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            "<title>Visitor request already handled</title>"
            "<body style=\"font:16px system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:24px\">"
            "<h1>Visitor request already handled</h1>"
            f"<p>This request is now <strong>{status_label}</strong>, so it can no longer be changed.</p>"
            "<p>Another authorized user may have already made a decision. Refresh the visitor requests "
            "page or contact your administrator if this status looks incorrect.</p>"
            "</body></html>"
        )
    elif submitted:
        content = (
            "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            f"<title>Visitor request {past_tense}</title>"
            "<body style=\"font:16px system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:24px\">"
            f"<h1>Visitor request {past_tense}</h1>"
            f"<p>Your decision to {action_label} this visitor request has been recorded.</p>"
            "</body></html>"
        )
    else:
        action_url = f"{settings.api_public_url.rstrip('/')}/visits/email-decision"
        safe_token = html.escape(token, quote=True)
        reason_field = (
            '<p><label for="reason">Reason for rejection (required)</label><br>'
            '<textarea id="reason" name="reason" maxlength="2000" required '
            'style="width:100%;min-height:96px"></textarea></p>'
            '<button type="submit" style="padding:14px 20px;font-size:16px;'
            'font-weight:bold;background:#b91c1c;color:#fff;border:0;border-radius:8px">'
            "Confirm rejection</button>"
            if action == "REJECT"
            else '<button type="submit" style="padding:14px 20px;font-size:16px;'
            'font-weight:bold;background:#155eef;color:#fff;border:0;border-radius:8px">'
            "Confirm approval</button>"
        )
        content = (
            "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            f"<title>Confirm visitor request {action_label}</title>"
            "<body style=\"font:16px system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:24px\">"
            f"<h1>Confirm {noun}</h1>"
            f"<p>Confirm that you want to {action_label} this visitor request.</p>"
            f'<form method="post" action="{html.escape(action_url, quote=True)}">'
            f'<input type="hidden" name="token" value="{safe_token}">'
            f"{reason_field}</form></body></html>"
        )
    return HTMLResponse(
        content,
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )


@app.get("/api/visits/email-decision", response_class=HTMLResponse)
def preview_visitor_email_decision(
    token: str = Query(..., min_length=32, max_length=2048),
) -> HTMLResponse:
    token_claims = _decode_visitor_email_decision_token(token)
    try:
        with cursor() as cur:
            _, current_status = _email_visitor_manager_claims(
                cur, token_claims["visit"], token_claims["manager"]
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Visitor email decision preview failed")
        raise HTTPException(status_code=503, detail="Unable to validate this visitor request.") from exc
    return _visitor_email_decision_page(
        token, token_claims["action"], current_status=current_status
    )


@app.post("/api/visits/email-decision", response_class=HTMLResponse)
def submit_visitor_email_decision(
    token: str = Form(..., min_length=32, max_length=2048),
    reason: str = Form(default="", max_length=2000),
) -> HTMLResponse:
    token_claims = _decode_visitor_email_decision_token(token)
    action = token_claims["action"]
    try:
        with cursor() as cur:
            manager_claims, current_status = _email_visitor_manager_claims(
                cur, token_claims["visit"], token_claims["manager"]
            )
        if current_status != "PENDING":
            return _visitor_email_decision_page(
                token, action, submitted=True, current_status=current_status
            )
        if action == "REJECT" and not reason.strip():
            raise HTTPException(
                status_code=400,
                detail="Provide a reason to reject this visitor request.",
            )
        if action == "APPROVE":
            approve_visit(token_claims["visit"], manager_claims)
        else:
            reject_visit(
                token_claims["visit"],
                VisitRejectRequest(reason=reason.strip()),
                manager_claims,
            )
    except HTTPException as exc:
        if exc.status_code == 409:
            try:
                with cursor() as cur:
                    _, current_status = _email_visitor_manager_claims(
                        cur, token_claims["visit"], token_claims["manager"]
                    )
            except HTTPException:
                raise
            except Exception as status_exc:
                logger.exception("Unable to reload visitor decision status")
                raise HTTPException(
                    status_code=503,
                    detail="Unable to reload this visitor request's status.",
                ) from status_exc
            if current_status != "PENDING":
                return _visitor_email_decision_page(
                    token, action, submitted=True, current_status=current_status
                )
        raise
    except Exception as exc:
        logger.exception("Visitor email decision submission failed")
        raise HTTPException(status_code=503, detail="Unable to record this visitor decision.") from exc
    return _visitor_email_decision_page(token, action, submitted=True)


@app.post("/api/visits/{visit_id}/approve")
def approve_visit(
        visit_id: str, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
        _require_roles(claims, {"ADMIN", "BRANCH_MANAGER"})
        actor = _current_user_name(claims)
        qr_token = _visitor_qr_token(visit_id)
        email_error = False
        manager_notification_status = "NOT_SENT"
        try:
            with cursor() as cur:
                _require_visit_branch_access(cur, visit_id, claims)
                cur.execute(
                    """
                    UPDATE [dbo].[Visits]
                    SET [Status] = 'APPROVED',
                        [QrTokenHash] = ?,
                        [VisitorCode] = COALESCE(NULLIF([VisitorCode], ''),
                            ?),
                        [ReviewedByName] = ?, [ReviewedAt] = SYSUTCDATETIME(),
                        [UpdatedAt] = SYSUTCDATETIME()
                    WHERE [Id] = ? AND [Status] = 'PENDING'
                    """,
                    hashlib.sha256(qr_token.encode()).hexdigest(),
                    _new_visitor_code(),
                    actor,
                    visit_id,
                )
                if cur.rowcount == 0:
                    raise HTTPException(status_code=409, detail="Visit is missing or no longer pending.")
                visit = _legacy_visit(cur, visit_id)
                assert visit is not None
                _append_vms_notification(
                    cur,
                    visit,
                    kind="REQUEST_APPROVED",
                    title="Visitor request approved",
                    body=f"{visit['name']} was approved. The visitor invitation is being sent to {visit['email']}.",
                )
                try:
                    _send_visitor_invitation(visit, qr_token)
                except Exception:
                    logger.exception("Approved visit email delivery failed")
                    email_error = True
                else:
                    cur.execute(
                        "UPDATE [dbo].[Visits] SET [InvitationSentAt] = SYSUTCDATETIME() WHERE [Id] = ?",
                        visit_id,
                    )
                    visit["emailSentAt"] = datetime.now(timezone.utc).isoformat()
                    visit["portalUrl"] = _visitor_checkin_url(qr_token)
                manager_notification_status = _notify_branch_managers_of_approved_visit(
                    cur, visit
                )
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Visit approval failed")
            raise HTTPException(status_code=503, detail="Unable to approve the visit.") from exc
        if email_error:
            raise HTTPException(
                status_code=502,
                detail="Visit approved, but the invitation email could not be sent. Use Resend invitation to retry.",
            )
        visit["branchManagerNotificationStatus"] = manager_notification_status
        return visit


@app.post("/api/visits/{visit_id}/reject")
def reject_visit(
        visit_id: str, body: VisitRejectRequest,
        claims: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
        _require_roles(claims, {"ADMIN", "BRANCH_MANAGER"})
        actor = _current_user_name(claims)
        try:
            with cursor() as cur:
                _require_visit_branch_access(cur, visit_id, claims)
                cur.execute(
                    """
                    UPDATE [dbo].[Visits]
                    SET [Status] = 'REJECTED', [RejectionReason] = ?,
                        [ReviewedByName] = ?, [ReviewedAt] = SYSUTCDATETIME(),
                        [UpdatedAt] = SYSUTCDATETIME()
                    WHERE [Id] = ? AND [Status] = 'PENDING'
                    """,
                    body.reason.strip(), actor, visit_id,
                )
                if cur.rowcount == 0:
                    raise HTTPException(status_code=409, detail="Visit is missing or no longer pending.")
                visit = _legacy_visit(cur, visit_id)
                assert visit is not None
                _append_vms_notification(
                    cur,
                    visit,
                    kind="REQUEST_REJECTED",
                    title="Visitor request rejected",
                    body=f"{visit['name']} was rejected: {body.reason.strip()}",
                )
                return visit
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Visit rejection failed")
            raise HTTPException(status_code=503, detail="Unable to reject the visit.") from exc


@app.post("/api/visits/{visit_id}/cancel")
def cancel_visit(
        visit_id: str, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
        role = _current_role(claims)
        if role not in {"ADMIN", "BRANCH_MANAGER", "EMPLOYEE"}:
            raise HTTPException(status_code=403, detail="You do not have permission to cancel visits.")
        owner_clause = ""
        params: list[Any] = [visit_id]
        if role == "EMPLOYEE":
            owner_clause = " AND ([RequestedByUserId] = ? OR [HostUserId] = ?)"
            params.extend([claims["sub"], claims["sub"]])
        try:
            with cursor() as cur:
                cur.execute(
                    f"""
                    UPDATE [dbo].[Visits]
                    SET [Status] = 'CANCELLED', [CancelledAt] = SYSUTCDATETIME(),
                        [UpdatedAt] = SYSUTCDATETIME()
                    WHERE [Id] = ? AND [Status] NOT IN ('REJECTED', 'CANCELLED', 'CHECKED_OUT')
                    {owner_clause}
                    """,
                    params,
                )
                if cur.rowcount == 0:
                    raise HTTPException(status_code=404, detail="Visit not found or cannot be cancelled.")
                visit = _legacy_visit(cur, visit_id)
                assert visit is not None
                _append_vms_notification(
                    cur,
                    visit,
                    kind="REQUEST_CANCELLED",
                    title="Visitor request cancelled",
                    body=f"{visit['name']}'s visit request was cancelled.",
                )
                return visit
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Visit cancellation failed")
            raise HTTPException(status_code=503, detail="Unable to cancel the visit.") from exc


@app.post("/api/visits/{visit_id}/check-in")
def check_in_visit(
        visit_id: str, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
        raise HTTPException(
            status_code=403,
            detail="Staff check-in is disabled. Visitors must use the secure link in their invitation email.",
        )
        _require_roles(claims, {"ADMIN", "BRANCH_MANAGER"})
        actor = _current_user_name(claims)
        try:
            with cursor() as cur:
                _require_visit_branch_access(cur, visit_id, claims)
                cur.execute(
                    """
                    UPDATE [dbo].[Visits]
                    SET [Status] = 'CHECKED_IN', [CheckedInAt] = SYSUTCDATETIME(),
                        [CheckedInByName] = ?, [UpdatedAt] = SYSUTCDATETIME()
                    WHERE [Id] = ? AND [Status] = 'APPROVED'
                      AND [VisitDate] = CAST(SYSUTCDATETIME() AS date)
                    """,
                    actor, visit_id,
                )
                if cur.rowcount == 0:
                    raise HTTPException(status_code=409, detail="Visit must be approved and scheduled for today.")
                visit = _legacy_visit(cur, visit_id)
                assert visit is not None
                return visit
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Visit check-in failed")
            raise HTTPException(status_code=503, detail="Unable to check in the visitor.") from exc


@app.post("/api/visits/{visit_id}/check-out")
def check_out_visit(
        visit_id: str, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
        raise HTTPException(
            status_code=403,
            detail="Staff check-out is disabled. Visitors return their card to Security, then check out through their email pass.",
        )
        _require_roles(claims, {"ADMIN", "SECURITY"})
        actor = _current_user_name(claims)
        try:
            with cursor() as cur:
                _require_visit_branch_access(cur, visit_id, claims)
                cur.execute(
                    """
                    UPDATE [dbo].[Visits]
                    SET [Status] = 'CHECKED_OUT', [CheckedOutAt] = SYSUTCDATETIME(),
                        [CheckedOutByName] = ?, [UpdatedAt] = SYSUTCDATETIME()
                    WHERE [Id] = ? AND [Status] = 'CHECKED_IN'
                    """,
                    actor, visit_id,
                )
                if cur.rowcount == 0:
                    raise HTTPException(status_code=409, detail="Only a checked-in visitor can be checked out.")
                visit = _legacy_visit(cur, visit_id)
                assert visit is not None
                return visit
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Visit check-out failed")
            raise HTTPException(status_code=503, detail="Unable to check out the visitor.") from exc


@app.get("/api/visits/lookup")
def lookup_visit(
        code: str, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
        _require_roles(claims, {"ADMIN", "SECURITY"})
        try:
            with cursor() as cur:
                cur.execute(
                    "SELECT TOP (1) [Id] FROM [dbo].[Visits] WHERE [VisitorCode] = ? OR [RequestNo] = ?",
                    code.strip(), code.strip(),
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Visitor not found.")
                visit = _legacy_visit(cur, str(row[0]))
                assert visit is not None
                return visit
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Visit lookup failed")
            raise HTTPException(status_code=503, detail="Unable to look up the visitor.") from exc


@app.post("/api/visits/{visit_id}/resend-invite")
def resend_visit_invite(
        visit_id: str, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
        role = _current_role(claims)
        if role not in {"ADMIN", "BRANCH_MANAGER", "EMPLOYEE"}:
            raise HTTPException(status_code=403, detail="You do not have permission to resend this invitation.")
        qr_token = _visitor_qr_token(visit_id)
        email_error = False
        visit: dict[str, Any] | None = None
        try:
            with cursor() as cur:
                if role == "BRANCH_MANAGER":
                    _require_visit_branch_access(cur, visit_id, claims)
                cur.execute("SELECT * FROM [dbo].[Visits] WHERE [Id] = ?", visit_id)
                rows = rows_as_dicts(cur)
                if not rows:
                    raise HTTPException(status_code=404, detail="Visitor request not found.")
                row = rows[0]
                if role == "EMPLOYEE" and str(row.get("RequestedByUserId")) != str(claims["sub"]):
                    raise HTTPException(status_code=403, detail="You can only resend invitations for your own requests.")
                if row.get("Status") not in {"APPROVED", "CARD_ISSUED", "CHECKED_IN"}:
                    raise HTTPException(status_code=409, detail="Only approved visits can receive an invitation.")
                visit = _legacy_visit(cur, visit_id)
                assert visit is not None
                try:
                    _send_visitor_invitation(visit, qr_token)
                except Exception:
                    logger.exception("Visitor invitation resend failed")
                    email_error = True
                else:
                    cur.execute(
                        """
                        UPDATE [dbo].[Visits]
                        SET [QrTokenHash] = ?, [InvitationSentAt] = SYSUTCDATETIME(),
                            [UpdatedAt] = SYSUTCDATETIME()
                        WHERE [Id] = ? AND [Status] IN ('APPROVED', 'CARD_ISSUED', 'CHECKED_IN')
                        """,
                        hashlib.sha256(qr_token.encode()).hexdigest(), visit_id,
                    )
                    if cur.rowcount == 0:
                        raise HTTPException(status_code=409, detail="The visit changed before the invitation was sent.")
                    cur.execute(
                        """
                        INSERT INTO [dbo].[ModuleEvents]
                            ([Id], [ModuleName], [RecordId], [Action], [Note], [ActorUserId], [ActorName], [CreatedAt])
                        VALUES (NEWID(), 'VISIT', ?, 'INVITATION_SENT', 'Visitor invitation email sent',
                                ?, ?, SYSUTCDATETIME())
                        """,
                        visit_id,
                        claims["sub"],
                        _current_user_name(claims),
                    )
                    _append_vms_notification(
                        cur,
                        visit,
                        kind="EMAIL_SENT",
                        title="Visitor invitation sent",
                        body=f"{visit['name']} — visitor invitation emailed to {visit['email']}.",
                        audience=["ADMIN", "SECURITY", "BRANCH_MANAGER"],
                    )
                    visit["emailSentAt"] = datetime.now(timezone.utc).isoformat()
                    visit["portalUrl"] = _visitor_checkin_url(qr_token)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Visitor invitation resend failed")
            raise HTTPException(status_code=503, detail="Unable to resend the visitor invitation.") from exc
        if email_error:
            raise HTTPException(status_code=502, detail="The invitation email could not be sent. Please retry.")
        assert visit is not None
        return visit


@app.get("/api/visits/{visit_id}/pass-link")
def get_visitor_pass_link(
        visit_id: str, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, str | None]:
        role = _current_role(claims)
        if role not in {"ADMIN", "BRANCH_MANAGER", "SECURITY", "EMPLOYEE"}:
            raise HTTPException(status_code=403, detail="You do not have permission to view this visitor pass.")
        try:
            with cursor() as cur:
                if role in {"BRANCH_MANAGER", "SECURITY"}:
                    _require_visit_branch_access(cur, visit_id, claims)
                if role == "EMPLOYEE":
                    cur.execute(
                        """
                        SELECT [Status], [QrTokenHash] FROM [dbo].[Visits]
                        WHERE [Id] = ? AND ([RequestedByUserId] = ? OR [HostUserId] = ?)
                        """,
                        visit_id, claims["sub"], claims["sub"],
                    )
                else:
                    cur.execute(
                        "SELECT [Status], [QrTokenHash] FROM [dbo].[Visits] WHERE [Id] = ?",
                        visit_id,
                    )
                row = cur.fetchone()
                if row is None:
                    raise HTTPException(status_code=404, detail="Visitor request not found.")
                if row.Status not in {"APPROVED", "CARD_ISSUED", "CHECKED_IN"}:
                    return {"portalUrl": None}
                token = _visitor_qr_token(visit_id)
                token_hash = hashlib.sha256(token.encode()).hexdigest()
                if not hmac.compare_digest(str(row.QrTokenHash or ""), token_hash):
                    return {"portalUrl": None}
                return {"portalUrl": _visitor_checkin_url(token)}
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Visitor pass link lookup failed")
            raise HTTPException(status_code=503, detail="Unable to load the visitor pass link.") from exc


@app.post("/api/visits/{visit_id}/issue-guest-pass")
def issue_visitor_guest_pass(
        visit_id: str, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
        visit: dict[str, Any] | None = None
        issue_event = False
        try:
            with cursor() as cur:
                _require_card_issue_access(cur, visit_id, claims)
                cur.execute("SELECT [Status] FROM [dbo].[Visits] WHERE [Id] = ?", visit_id)
                row = cur.fetchone()
                if row is None:
                    raise HTTPException(status_code=404, detail="Visitor request not found.")
                status = str(row[0] or "").upper()
                if status == "APPROVED":
                    cur.execute(
                        """
                        UPDATE [dbo].[Visits]
                        SET [Status] = 'CARD_ISSUED', [UpdatedAt] = SYSUTCDATETIME()
                        WHERE [Id] = ? AND [Status] = 'APPROVED'
                        """,
                        visit_id,
                    )
                    if cur.rowcount == 0:
                        raise HTTPException(status_code=409, detail="The visit changed before the guest card was issued.")
                    issue_event = True
                visit = _legacy_visit(cur, visit_id)
                if visit is None:
                    raise HTTPException(status_code=404, detail="Visitor request not found.")
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Visitor guest pass issuance failed")
            raise HTTPException(status_code=503, detail="Unable to issue the visitor guest pass.") from exc
        if issue_event:
            try:
                actor_name = _current_user_name(claims)
                with cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO [dbo].[ModuleEvents]
                            ([Id], [ModuleName], [RecordId], [Action], [Note], [ActorUserId], [ActorName], [CreatedAt])
                        VALUES (NEWID(), 'VISIT', ?, 'CARD_ISSUED', 'Printable visitor guest pass issued',
                                ?, ?, SYSUTCDATETIME())
                        """,
                        visit_id,
                        claims["sub"],
                        actor_name,
                    )
            except Exception:
                logger.exception("Guest pass issued, but its activity event could not be stored")
            try:
                with cursor() as cur:
                    _append_vms_notification(
                        cur,
                        visit,
                        kind="CARD_ISSUED",
                        title="Guest pass issued",
                        body=f"The printable guest pass was issued for {visit.get('name') or 'the visitor'}.",
                        audience=["ADMIN", "SECURITY", "BRANCH_MANAGER"],
                    )
            except Exception:
                logger.exception("Guest pass issued, but its VMS notification could not be stored")
        return visit


@app.post("/api/visits/{visit_id}/authorize-card-issue")
def authorize_card_issue(
        visit_id: str, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, bool]:
        try:
            with cursor() as cur:
                _require_card_issue_access(cur, visit_id, claims)
            return {"authorized": True}
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Visitor card authorization failed")
            raise HTTPException(status_code=503, detail="Unable to authorize visitor card issuance.") from exc


@app.post("/api/visits/{visit_id}/photo")
def save_visit_photo(
        visit_id: str, _: dict[str, Any] = Depends(current_user)
) -> None:
        raise HTTPException(
            status_code=501,
            detail=f"Visitor photo storage is not available for VMS1 (visit {visit_id}).",
        )


def _virtual_key(table: str) -> str:
    return f"__virtual_table__:{table}"


def _read_virtual(cur: Any, table: str) -> list[dict[str, Any]]:
    cur.execute(
        "SELECT [ValueJson] FROM [dbo].[AppSettings] WITH (UPDLOCK, HOLDLOCK) WHERE [SettingKey] = ?",
        _virtual_key(table),
    )
    result = cur.fetchone()
    if result and result[0]:
        saved_rows = json.loads(result[0])
        if saved_rows or table != "hd_subcategories":
            return saved_rows
    if table == "guest_cards":
        return [
            {
                "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"vms1-guest-card-{number}")),
                "code": f"TEMP-{number:06d}",
                "status": "AVAILABLE",
                "current_visit_id": None,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }
            for number in range(1, 21)
        ]
    if table == "visitor_types":
        return [
            {"code": code, "label": label, "sort_order": index, "active": True}
            for index, (code, label) in enumerate(
                [
                    ("EMPLOYEE", "Internal Visitor"),
                    ("EXTERNAL", "External Visitor"),
                ],
                start=1,
            )
        ]
    if table in {"vms_locations", "ewp_locations"}:
        names = ["Bengaluru Office", "Hosur Office"]
        if table == "vms_locations":
            return [
                {"id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"vms1-location-{name}")), "name": name, "active": True}
                for name in names
            ]
        return [
            {
                "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"vms1-ewp-location-{name}")),
                "building": name, "floor": "", "area": "", "active": True,
            }
            for name in names
        ]
    if table == "emg_incident_types":
        return [
            {"id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"vms1-incident-type-{name}")),
             "name": name, "sort_order": index, "active": True}
            for index, name in enumerate(["Fire", "Building Emergency", "Natural Disaster", "Other Emergency"], 1)
        ]
    if table == "hd_categories":
        return [
            {"id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"vms1-helpdesk-category-{name}")),
             "name": name, "description": "", "sort_order": index, "active": True}
            for index, name in enumerate(["Electrical", "HVAC", "Plumbing", "Housekeeping", "Carpentry", "Other"], 1)
        ]
    if table == "hd_subcategories":
        subcategories = {
            "Electrical": [
                "Light Not Working",
                "Power Socket Issue",
                "Fan Not Working",
                "Wiring / Sparking",
            ],
            "HVAC": [
                "AC Not Cooling",
                "AC Leaking",
                "Ventilation Issue",
                "Thermostat Issue",
            ],
            "Plumbing": [
                "Water Leakage",
                "Blocked Drain",
                "Tap Not Working",
                "Toilet Issue",
            ],
            "Housekeeping": [
                "Restroom Cleaning",
                "Workspace Cleaning",
                "Waste Disposal",
                "Pest Control",
            ],
            "Carpentry": ["Door Repair", "Desk / Chair Repair", "Cabinet Repair"],
            "Other": ["General Request"],
        }
        categories = {
            str(category.get("name") or "").casefold(): str(category.get("id") or "")
            for category in _read_virtual(cur, "hd_categories")
            if category.get("id") and category.get("name")
        }
        return [
            {
                "id": str(
                    uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        f"vms1-helpdesk-subcategory-{category_name}-{name}",
                    )
                ),
                "category_id": categories[category_name.casefold()],
                "name": name,
                "description": "",
                "active": True,
            }
            for category_name, names in subcategories.items()
            if category_name.casefold() in categories
            for name in names
        ]
    if table == "hd_providers":
        return []
    if table == "hd_services":
        return []
    if table == "ewp_vendors":
        return []
    if table == "user_roles":
        return []
    if table == "emg_assembly_points":
        return []
    if table == "hd_notifications" or table == "safety_reports":
        return []
    return []


def _write_virtual(cur: Any, table: str, rows: list[dict[str, Any]]) -> None:
    payload = json.dumps(rows, separators=(",", ":"), ensure_ascii=False)
    cur.execute(
        """
        MERGE [dbo].[AppSettings] WITH (HOLDLOCK) AS target
        USING (SELECT ? AS [SettingKey], ? AS [ValueJson]) AS source
        ON target.[SettingKey] = source.[SettingKey]
        WHEN MATCHED THEN UPDATE SET [ValueJson] = source.[ValueJson], [UpdatedAt] = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT ([SettingKey], [ValueJson]) VALUES (source.[SettingKey], source.[ValueJson]);
        """,
        _virtual_key(table),
        payload,
    )


def _visit_notification_branch_id(cur: Any, visit: dict[str, Any]) -> str | None:
    if visit.get("branchId"):
        return str(visit["branchId"])
    location = visit.get("Location") or visit.get("location")
    if not location:
        return None
    cur.execute(
        """
        SELECT TOP (1) [Id] FROM [dbo].[Branches]
        WHERE [Name] = ? OR [Address] = ?
        ORDER BY CASE WHEN [Name] = ? THEN 0 ELSE 1 END
        """,
        location,
        location,
        location,
    )
    row = cur.fetchone()
    return str(row[0]) if row and row[0] else None


def _append_vms_notification(
    cur: Any,
    visit: dict[str, Any],
    *,
    kind: str,
    title: str,
    body: str,
    audience: list[str] | str = "ALL",
) -> None:
    notification = {
        "id": str(uuid.uuid4()),
        "kind": kind,
        "title": title,
        "body": body,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "refId": str(visit.get("Id") or visit.get("id") or ""),
        "audience": audience,
        "branchId": _visit_notification_branch_id(cur, visit),
        "readByUserIds": [],
    }
    notifications = _read_virtual(cur, "vms_notifications")
    _write_virtual(cur, "vms_notifications", [notification, *notifications[:4999]])


def _vms_notification_visible(
    notification: dict[str, Any], role: str, branch_id: str | None
) -> bool:
    audience = notification.get("audience", "ALL")
    audience_matches = audience == "ALL" or (
        isinstance(audience, list) and role in audience
    )
    notification_branch = notification.get("branchId")
    if role == "ADMIN":
        branch_matches = True
    elif role == "SECURITY":
        branch_matches = bool(
            branch_id
            and notification_branch
            and str(notification_branch) == branch_id
        )
    else:
        branch_matches = (
            not notification_branch
            or (branch_id is not None and str(notification_branch) == branch_id)
        )
    return audience_matches and branch_matches


def _vms_notification_payload(
    notification: dict[str, Any], user_id: str
) -> dict[str, Any]:
    return {
        key: value
        for key, value in notification.items()
        if key != "readByUserIds"
    } | {"read": user_id in (notification.get("readByUserIds") or [])}


@app.get("/api/vms/notifications")
def list_vms_notifications(
    claims: dict[str, Any] = Depends(current_user),
) -> list[dict[str, Any]]:
    role = _current_role(claims)
    try:
        with cursor() as cur:
            cur.execute(
                "SELECT [BranchId] FROM [dbo].[AppUsers] WHERE [Id] = ?",
                claims["sub"],
            )
            user = cur.fetchone()
            if not user:
                raise HTTPException(status_code=401, detail="The account no longer exists.")
            branch_id = str(user[0]) if user[0] else None
            notifications = _read_virtual(cur, "vms_notifications")
            visible = [
                _vms_notification_payload(notification, str(claims["sub"]))
                for notification in notifications
                if _vms_notification_visible(notification, role, branch_id)
            ]
            return sorted(
                visible,
                key=lambda notification: str(notification.get("createdAt") or ""),
                reverse=True,
            )[:100]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("VMS notification listing failed")
        raise HTTPException(status_code=503, detail="Unable to load VMS notifications.") from exc


@app.post("/api/emergencies/{incident_id}/notify")
def notify_emergency_responders(
    incident_id: str,
    claims: dict[str, Any] = Depends(current_user),
) -> dict[str, int]:
    _require_roles(claims, {"ADMIN", "HSE"})
    try:
        with cursor() as cur:
            cur.execute(
                """
                SELECT incident.[Id], incident.[IncidentNo], incident.[Status],
                       incident.[EmergencyType], incident.[Title], incident.[Location],
                       incident.[Building], incident.[Floor], incident.[Area],
                       incident.[SiteId], site.[Name] AS [AssemblyPoint]
                FROM [dbo].[EvacuationIncidents] AS incident
                LEFT JOIN [dbo].[EvacSites] AS site ON site.[Id] = incident.[SiteId]
                WHERE incident.[Id] = ?
                """,
                incident_id,
            )
            incident_row = cur.fetchone()
            if not incident_row:
                raise HTTPException(status_code=404, detail="Emergency incident not found.")
            incident = dict(zip((column[0] for column in cur.description), incident_row))
            if str(incident["Status"] or "").upper() != "ACTIVE":
                raise HTTPException(status_code=409, detail="Only active emergencies can notify responders.")

            cur.execute(
                """
                SELECT TOP (1) [Id]
                FROM [dbo].[Branches]
                WHERE [IsActive] = 1 AND ([Name] = ? OR [Address] = ?)
                ORDER BY CASE WHEN [Name] = ? THEN 0 ELSE 1 END
                """,
                incident.get("Location"),
                incident.get("Location"),
                incident.get("Location"),
            )
            branch = cur.fetchone()
            if not branch:
                raise HTTPException(
                    status_code=409,
                    detail="The emergency location is not mapped to an active branch; no users were notified.",
                )
            branch_id = branch[0]
            cur.execute(
                """
                SELECT responder.[Id], responder.[Name], responder.[Email]
                FROM [dbo].[AppUsers] AS responder
                INNER JOIN [dbo].[Branches] AS branch ON branch.[Id] = responder.[BranchId]
                WHERE responder.[IsActive] = 1 AND branch.[IsActive] = 1
                  AND responder.[BranchId] = ?
                  AND UPPER(responder.[Role]) NOT IN ('ADMIN', 'HSE', 'FIRE_WARDEN')
                ORDER BY responder.[Name]
                """,
                branch_id,
            )
            responders = rows_as_dicts(cur)
            cur.execute(
                "SELECT [UserId] FROM [dbo].[EvacuationResponses] WHERE [IncidentId] = ?",
                incident_id,
            )
            existing_ids = {str(row[0]) for row in cur.fetchall()}
            for responder in responders:
                responder_id = str(responder["Id"])
                if responder_id in existing_ids:
                    continue
                cur.execute(
                    """
                    INSERT INTO [dbo].[EvacuationResponses]
                        ([Id], [IncidentId], [UserId], [SafetyStatus],
                         [AssistanceStatus], [NotificationStatus])
                    VALUES (NEWID(), ?, ?, 'NOT_RESPONDED', 'PENDING', 'SENT')
                    """,
                    incident_id,
                    responder_id,
                )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Emergency responder notification setup failed for incident %s", incident_id)
        raise HTTPException(
            status_code=503,
            detail="Unable to create emergency response records.",
        ) from exc

    emails_sent = 0
    emails_failed = 0
    emails_missing = 0
    for responder in responders:
        address = str(responder.get("Email") or "").strip()
        if not address or "\r" in address or "\n" in address:
            emails_missing += 1
            continue
        try:
            _send_emergency_response_email(responder, incident)
            emails_sent += 1
        except Exception:
            logger.exception(
                "Emergency email delivery failed for incident %s and user %s",
                incident_id,
                responder["Id"],
            )
            emails_failed += 1

    return {
        "notified": len(responders),
        "emails_sent": emails_sent,
        "emails_failed": emails_failed,
        "emails_missing": emails_missing,
    }


def _emergency_response_page(
    token: str, *, submitted_status: str | None = None
) -> HTMLResponse:
    response_label = {
        "SAFE": "I'm safe",
        "NEEDS_ASSISTANCE": "I need support",
    }
    if submitted_status:
        label = html.escape(response_label[submitted_status])
        content = (
            "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            "<title>Emergency response recorded</title>"
            "<body style=\"font:16px system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:24px\">"
            "<h1>Response recorded</h1>"
            f"<p>Your response, <strong>{label}</strong>, has been recorded.</p>"
            "<p>Follow the emergency instructions and proceed to the designated safe location.</p>"
            "</body></html>"
        )
    else:
        claims = _decode_emergency_email_response_token(token)
        label = html.escape(response_label[claims["status"]])
        action_url = f"{settings.api_public_url.rstrip('/')}/emergencies/email-response"
        safe_token = html.escape(token, quote=True)
        content = (
            "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            "<title>Confirm emergency response</title>"
            "<body style=\"font:16px system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:24px\">"
            "<h1>Confirm your emergency response</h1>"
            f"<p>You selected: <strong>{label}</strong>.</p>"
            "<p>Only confirm after you have reached safety or need assistance.</p>"
            f'<form method="post" action="{html.escape(action_url, quote=True)}">'
            f'<input type="hidden" name="token" value="{safe_token}">'
            '<button type="submit" style="padding:14px 20px;font-size:16px;'
            'font-weight:bold;background:#155eef;color:#fff;border:0;border-radius:8px">'
            "Confirm response</button></form></body></html>"
        )
    return HTMLResponse(
        content,
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )


@app.get("/api/emergencies/email-response", response_class=HTMLResponse)
def preview_emergency_email_response(
    token: str = Query(..., min_length=32, max_length=2048),
) -> HTMLResponse:
    _decode_emergency_email_response_token(token)
    return _emergency_response_page(token)


@app.post("/api/emergencies/email-response", response_class=HTMLResponse)
def submit_emergency_email_response(
    token: str = Form(..., min_length=32, max_length=2048),
) -> HTMLResponse:
    claims = _decode_emergency_email_response_token(token)
    try:
        with cursor() as cur:
            cur.execute(
                """
                UPDATE response
                SET [SafetyStatus] = ?,
                    [RespondedAt] = SYSUTCDATETIME(),
                    [NotificationStatus] = 'READ',
                    [ReadAt] = COALESCE([ReadAt], SYSUTCDATETIME())
                FROM [dbo].[EvacuationResponses] AS response
                INNER JOIN [dbo].[EvacuationIncidents] AS incident
                    ON incident.[Id] = response.[IncidentId]
                WHERE response.[IncidentId] = ?
                  AND response.[UserId] = ?
                  AND response.[SafetyStatus] = 'NOT_RESPONDED'
                  AND incident.[Status] = 'ACTIVE'
                """,
                claims["status"],
                claims["incident"],
                claims["user"],
            )
            if cur.rowcount == 0:
                raise HTTPException(
                    status_code=409,
                    detail="This emergency is closed, or a response has already been recorded.",
                )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Emergency email response submission failed")
        raise HTTPException(
            status_code=503, detail="Unable to record your emergency response."
        ) from exc
    return _emergency_response_page(token, submitted_status=claims["status"])


@app.post("/api/vms/notifications/read")
def mark_vms_notifications_read(
    body: VmsNotificationReadRequest,
    claims: dict[str, Any] = Depends(current_user),
) -> dict[str, int]:
    role = _current_role(claims)
    user_id = str(claims["sub"])
    try:
        with cursor() as cur:
            cur.execute(
                "SELECT [BranchId] FROM [dbo].[AppUsers] WHERE [Id] = ?",
                user_id,
            )
            user = cur.fetchone()
            if not user:
                raise HTTPException(status_code=401, detail="The account no longer exists.")
            branch_id = str(user[0]) if user[0] else None
            requested_ids = set(body.ids) if body.ids is not None else None
            notifications = _read_virtual(cur, "vms_notifications")
            updated = 0
            for notification in notifications:
                if (
                    (requested_ids is None or notification.get("id") in requested_ids)
                    and _vms_notification_visible(notification, role, branch_id)
                ):
                    readers = notification.get("readByUserIds") or []
                    if user_id not in readers:
                        readers.append(user_id)
                        updated += 1
                    notification["readByUserIds"] = readers
            _write_virtual(cur, "vms_notifications", notifications)
            return {"updated": updated}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("VMS notification read update failed")
        raise HTTPException(status_code=503, detail="Unable to update VMS notifications.") from exc


def _filter_virtual(rows: list[dict[str, Any]], filters: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def matches(row: dict[str, Any], clause: dict[str, Any]) -> bool:
        column = str(clause.get("column", ""))
        value = row.get(column)
        expected = clause.get("value")
        operator = clause.get("op", "eq")
        if operator == "eq":
            return value == expected
        if operator == "in":
            return value in (expected or [])
        if operator == "ilike":
            pattern = str(expected or "").replace("%", "").lower()
            return pattern in str(value or "").lower()
        return False

    return [row for row in rows if all(matches(row, clause) for clause in filters)]


def _virtual_query(cur: Any, table: str, body: QueryRequest) -> dict[str, Any]:
    rows = _read_virtual(cur, table)
    if body.action == "select":
        filtered = _filter_virtual(rows, body.filters)
        count = len(filtered)
        for order in reversed(body.order):
            column = str(order.get("column", ""))
            filtered.sort(
                key=lambda row: str(row.get(column, "")),
                reverse=not bool(order.get("ascending", True)),
            )
        if body.limit is not None:
            filtered = filtered[: max(0, body.limit)]
        if body.columns != "*":
            fields = [field.strip() for field in body.columns.split(",")]
            filtered = [{field: row.get(field) for field in fields} for row in filtered]
        return {"data": None if body.head else filtered, "error": None, "count": count if body.count else None}

    if body.action in {"insert", "upsert"}:
        incoming = body.data if isinstance(body.data, list) else [body.data or {}]
        affected = []
        for item in incoming:
            row = dict(item)
            row.setdefault("id", str(uuid.uuid4()))
            index = next((i for i, current in enumerate(rows) if current.get("id") == row["id"]), -1)
            if index >= 0 and body.action == "upsert":
                rows[index] = {**rows[index], **row}
                affected.append(rows[index])
            else:
                rows.insert(0, row)
                affected.append(row)
        if len(rows) > 10000:
            raise HTTPException(status_code=413, detail="Virtual table capacity exceeded.")
        _write_virtual(cur, table, rows)
        return {"data": affected if body.action == "insert" else [], "error": None, "count": len(affected) if body.count else None}

    if body.action == "update":
        if not body.filters:
            raise HTTPException(status_code=400, detail="Update requires at least one filter.")
        patch = body.data if isinstance(body.data, dict) else {}
        affected = []
        for index, row in enumerate(rows):
            if _filter_virtual([row], body.filters):
                rows[index] = {**row, **patch, "updated_at": datetime.utcnow().isoformat()}
                affected.append(rows[index])
        _write_virtual(cur, table, rows)
        return {"data": affected, "error": None, "count": len(affected) if body.count else None}

    if body.action == "delete":
        if not body.filters:
            raise HTTPException(status_code=400, detail="Delete requires at least one filter.")
        affected = _filter_virtual(rows, body.filters)
        ids = {row.get("id") for row in affected}
        _write_virtual(cur, table, [row for row in rows if row.get("id") not in ids])
        return {"data": affected, "error": None, "count": len(affected) if body.count else None}

    raise HTTPException(status_code=400, detail="Unsupported database operation.")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "database": settings.sql_database}


@app.get("/api/health/database")
def database_health(_: dict[str, Any] = Depends(current_user)) -> dict[str, str]:
    try:
        with cursor() as cur:
            cur.execute("SELECT DB_NAME()")
            name = cur.fetchone()[0]
        return {"status": "connected", "database": name}
    except Exception as exc:
        logger.exception("Database health check failed")
        raise HTTPException(status_code=503, detail="Unable to connect to the configured SQL Server database.") from exc


@app.post("/api/rpc/{name}")
def run_rpc(
    name: str,
    body: RpcRequest,
    claims: dict[str, Any] = Depends(current_user),
) -> Any:
    if name == "expire_stale_visit_requests":
        _require_roles(claims, {"ADMIN", "BRANCH_MANAGER", "SECURITY"})
        try:
            with cursor() as cur:
                cur.execute(
                    """
                    UPDATE [dbo].[Visits]
                    SET [Status] = 'EXPIRED', [UpdatedAt] = SYSUTCDATETIME()
                    WHERE [VisitDate] < CAST(SYSUTCDATETIME() AS date)
                      AND [Status] NOT IN ('REJECTED', 'CANCELLED', 'CHECKED_OUT', 'COMPLETED', 'EXPIRED')
                    """
                )
                return max(cur.rowcount, 0)
        except Exception as exc:
            logger.exception("Stale visit expiration failed")
            raise HTTPException(status_code=503, detail="Unable to expire stale visit requests.") from exc

    if name not in {"emg_mark_read", "emg_confirm_safety"}:
        raise HTTPException(status_code=404, detail=f"Unknown database operation: {name}")
    _current_role(claims)
    if not body.incident:
        raise HTTPException(status_code=400, detail="An incident ID is required.")
    if name == "emg_confirm_safety" and body.status not in {"SAFE", "NEEDS_ASSISTANCE"}:
        raise HTTPException(status_code=400, detail="Invalid safety response.")
    try:
        with cursor() as cur:
            if name == "emg_confirm_safety":
                cur.execute(
                    "SELECT [Status] FROM [dbo].[EvacuationIncidents] WHERE [Id] = ?",
                    body.incident,
                )
                incident = cur.fetchone()
                if not incident or incident.Status != "ACTIVE":
                    raise HTTPException(status_code=409, detail="This emergency is no longer active.")
                cur.execute(
                    """
                    UPDATE [dbo].[EvacuationResponses]
                    SET [SafetyStatus] = ?, [RespondedAt] = SYSUTCDATETIME()
                    WHERE [IncidentId] = ? AND [UserId] = ? AND [SafetyStatus] = 'NOT_RESPONDED'
                    """,
                    body.status, body.incident, claims["sub"],
                )
            else:
                cur.execute(
                    """
                    UPDATE [dbo].[EvacuationResponses]
                    SET [NotificationStatus] = 'READ', [ReadAt] = SYSUTCDATETIME()
                    WHERE [IncidentId] = ? AND [UserId] = ?
                    """,
                    body.incident, claims["sub"],
                )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="No response row exists for this user and incident.")
            return None
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Emergency response operation failed: %s", name)
        raise HTTPException(status_code=503, detail="Unable to update the emergency response.") from exc


def _file_path(bucket: str, relative_path: str) -> Any:
    if bucket != "helpdesk-evidence":
        raise HTTPException(status_code=400, detail="Unsupported file bucket.")
    normalized = relative_path.replace("\\", "/")
    parts = normalized.split("/")
    if not normalized or any(part in {"", ".", ".."} for part in parts):
        raise HTTPException(status_code=400, detail="Invalid file path.")
    if any(not re.fullmatch(r"[A-Za-z0-9._-]+", part) for part in parts):
        raise HTTPException(status_code=400, detail="Invalid file path.")
    root = settings.upload_directory.resolve()
    path = (root / bucket / Path(*parts)).resolve()
    if os.path.commonpath((str(root), str(path))) != str(root):
        raise HTTPException(status_code=400, detail="Invalid file path.")
    return path


def _file_signature(bucket: str, relative_path: str, expires: int) -> str:
    payload = json.dumps(
        {"bucket": bucket, "path": relative_path, "exp": expires},
        separators=(",", ":"),
    ).encode()
    encoded = base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")
    signature = hmac.new(settings.jwt_secret.encode(), encoded.encode(), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


@app.post("/api/files")
async def upload_file(
    bucket: str = Form(...),
    path: str = Form(...),
    file: UploadFile = File(...),
    claims: dict[str, Any] = Depends(current_user),
) -> dict[str, str]:
    _current_role(claims)
    destination = _file_path(bucket, path)
    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="File exceeds the configured upload limit.")
    if not content:
        raise HTTPException(status_code=400, detail="Empty files are not allowed.")
    if destination.exists():
        raise HTTPException(status_code=409, detail="A file already exists at this path.")
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("xb") as output:
            output.write(content)
    except OSError as exc:
        logger.exception("File upload failed")
        raise HTTPException(status_code=500, detail="Unable to store the uploaded file.") from exc
    return {"path": path.replace("\\", "/")}


@app.get("/api/files/signed-url")
def create_file_url(
    bucket: str,
    path: str,
    expires_in: int = Query(3600, ge=60, le=86400),
    claims: dict[str, Any] = Depends(current_user),
) -> dict[str, str]:
    _current_role(claims)
    stored = _file_path(bucket, path)
    if not stored.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    expires = int(datetime.now().timestamp()) + expires_in
    token = _file_signature(bucket, path, expires)
    return {"signedUrl": f"{settings.api_public_url}/files/{token}"}


@app.get("/api/files/{token}")
def download_file(token: str) -> FileResponse:
    try:
        encoded, signature = token.split(".", 1)
        expected = hmac.new(settings.jwt_secret.encode(), encoded.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("Invalid signature")
        decoded = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        payload = json.loads(decoded)
        if int(payload["exp"]) < int(datetime.now().timestamp()):
            raise ValueError("Expired link")
        stored = _file_path(str(payload["bucket"]), str(payload["path"]))
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=403, detail="Invalid or expired file link.") from exc
    if not stored.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(stored)


@app.post("/api/auth/login")
def login(body: LoginRequest) -> dict[str, Any]:
    try:
        with cursor() as cur:
            cur.execute(
                """
                SELECT [Id], [Name], [Email], [Phone], [Department], [Designation],
                       [BranchId], [EmployeeNo], [Role], [PasswordHash], [IsActive]
                FROM [dbo].[AppUsers]
                WHERE LOWER([Email]) = LOWER(?)
                """,
                body.email.strip(),
            )
            row = cur.fetchone()
    except Exception as exc:
        logger.exception("Login query failed")
        raise HTTPException(status_code=503, detail="Unable to validate credentials.") from exc
    if not row or not row.IsActive or not verify_password(body.password, row.PasswordHash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    user = {
        "id": str(row.Id),
        "name": row.Name,
        "email": row.Email,
        "phone": row.Phone,
        "department": row.Department,
        "designation": row.Designation,
        "branchId": str(row.BranchId) if row.BranchId else None,
        "employeeId": row.EmployeeNo,
        "role": row.Role,
        "status": "ACTIVE",
    }
    return {"access_token": create_access_token(user["id"], user["role"]), "token_type": "bearer", "user": user}


@app.get("/api/auth/me")
def me(claims: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    try:
        with cursor() as cur:
            cur.execute(
                """
                SELECT [Id], [Name], [Email], [Phone], [Department], [Designation],
                       [BranchId], [EmployeeNo], [Role], [IsActive]
                FROM [dbo].[AppUsers] WHERE [Id] = ?
                """,
                claims["sub"],
            )
            row = cur.fetchone()
    except Exception as exc:
        logger.exception("Session lookup failed")
        raise HTTPException(status_code=503, detail="Unable to validate the session.") from exc
    if not row or not row.IsActive:
        raise HTTPException(status_code=401, detail="The account is inactive or no longer exists.")
    return {
        "id": str(row.Id), "name": row.Name, "email": row.Email, "phone": row.Phone,
        "department": row.Department, "designation": row.Designation,
        "branchId": str(row.BranchId) if row.BranchId else None,
        "employeeId": row.EmployeeNo, "role": row.Role, "status": "ACTIVE",
    }


@app.post("/api/db/{table}")
def database_query(
    table: str,
    body: QueryRequest,
    claims: dict[str, Any] = Depends(current_user),
    background_tasks: BackgroundTasks = None,
) -> dict[str, Any]:
    if table not in TABLES:
        raise HTTPException(status_code=404, detail=f"Unknown application table: {table}")
    claims = {**claims, "role": _current_role(claims)}
    if table == "profiles" and body.action != "select":
        raise HTTPException(status_code=405, detail="Manage users through the user endpoints.")
    if table in {"branches", "visitor_types", "vms_locations", "guest_cards",
                 "emg_assembly_points", "emg_incident_types", "ewp_vendors", "ewp_locations",
                 "hd_categories", "hd_subcategories", "hd_services", "hd_providers",
                 "hd_buildings", "hd_building_floors", "hd_building_areas", "user_roles"}:
        if body.action in {"insert", "update", "upsert", "delete"}:
            _ensure_admin(claims)
    if table == "hd_feedback":
        raise HTTPException(status_code=405, detail="Use the Helpdesk feedback endpoints.")
    if body.action not in {"select", "insert", "upsert", "update", "delete"}:
        raise HTTPException(status_code=400, detail="Unsupported database operation.")
    if body.limit is not None and not 0 <= body.limit <= 5000:
        raise HTTPException(status_code=400, detail="Query limit must be between 0 and 5000.")
    if table == "hd_tickets" and body.action in {"insert", "upsert"}:
        _require_roles(
            claims,
            {"ADMIN", "BRANCH_MANAGER", "EMPLOYEE", "SECURITY", "HSE"},
        )
    if table == "hd_tickets" and body.action == "update":
        changes = body.data if isinstance(body.data, dict) else {}
        mapped_changes = {
            _field(table, key, None).casefold(): value
            for key, value in changes.items()
        }
        if (
            {"providername", "assignedat"} & mapped_changes.keys()
            or str(mapped_changes.get("status") or "").upper() == "ASSIGNED"
        ):
            raise HTTPException(
                status_code=403,
                detail="Assign tickets through the service provider assignment workflow.",
            )

    physical, module = _table_name(table)
    if table == "profiles" and body.action != "select":
        _ensure_admin(claims)
    if table == "visit_requests" and body.action in {"update", "delete"}:
        _require_roles(claims, {"ADMIN", "BRANCH_MANAGER"})
    if table in {"emergencies", "emg_assembly_points", "emg_incident_types"}:
        if body.action in {"insert", "update", "upsert", "delete"}:
            _require_roles(claims, {"ADMIN", "HSE"})
    if table == "safety_reports":
        _require_safety_report_mutation_access(claims, body.action)
    if table == "work_permits":
        if body.action != "select":
            raise HTTPException(
                status_code=405,
                detail="Change work permits through the validated E-Work Permit workflow actions.",
            )
    if table in {"ewp_workers", "ewp_attendance", "ewp_events"} and body.action != "select":
        raise HTTPException(
            status_code=405,
            detail="Change E-Work Permit records through the validated permit workflow actions.",
        )
    if table in {"ewp_events", "hd_ticket_events"} and body.action != "select":
        if body.action != "insert":
            raise HTTPException(status_code=405, detail="Module event history is append-only.")
        _require_roles(
            claims,
            {"ADMIN", "HSE", "SERVICE_PROVIDER", "SECURITY"}
            if table == "ewp_events"
            else {
                "ADMIN",
                "BRANCH_MANAGER",
                "EMPLOYEE",
                "HSE",
                "SECURITY",
                "SERVICE_PROVIDER",
            },
        )
    if table == "emg_activity":
        _require_roles(claims, {"ADMIN", "HSE", "FIRE_WARDEN", "EMPLOYEE"})
        if body.action in {"update", "upsert", "delete"}:
            raise HTTPException(status_code=405, detail="Module event history is append-only.")
        if body.action == "insert":
            _require_roles(claims, {"ADMIN", "HSE", "FIRE_WARDEN"})
    if table in {"ewp_events", "hd_ticket_events"} and body.action == "select":
        _require_roles(
            claims,
            {"ADMIN", "HSE", "SERVICE_PROVIDER", "SECURITY"}
            if table == "ewp_events"
            else {
                "ADMIN",
                "BRANCH_MANAGER",
                "EMPLOYEE",
                "HSE",
                "SECURITY",
                "SERVICE_PROVIDER",
            },
        )
    if table in {"hd_tickets", "hd_ticket_events", "hd_evidence"} and body.action in {"delete"}:
        _require_roles(claims, {"ADMIN", "SERVICE_PROVIDER"})
    if table in {"visit_events", "emg_activity", "ewp_events"} and body.action != "select":
        if body.action != "insert":
            raise HTTPException(status_code=405, detail="Module event history is append-only.")
        _require_roles(
            claims,
            {
                "visit_events": {"ADMIN", "BRANCH_MANAGER", "SECURITY", "EMPLOYEE"},
                "emg_activity": {"ADMIN", "HSE", "FIRE_WARDEN"},
                "ewp_events": {"ADMIN", "HSE", "SERVICE_PROVIDER"},
            }[table],
        )
    if table == "emg_incident_employees" and body.action in {"insert", "upsert", "delete"}:
        _require_roles(claims, {"ADMIN", "HSE"})
    if table == "emg_incident_employees" and body.action == "update":
        _require_roles(claims, {"ADMIN", "HSE", "FIRE_WARDEN"})
    if table == "hd_notifications":
        if body.action == "update":
            changes = body.data if isinstance(body.data, dict) else {}
            if changes != {"is_read": True}:
                raise HTTPException(
                    status_code=400,
                    detail="Notifications can only be marked as read.",
                )
        if body.action in {"select", "update", "delete"}:
            body.filters.append(
                {"column": "recipient_id", "op": "eq", "value": claims["sub"]}
            )
        if body.action == "delete":
            _require_roles(claims, {"ADMIN", "SERVICE_PROVIDER"})
    if table == "branches" and body.action in {"insert", "update", "upsert", "delete"}:
        _ensure_admin(claims)
    if physical == "[dbo].[AppSettings]":
        with cursor() as cur:
            floor_renames: list[tuple[str, str, str]] = []
            if table == "hd_buildings" and body.action in {"insert", "upsert", "update"}:
                incoming = body.data if isinstance(body.data, list) else [body.data or {}]
                for row in incoming:
                    if row.get("active", True) and (
                        not str(row.get("name") or "").strip()
                        or not str(row.get("branch_id") or "").strip()
                    ):
                        raise HTTPException(
                            status_code=400,
                            detail="An active Helpdesk building requires a name and branch.",
                        )
                    radius = row.get("radius_m", 100)
                    try:
                        radius = int(radius)
                    except (TypeError, ValueError) as exc:
                        raise HTTPException(status_code=400, detail="Enter a valid building geofence radius.") from exc
                    if not 25 <= radius <= 5000:
                        raise HTTPException(status_code=400, detail="Building geofence radius must be between 25 and 5000 metres.")
                    latitude = row.get("latitude")
                    longitude = row.get("longitude")
                    if (latitude is None) != (longitude is None):
                        raise HTTPException(status_code=400, detail="Enter both building geofence coordinates.")
                    if latitude is not None:
                        try:
                            latitude, longitude = float(latitude), float(longitude)
                        except (TypeError, ValueError) as exc:
                            raise HTTPException(status_code=400, detail="Enter valid building geofence coordinates.") from exc
                        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
                            raise HTTPException(status_code=400, detail="Enter valid building geofence coordinates.")
                    if row.get("active", True) and (latitude is None or longitude is None):
                        raise HTTPException(
                            status_code=400,
                            detail="Configure geofence coordinates before activating a Helpdesk building.",
                        )
                    cur.execute(
                        "SELECT 1 FROM [dbo].[Branches] WHERE [Id] = ? AND [IsActive] = 1",
                        str(row.get("branch_id") or ""),
                    )
                    if not cur.fetchone():
                        raise HTTPException(status_code=400, detail="Choose an active branch for the Helpdesk building.")
            if table == "hd_building_areas" and body.action in {"insert", "upsert", "update"}:
                incoming = body.data if isinstance(body.data, list) else [body.data or {}]
                building_rows = _read_virtual(cur, "hd_buildings")
                buildings = {row.get("id") for row in building_rows}
                floors = _read_virtual(cur, "hd_building_floors")
                existing_areas = _read_virtual(cur, "hd_building_areas")
                for row in incoming:
                    if not str(row.get("building_id") or "").strip() or row.get("building_id") not in buildings:
                        raise HTTPException(status_code=400, detail="Choose a valid Helpdesk building for this area.")
                    if not str(row.get("floor") or "").strip() or not str(row.get("name") or "").strip():
                        raise HTTPException(status_code=400, detail="An area requires a floor and area name.")
                    floor_name = str(row["floor"]).strip().casefold()
                    building_id = str(row["building_id"])
                    configured_floors = [
                        floor
                        for floor in floors
                        if str(floor.get("name") or "").strip().casefold() == floor_name
                    ]
                    floor_exists = any(
                        str(floor.get("name") or "").strip().casefold() == floor_name
                        and floor.get("active", True)
                        for floor in floors
                    )
                    legacy_floor_exists = not configured_floors and any(
                        str(area.get("building_id") or "") == building_id
                        and str(area.get("floor") or "").strip().casefold() == floor_name
                        for area in existing_areas
                    )
                    existing_area = next(
                        (
                            area
                            for area in existing_areas
                            if str(area.get("id") or "") == str(row.get("id") or "")
                            and str(area.get("building_id") or "") == building_id
                            and str(area.get("floor") or "").strip().casefold() == floor_name
                        ),
                        None,
                    )
                    if not (floor_exists or legacy_floor_exists or existing_area):
                        raise HTTPException(status_code=400, detail="Choose a floor configured for this building.")
            if table == "hd_building_floors" and body.action in {"insert", "upsert", "update"}:
                incoming = body.data if isinstance(body.data, list) else [body.data or {}]
                buildings = {row.get("id") for row in _read_virtual(cur, "hd_buildings")}
                existing_floors = _read_virtual(cur, "hd_building_floors")
                for row in incoming:
                    building_id = str(row.get("building_id") or "")
                    name = str(row.get("name") or "").strip()
                    floor_number = str(row.get("floor_number") or name).strip()
                    if (building_id and building_id not in buildings) or not name or not floor_number:
                        raise HTTPException(status_code=400, detail="A floor requires a valid floor number and, when scoped, a valid building.")
                    existing_floor = next(
                        (
                            floor
                            for floor in existing_floors
                            if str(floor.get("id") or "") == str(row.get("id") or "")
                        ),
                        None,
                    )
                    unchanged_identity = (
                        existing_floor is not None
                        and str(existing_floor.get("name") or "").strip().casefold()
                        == name.casefold()
                        and str(
                            existing_floor.get("floor_number")
                            or existing_floor.get("name")
                            or ""
                        )
                        .strip()
                        .casefold()
                        == floor_number.casefold()
                    )
                    if not unchanged_identity:
                        duplicate = any(
                            str(floor.get("id") or "") != str(row.get("id") or "")
                            and (
                                str(floor.get("name") or "").strip().casefold() == name.casefold()
                                or str(floor.get("floor_number") or floor.get("name") or "").strip().casefold()
                                == floor_number.casefold()
                            )
                            for floor in existing_floors
                        )
                        if duplicate:
                            raise HTTPException(status_code=409, detail="That floor number or name already exists.")
                floor_renames = [
                    (
                        str(previous.get("building_id") or ""),
                        str(previous.get("name") or "").strip().casefold(),
                        str(row.get("name") or "").strip(),
                    )
                    for row in incoming
                    for previous in existing_floors
                    if str(previous.get("id") or "") == str(row.get("id") or "")
                    and str(previous.get("name") or "").strip()
                    and str(previous.get("name") or "").strip()
                    != str(row.get("name") or "").strip()
                ]
            if table == "hd_buildings" and body.action == "delete":
                buildings = _filter_virtual(
                    _read_virtual(cur, "hd_buildings"), body.filters
                )
                building_ids = {
                    str(building.get("id") or "")
                    for building in buildings
                    if building.get("id")
                }
                for building_id in building_ids:
                    _require_helpdesk_building_deletable(cur, building_id)
                if building_ids:
                    for child_table in ("hd_building_floors", "hd_building_areas"):
                        children = _read_virtual(cur, child_table)
                        _write_virtual(
                            cur,
                            child_table,
                            [
                                row
                                for row in children
                                if str(row.get("building_id") or "") not in building_ids
                            ],
                        )
            result = _virtual_query(cur, table, body)
            if floor_renames:
                areas = _read_virtual(cur, "hd_building_areas")
                changed = False
                rename_lookup = {old_name: new_name for _, old_name, new_name in floor_renames}
                for area in areas:
                    key = str(area.get("floor") or "").strip().casefold()
                    renamed = rename_lookup.get(key)
                    if renamed:
                        area["floor"] = renamed
                        changed = True
                if changed:
                    _write_virtual(cur, "hd_building_areas", areas)
            return result

    try:
        with cursor() as cur:
            if body.action == "select":
                if table == "profiles" and body.columns.strip() == "*":
                    fields = [
                        "[Id]", "[Name]", "[Email]", "[Phone]", "[Department]",
                        "[Designation]", "[BranchId]", "[EmployeeNo]", "[Role]",
                        "[IsActive]", "[CreatedAt]", "[UpdatedAt]",
                    ]
                else:
                    fields = _select_fields(table, body.columns, module)
                where, params = _where_clause(table, body.filters, module)
                scope, scope_params = _scope_clause(table, claims)
                if scope:
                    where += f" AND ({scope})" if where else f" WHERE ({scope})"
                    params.extend(scope_params)
                if module:
                    where = f"{where} AND [ModuleName] = ?" if where else " WHERE [ModuleName] = ?"
                    params.append(module)
                sql = f"SELECT {', '.join(fields)} FROM {physical}{where}"
                order_sql = []
                for order in body.order:
                    name = _field(table, str(order.get("column", "")), module)
                    order_sql.append(f"[{name}] {'ASC' if order.get('ascending', True) else 'DESC'}")
                if order_sql:
                    sql += " ORDER BY " + ", ".join(order_sql)
                elif body.limit is not None:
                    sql += " ORDER BY [Id]"
                if body.limit is not None:
                    sql = sql.replace("SELECT ", "SELECT TOP (?) ", 1)
                    params.insert(0, body.limit)
                cur.execute(sql, params)
                rows = rows_as_dicts(cur) if not body.head else []
                data = [_normalize(table, row, module) for row in rows]
                count = None
                if body.count:
                    count_sql = f"SELECT COUNT_BIG(1) FROM {physical}{where}"
                    count_params = params[1:] if body.limit is not None else params
                    cur.execute(count_sql, count_params)
                    count = int(cur.fetchone()[0])
                return {"data": None if body.head else data, "error": None, "count": count}

            if body.action in {"insert", "upsert"}:
                incoming = body.data if isinstance(body.data, list) else [body.data or {}]
                affected = []
                for item in incoming:
                    row_data = dict(item)
                    if table == "visit_requests":
                        _require_visit_create_access(claims, row_data)
                        if claims["role"] == "SECURITY":
                            row_data["source"] = "WALK_IN"
                            row_data["status"] = "PENDING"
                        row_data = _prepare_visit_insert(row_data)
                        _validate_visit_schedule(row_data)
                    if (
                        table == "visit_requests"
                        and "visitor_type" in row_data
                        and row_data["visitor_type"] not in VISITOR_TYPE_CODES
                    ):
                        raise HTTPException(
                            status_code=400,
                            detail="Visitor type must be Internal Visitor or External Visitor.",
                        )
                    if table == "visit_requests":
                        _apply_internal_visitor(cur, row_data)
                        row_data["requested_by"] = claims["sub"]
                        if claims["role"] in {"EMPLOYEE", "SECURITY"}:
                            row_data["status"] = "PENDING"
                            row_data.pop("reviewed_by_name", None)
                            row_data.pop("reviewed_at", None)
                        if claims["role"] == "BRANCH_MANAGER":
                            cur.execute(
                                """
                                SELECT manager.[Name],
                                    CASE WHEN EXISTS (
                                        SELECT 1
                                        FROM [dbo].[Branches] AS branch
                                        WHERE branch.[Id] = manager.[BranchId]
                                          AND (
                                              branch.[Name] = ?
                                              OR branch.[Address] = ?
                                          )
                                    ) THEN 1 ELSE 0 END AS [ManagesLocation]
                                FROM [dbo].[AppUsers] AS manager
                                WHERE manager.[Id] = ?
                                """,
                                row_data.get("location"),
                                row_data.get("location"),
                                claims["sub"],
                            )
                            manager = cur.fetchone()
                            if manager is None:
                                raise HTTPException(
                                    status_code=401,
                                    detail="The branch manager account no longer exists.",
                                )
                            row_data = _prepare_branch_manager_visit(
                                row_data,
                                str(manager.Name or ""),
                                bool(manager.ManagesLocation),
                            )
                        if claims["role"] == "ADMIN":
                            row_data = _prepare_admin_visit(
                                row_data, _current_user_name(claims)
                            )
                    if table == "hd_tickets":
                        row_data["raiser_id"] = claims["sub"]
                        row_data["ticket_no"] = _next_helpdesk_ticket_no(cur)
                        row_data["priority"] = _helpdesk_priority(row_data.get("priority"))
                        _require_roles(claims, {"ADMIN", "BRANCH_MANAGER", "EMPLOYEE"})
                        if not row_data.get("building_id"):
                            raise HTTPException(
                                status_code=400,
                                detail="Scan the QR code for your building to raise a ticket.",
                            )
                        if not row_data.get("building_area_id"):
                            raise HTTPException(status_code=400, detail="Select an area in the building.")
                        building, area, branch_name = _require_helpdesk_building_context(
                            cur,
                            str(row_data["building_id"]),
                            str(row_data.get("building_area_id") or ""),
                            row_data.get("_latitude"),
                            row_data.get("_longitude"),
                        )
                        _require_helpdesk_branch_access(
                            cur, str(building["branch_id"]), claims
                        )
                        row_data["branch_id"] = building["branch_id"]
                        row_data["building_area_id"] = area["id"]
                        row_data["floor_name"] = area["floor"]
                        row_data["area_name"] = area["name"]
                        row_data["location"] = " · ".join(
                            part
                            for part in (
                                branch_name,
                                str(building["name"]),
                                str(area["floor"]),
                                str(area["name"]),
                            )
                            if part
                        )
                    if table == "emergencies":
                        location = str(row_data.get("location") or "").strip()
                        cur.execute(
                            """
                            SELECT TOP (1) [Id]
                            FROM [dbo].[Branches]
                            WHERE [IsActive] = 1 AND ([Name] = ? OR [Address] = ?)
                            ORDER BY CASE WHEN [Name] = ? THEN 0 ELSE 1 END
                            """,
                            location,
                            location,
                            location,
                        )
                        if not cur.fetchone():
                            raise HTTPException(
                                status_code=400,
                                detail="Choose a location mapped to an active branch.",
                            )
                        row_data["incident_no"] = _next_emergency_incident_no(cur)
                    if table == "work_permits":
                        row_data["raised_by"] = claims["sub"]
                    if table in {"hd_ticket_events", "hd_evidence"} and claims["role"] not in {
                        "ADMIN", "SERVICE_PROVIDER"
                    }:
                        record_id = row_data.get("ticket_id") or row_data.get("record_id")
                        cur.execute(
                            """
                            SELECT 1 FROM [dbo].[HelpdeskTickets]
                            WHERE [Id] = ? AND [RaisedByUserId] = ?
                            """,
                            record_id, claims["sub"],
                        )
                        if not cur.fetchone():
                            raise HTTPException(status_code=403, detail="You can only add items to your own tickets.")
                    if table == "visit_events" and claims["role"] == "EMPLOYEE":
                        visit_id = row_data.get("visit_id") or row_data.get("record_id")
                        if row_data.get("event") not in {"CREATED", "CANCELLED", "HOST_NOTIFIED"}:
                            raise HTTPException(status_code=403, detail="Employees cannot record this visit event.")
                        cur.execute(
                            """
                            SELECT 1 FROM [dbo].[Visits]
                            WHERE [Id] = ? AND ([RequestedByUserId] = ? OR [HostUserId] = ?)
                            """,
                            visit_id, claims["sub"], claims["sub"],
                        )
                        if not cur.fetchone():
                            raise HTTPException(status_code=403, detail="You can only add events to visits you requested or host.")
                        row_data["actor_id"] = claims["sub"]
                        row_data["actor_name"] = _current_user_name(claims)
                    if module:
                        row_data["module_name"] = module
                    mapped = {
                        _field(table, key, module): _db_value(table, key, value)
                        for key, value in row_data.items()
                        if key not in UNSTORED_FIELDS.get(table, set())
                        if value is not None or key in row_data
                    }
                    if table == "profiles":
                        mapped.pop("PasswordHash", None)
                    if not mapped:
                        raise HTTPException(status_code=400, detail="No columns supplied.")
                    columns = list(mapped)
                    placeholders = ", ".join("?" for _ in columns)
                    sql = (
                        f"INSERT INTO {physical} ({', '.join(f'[{col}]' for col in columns)}) "
                        f"OUTPUT INSERTED.* VALUES ({placeholders})"
                    )
                    cur.execute(sql, list(mapped.values()))
                    inserted = rows_as_dicts(cur)[0]
                    if table == "hd_tickets":
                        ticket = _normalize(table, inserted, module)
                        provider_notification_status = "SENT"
                        provider_in_app_notification_status = "SENT"
                        try:
                            cur.execute(
                                """
                                SELECT [Id], [Name], [Email], [Role]
                                FROM [dbo].[AppUsers]
                                WHERE [IsActive] = 1
                                  AND [Role] IN ('SERVICE_PROVIDER', 'ADMIN')
                                  AND [Id] <> ?
                                ORDER BY [Id]
                                """,
                                ticket["raiser_id"],
                            )
                            notification_recipients = rows_as_dicts(cur)
                        except Exception:
                            logger.exception(
                                "Unable to find Helpdesk notification recipients for ticket %s",
                                ticket.get("ticket_no") or ticket.get("id"),
                            )
                            notification_recipients = []
                            provider_notification_status = "FAILED"
                            provider_in_app_notification_status = "FAILED"
                        providers = [
                            recipient
                            for recipient in notification_recipients
                            if recipient.get("Role") == "SERVICE_PROVIDER"
                        ]
                        if not providers:
                            logger.warning(
                                "Helpdesk ticket %s was created without an active service provider account",
                                ticket.get("ticket_no") or ticket.get("id"),
                            )
                            if provider_notification_status != "FAILED":
                                provider_notification_status = "NO_RECIPIENT"
                        if not notification_recipients:
                            provider_in_app_notification_status = "NO_RECIPIENT"
                        else:
                            try:
                                notifications = _read_virtual(cur, "hd_notifications")
                                created_at = datetime.now(timezone.utc).isoformat()
                                notification_rows = [
                                    {
                                        "id": str(uuid.uuid4()),
                                        "recipient_id": str(recipient["Id"]),
                                        "ticket_id": str(ticket["id"]),
                                        "title": "New Helpdesk ticket",
                                        "message": (
                                            f"Ticket {ticket.get('ticket_no')} has been raised "
                                            f"by {ticket.get('raiser_name') or 'a user'}."
                                        ),
                                        "type": "NEW",
                                        "is_read": False,
                                        "created_at": created_at,
                                    }
                                    for recipient in notification_recipients
                                ]
                                _write_virtual(
                                    cur,
                                    "hd_notifications",
                                    (notification_rows + notifications)[:10000],
                                )
                            except Exception:
                                provider_in_app_notification_status = "FAILED"
                                logger.exception(
                                    "Helpdesk in-app notification delivery failed for ticket %s",
                                    ticket.get("ticket_no") or ticket.get("id"),
                                )

                        email_providers = [
                            provider
                            for provider in providers
                            if str(provider.get("Email") or "").strip()
                        ]
                        if providers and not email_providers:
                            provider_notification_status = "NO_RECIPIENT"
                            logger.warning(
                                "Helpdesk ticket %s has active service provider accounts but no email addresses",
                                ticket.get("ticket_no") or ticket.get("id"),
                            )
                        delivery_failures = 0
                        for provider in email_providers:
                            try:
                                _send_helpdesk_ticket_email(provider, ticket)
                            except Exception:
                                delivery_failures += 1
                                logger.exception(
                                    "Helpdesk ticket email delivery failed for ticket %s and provider %s",
                                    ticket.get("ticket_no") or ticket.get("id"),
                                    provider.get("Id"),
                                )
                        if delivery_failures:
                            provider_notification_status = (
                                "PARTIAL"
                                if delivery_failures < len(email_providers)
                                else "FAILED"
                            )
                    manager_notification_status = "NOT_APPLICABLE"
                    if table == "visit_requests" and inserted.get("Status") == "APPROVED":
                        qr_token = _visitor_qr_token(str(inserted["Id"]))
                        cur.execute(
                            "UPDATE [dbo].[Visits] SET [QrTokenHash] = ? WHERE [Id] = ?",
                            hashlib.sha256(qr_token.encode()).hexdigest(),
                            inserted["Id"],
                        )
                        inserted["QrTokenHash"] = hashlib.sha256(qr_token.encode()).hexdigest()
                        try:
                            _send_visitor_invitation(
                                _normalize(table, inserted, module),
                                qr_token,
                            )
                        except Exception as exc:
                            logger.exception("Automatically approved visit email delivery failed")
                            raise HTTPException(
                                status_code=502,
                                detail="The visit could not be saved because its approval email could not be sent.",
                            ) from exc
                        cur.execute(
                            "UPDATE [dbo].[Visits] SET [InvitationSentAt] = SYSUTCDATETIME() WHERE [Id] = ?",
                            inserted["Id"],
                        )
                        inserted["InvitationSentAt"] = datetime.now(timezone.utc)
                        approved_visit = _normalize(table, inserted, module)
                        manager_notification_status = (
                            _notify_branch_managers_of_approved_visit(cur, approved_visit)
                        )
                    if table == "visit_requests":
                        visit_notification = _normalize(table, inserted, module)
                        if str(inserted.get("Status") or "").upper() == "PENDING":
                            location = str(visit_notification.get("location") or "").strip()
                            cur.execute(
                                """
                                SELECT manager.[Id], manager.[Email], manager.[Name]
                                FROM [dbo].[AppUsers] AS manager
                                JOIN [dbo].[Branches] AS branch
                                  ON branch.[Id] = manager.[BranchId]
                                WHERE manager.[Role] = 'BRANCH_MANAGER'
                                  AND manager.[IsActive] = 1
                                  AND NULLIF(LTRIM(RTRIM(manager.[Email])), '') IS NOT NULL
                                  AND (branch.[Name] = ? OR branch.[Address] = ?)
                                ORDER BY manager.[Id]
                                """,
                                location,
                                location,
                            )
                            managers = rows_as_dicts(cur)
                            if not managers:
                                raise HTTPException(
                                    status_code=409,
                                    detail=(
                                        "No active Branch Manager with an email address is assigned "
                                        "to this visitor request's location."
                                    ),
                                )
                            for manager in managers:
                                try:
                                    _send_branch_manager_visit_request_email(
                                        manager, visit_notification
                                    )
                                except Exception as exc:
                                    logger.exception(
                                        "Branch Manager approval email delivery failed for visit %s and manager %s",
                                        inserted["Id"],
                                        manager["Id"],
                                    )
                                    raise HTTPException(
                                        status_code=502,
                                        detail=(
                                            "The visitor request could not be saved because the "
                                            "Branch Manager approval email could not be sent."
                                        ),
                                    ) from exc
                        _append_vms_notification(
                            cur,
                            visit_notification,
                            kind="REQUEST_CREATED",
                            title=(
                                "New visitor request awaiting approval"
                                if str(inserted.get("Status") or "").upper() == "PENDING"
                                else "Visitor request created"
                            ),
                            body=(
                                f"{visit_notification.get('requested_by_name') or 'A user'} raised a request "
                                f"for {visit_notification.get('visitor_name') or 'a visitor'}."
                            ),
                            audience=["ADMIN", "BRANCH_MANAGER"],
                        )
                        if str(inserted.get("Status") or "").upper() == "APPROVED":
                            _append_vms_notification(
                                cur,
                                visit_notification,
                                kind="REQUEST_APPROVED",
                                title="Visitor request approved",
                                body=(
                                    f"{visit_notification.get('visitor_name') or 'Visitor'} was approved "
                                    "and the invitation email was sent."
                                ),
                            )
                    normalized = _normalize(table, inserted, module)
                    if table == "visit_requests" and manager_notification_status != "NOT_APPLICABLE":
                        normalized["branch_manager_notification_status"] = (
                            manager_notification_status
                        )
                    if table == "hd_tickets":
                        normalized["provider_notification_status"] = provider_notification_status
                        normalized["provider_in_app_notification_status"] = (
                            provider_in_app_notification_status
                        )
                    affected.append(normalized)
                return {"data": affected, "error": None, "count": len(affected) if body.count else None}

            where, params = _where_clause(table, body.filters, module)
            if not where:
                raise HTTPException(status_code=400, detail="Update and delete require at least one filter.")
            if module:
                where += " AND [ModuleName] = ?"
                params.append(module)
            scope, scope_params = _scope_clause(table, claims)
            if scope:
                where += f" AND ({scope})"
                params.extend(scope_params)
            if body.action == "update":
                changes = body.data if isinstance(body.data, dict) else {}
                closure_candidates: list[dict[str, Any]] = []
                if table == "hd_tickets" and str(changes.get("status") or "").upper() == "CLOSED":
                    cur.execute(
                        f"""
                        SELECT [Id], [TicketNo], [RaisedByUserId], [RaisedByName], [RaisedByEmail],
                               [Category], [Location], [BuildingId], [Status]
                        FROM {physical} WITH (UPDLOCK, ROWLOCK){where}
                        """,
                        params,
                    )
                    closure_candidates = rows_as_dicts(cur)
                if (
                    table == "visit_requests"
                    and "visitor_type" in changes
                    and changes["visitor_type"] not in VISITOR_TYPE_CODES
                ):
                    raise HTTPException(
                        status_code=400,
                        detail="Visitor type must be Internal Visitor or External Visitor.",
                    )
                if module:
                    changes["module_name"] = module
                mapped = {
                    _field(table, key, module): _db_value(table, key, value)
                    for key, value in changes.items()
                    if key not in UNSTORED_FIELDS.get(table, set())
                    if value is not None or key in changes
                }
                if not mapped:
                    return {"data": [], "error": None, "count": 0 if body.count else None}
                assignments = ", ".join(f"[{col}] = ?" for col in mapped)
                sql = f"UPDATE {physical} SET {assignments} OUTPUT INSERTED.*{where}"
                cur.execute(sql, list(mapped.values()) + params)
                affected = [_normalize(table, row, module) for row in rows_as_dicts(cur)]
                if table == "hd_tickets" and closure_candidates:
                    candidate_ids = {
                        str(row.get("Id") or ""): row
                        for row in closure_candidates
                        if str(row.get("Status") or "").upper() != "CLOSED"
                    }
                    closed_tickets = [
                        ticket
                        for ticket in affected
                        if str(ticket.get("id") or "") in candidate_ids
                        and str(ticket.get("status") or "").upper() == "CLOSED"
                    ]
                    if closed_tickets:
                        try:
                            cur.execute(
                                """
                                SELECT [Name], [Email]
                                FROM [dbo].[AppUsers]
                                WHERE [IsActive] = 1 AND [Role] = 'ADMIN'
                                  AND [Email] IS NOT NULL AND LTRIM(RTRIM([Email])) <> ''
                                ORDER BY [Id]
                                """
                            )
                            admin_recipients = rows_as_dicts(cur)
                        except Exception:
                            admin_recipients = []
                            logger.exception(
                                "Unable to load admin email recipients for closed Helpdesk tickets"
                            )
                        for ticket in closed_tickets:
                            previous = candidate_ids[str(ticket["id"])]
                            recipients = list(admin_recipients)
                            raiser_email = str(previous.get("RaisedByEmail") or "").strip()
                            if raiser_email:
                                recipients.append(
                                    {
                                        "Name": previous.get("RaisedByName"),
                                        "Email": raiser_email,
                                        "PublicRequester": not bool(
                                            str(previous.get("RaisedByUserId") or "").strip()
                                        ),
                                        "TicketRaiser": True,
                                    }
                                )
                            if background_tasks is None:
                                logger.error(
                                    "Helpdesk closure emails could not be scheduled for ticket %s",
                                    ticket.get("ticket_no") or ticket.get("id"),
                                )
                            else:
                                background_tasks.add_task(
                                    _send_helpdesk_closed_ticket_emails,
                                    recipients,
                                    ticket,
                                )
                return {"data": affected, "error": None, "count": len(affected) if body.count else None}
            cur.execute(f"DELETE FROM {physical} OUTPUT DELETED.*{where}", params)
            affected = [_normalize(table, row, module) for row in rows_as_dicts(cur)]
            return {"data": affected, "error": None, "count": len(affected) if body.count else None}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Database operation failed for logical table %s", table)
        return {"data": None, "error": {"message": str(exc)}, "count": None}


def _where_clause(
    logical: str, filters: list[dict[str, Any]], module: str | None
) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    for item in filters:
        name = str(item.get("column", ""))
        operator = item.get("op", "eq")
        field = _field(logical, name, module)
        value = item.get("value")
        if operator == "eq":
            clauses.append(f"[{field}] = ?")
            params.append(_db_value(logical, name, value))
        elif operator == "ilike":
            clauses.append(f"[{field}] LIKE ?")
            params.append(str(value).replace("%", "[%]").replace("_", "[_]"))
        elif operator == "in":
            values = list(value or [])
            if not values:
                clauses.append("1 = 0")
            else:
                clauses.append(f"[{field}] IN ({', '.join('?' for _ in values)})")
                params.extend(_db_value(logical, name, value) for value in values)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported filter operator: {operator}")
    return (" WHERE " + " AND ".join(clauses) if clauses else ""), params


@app.get("/api/branches")
def list_branches(
    include_inactive: bool = Query(True, alias="includeInactive"),
    claims: dict[str, Any] = Depends(current_user),
) -> list[dict[str, Any]]:
    del claims
    try:
        with cursor() as cur:
            sql = """
                SELECT [Id], [Code], [Name], [Address], [City], [State], [Phone],
                       [Email], [ManagerUserId], [IsActive]
                FROM [dbo].[Branches]
            """
            if not include_inactive:
                sql += " WHERE [IsActive] = 1"
            sql += " ORDER BY [Name]"
            cur.execute(sql)
            return [_branch_payload(row) for row in rows_as_dicts(cur)]
    except Exception as exc:
        logger.exception("Branch listing failed")
        raise HTTPException(status_code=503, detail="Unable to load branches.") from exc


@app.get("/api/branches/{branch_id}/geofence")
def get_branch_geofence(
    branch_id: str, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    _ensure_admin(claims)
    try:
        with cursor() as cur:
            cur.execute(
                """
                SELECT branch.[Id], fence.[Latitude], fence.[Longitude],
                       COALESCE(fence.[RadiusMeters], 100) AS [RadiusMeters]
                FROM [dbo].[Branches] AS branch
                LEFT JOIN [dbo].[VmsBranchGeofences] AS fence
                  ON fence.[BranchId] = branch.[Id]
                WHERE branch.[Id] = ?
                """,
                branch_id,
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Branch not found.")
            return {
                "branchId": str(row[0]),
                "latitude": float(row[1]) if row[1] is not None else None,
                "longitude": float(row[2]) if row[2] is not None else None,
                "radiusM": int(row[3]),
                "configured": row[1] is not None and row[2] is not None,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Branch geofence lookup failed for %s", branch_id)
        raise HTTPException(status_code=503, detail="Unable to load the branch geofence.") from exc


@app.put("/api/branches/{branch_id}/geofence")
def save_branch_geofence(
    branch_id: str,
    body: BranchGeofenceWrite,
    claims: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    _ensure_admin(claims)
    try:
        with cursor() as cur:
            cur.execute(
                "SELECT 1 FROM [dbo].[Branches] WHERE [Id] = ?",
                branch_id,
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Branch not found.")
            cur.execute(
                """
                IF EXISTS (
                    SELECT 1 FROM [dbo].[VmsBranchGeofences] WHERE [BranchId] = ?
                )
                BEGIN
                    UPDATE [dbo].[VmsBranchGeofences]
                    SET [Latitude] = ?, [Longitude] = ?, [RadiusMeters] = ?,
                        [UpdatedAt] = SYSUTCDATETIME()
                    WHERE [BranchId] = ?;
                END
                ELSE
                BEGIN
                    INSERT INTO [dbo].[VmsBranchGeofences]
                        ([BranchId], [Latitude], [Longitude], [RadiusMeters])
                    VALUES (?, ?, ?, ?);
                END;
                """,
                branch_id,
                body.latitude,
                body.longitude,
                body.radius_m,
                branch_id,
                branch_id,
                body.latitude,
                body.longitude,
                body.radius_m,
            )
            return {
                "branchId": branch_id,
                "latitude": body.latitude,
                "longitude": body.longitude,
                "radiusM": body.radius_m,
                "configured": True,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Branch geofence save failed for %s", branch_id)
        raise HTTPException(status_code=503, detail="Unable to save the branch geofence.") from exc


@app.get("/api/branches/{branch_id}/hosts")
def list_branch_hosts(
    branch_id: str, claims: dict[str, Any] = Depends(current_user)
) -> list[dict[str, Any]]:
    del claims
    try:
        with cursor() as cur:
            cur.execute(
                "SELECT 1 FROM [dbo].[Branches] WHERE [Id] = ? AND [IsActive] = 1",
                branch_id,
            )
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Active branch not found.")
            cur.execute(
                """
                SELECT [Id], [Name], [Designation], [Role]
                FROM [dbo].[AppUsers]
                WHERE [BranchId] = ? AND [IsActive] = 1
                ORDER BY [Name]
                """,
                branch_id,
            )
            return [
                {
                    "id": str(row["Id"]),
                    "name": row.get("Name") or "",
                    "designation": row.get("Designation") or "",
                    "role": row.get("Role") or "",
                }
                for row in rows_as_dicts(cur)
            ]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Branch host listing failed")
        raise HTTPException(status_code=503, detail="Unable to load branch hosts.") from exc


@app.post("/api/branches")
def create_branch(
    body: BranchWrite, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    _ensure_admin(claims)
    code = "BR-" + uuid.uuid4().hex[:8].upper()
    try:
        with cursor() as cur:
            cur.execute(
                """
                INSERT INTO [dbo].[Branches]
                    ([Code], [Name], [Address], [Phone], [Email], [IsActive])
                OUTPUT INSERTED.*
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                code, body.name.strip(), body.location, body.phone,
                body.email, body.status.upper() == "ACTIVE",
            )
            return _branch_payload(rows_as_dicts(cur)[0])
    except Exception as exc:
        logger.exception("Branch creation failed")
        raise HTTPException(status_code=409, detail="Unable to create branch; verify the branch fields and database constraints.") from exc


@app.put("/api/branches/{branch_id}")
def update_branch(
    branch_id: str, body: BranchWrite, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    _ensure_admin(claims)
    try:
        with cursor() as cur:
            cur.execute(
                """
                UPDATE [dbo].[Branches]
                SET [Name] = ?, [Address] = ?, [Phone] = ?, [Email] = ?,
                    [IsActive] = ?
                OUTPUT INSERTED.*
                WHERE [Id] = ?
                """,
                body.name.strip(), body.location, body.phone, body.email,
                body.status.upper() == "ACTIVE", branch_id,
            )
            rows = rows_as_dicts(cur)
            if not rows:
                raise HTTPException(status_code=404, detail="Branch not found.")
            return _branch_payload(rows[0])
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Branch update failed")
        raise HTTPException(status_code=409, detail="Unable to update branch; verify the branch fields and database constraints.") from exc


@app.delete("/api/branches/{branch_id}", status_code=204)
def delete_branch(
    branch_id: str, claims: dict[str, Any] = Depends(current_user)
) -> None:
    _ensure_admin(claims)
    try:
        with cursor() as cur:
            cur.execute("DELETE FROM [dbo].[Branches] WHERE [Id] = ?", branch_id)
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Branch not found.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Branch deletion failed")
        raise HTTPException(status_code=409, detail="Unable to delete this branch because it may be referenced by existing records.") from exc


@app.get("/api/users")
def list_users(claims: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    _ensure_admin(claims)
    try:
        with cursor() as cur:
            cur.execute(
                """
                SELECT [Id], [Name], [Email], [Phone], [Role], [BranchId],
                       [EmployeeNo], [IsActive]
                FROM [dbo].[AppUsers] ORDER BY [Name]
                """
            )
            users = []
            for row in rows_as_dicts(cur):
                users.append(_user_payload(row))
            return users
    except Exception as exc:
        logger.exception("User listing failed")
        raise HTTPException(status_code=503, detail="Unable to load users.") from exc


def _user_payload(row: dict[str, Any]) -> dict[str, Any]:
    active = bool(row.get("IsActive", True))
    return {
        "id": str(row["Id"]),
        "name": row.get("Name") or "",
        "email": row.get("Email") or "",
        "phone": row.get("Phone"),
        "role": row.get("Role") or "EMPLOYEE",
        "branchId": str(row["BranchId"]) if row.get("BranchId") else None,
        "employeeId": row.get("EmployeeNo"),
        "status": "ACTIVE" if active else "INACTIVE",
    }


def _branch_payload(row: dict[str, Any]) -> dict[str, Any]:
    active = bool(row.get("IsActive", True))
    return {
        "id": str(row["Id"]),
        "code": row.get("Code") or "",
        "name": row.get("Name") or "",
        "address": row.get("Address") or "",
        "city": row.get("City") or "",
        "state": row.get("State") or "",
        "phone": row.get("Phone") or "",
        "email": row.get("Email") or "",
        "managerId": str(row["ManagerUserId"]) if row.get("ManagerUserId") else None,
        "status": "ACTIVE" if active else "INACTIVE",
    }


def _get_user(user_id: str) -> dict[str, Any] | None:
    with cursor() as cur:
        cur.execute(
            """
            SELECT [Id], [Name], [Email], [Phone], [Role], [BranchId],
                   [EmployeeNo], [IsActive]
            FROM [dbo].[AppUsers] WHERE [Id] = ?
            """,
            user_id,
        )
        row = cur.fetchone()
        if not row:
            return None
        return _user_payload(dict(zip([c[0] for c in cur.description], row)))


@app.post("/api/users")
def create_user(
    body: UserWrite, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    _ensure_admin(claims)
    if not body.password or len(body.password) < 10:
        raise HTTPException(status_code=400, detail="A password of at least 10 characters is required.")
    if body.role not in {"ADMIN", "BRANCH_MANAGER", "EMPLOYEE", "SECURITY", "HSE", "FIRE_WARDEN", "SERVICE_PROVIDER"}:
        raise HTTPException(status_code=400, detail="Invalid user role.")
    try:
        with cursor() as cur:
            cur.execute(
                """
                INSERT INTO [dbo].[AppUsers]
                    ([Name], [Email], [Phone], [Role], [BranchId], [EmployeeNo],
                     [PasswordHash], [IsActive], [CreatedAt], [UpdatedAt])
                OUTPUT INSERTED.[Id], INSERTED.[Name], INSERTED.[Email],
                       INSERTED.[Phone], INSERTED.[Role], INSERTED.[BranchId],
                       INSERTED.[EmployeeNo], INSERTED.[IsActive]
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, SYSUTCDATETIME(), SYSUTCDATETIME())
                """,
                body.name.strip(), body.email.strip().lower(), body.phone,
                body.role, body.branchId, body.employeeId,
                hash_password(body.password), body.status == "ACTIVE",
            )
            row = rows_as_dicts(cur)[0]
            return _user_payload(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("User creation failed")
        raise HTTPException(status_code=409, detail="Unable to create user; check that the email and branch are unique and valid.") from exc


@app.put("/api/users/{user_id}")
def update_user(
    user_id: str, body: UserWrite, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    _ensure_admin(claims)
    if body.role not in {"ADMIN", "BRANCH_MANAGER", "EMPLOYEE", "SECURITY", "HSE", "FIRE_WARDEN", "SERVICE_PROVIDER"}:
        raise HTTPException(status_code=400, detail="Invalid user role.")
    if body.password is not None and len(body.password) < 10:
        raise HTTPException(status_code=400, detail="A password of at least 10 characters is required.")
    try:
        with cursor() as cur:
            assignments = [
                "[Name] = ?", "[Email] = ?", "[Phone] = ?", "[Role] = ?",
                "[BranchId] = ?", "[EmployeeNo] = ?", "[IsActive] = ?",
                "[UpdatedAt] = SYSUTCDATETIME()",
            ]
            params: list[Any] = [
                body.name.strip(), body.email.strip().lower(), body.phone,
                body.role, body.branchId, body.employeeId, body.status == "ACTIVE",
            ]
            if body.password:
                assignments.insert(-1, "[PasswordHash] = ?")
                params.append(hash_password(body.password))
            params.append(user_id)
            cur.execute(
                f"""
                UPDATE [dbo].[AppUsers]
                SET {', '.join(assignments)}
                OUTPUT INSERTED.[Id], INSERTED.[Name], INSERTED.[Email],
                       INSERTED.[Phone], INSERTED.[Role], INSERTED.[BranchId],
                       INSERTED.[EmployeeNo], INSERTED.[IsActive]
                WHERE [Id] = ?
                """,
                params,
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found.")
            return _user_payload(dict(zip([c[0] for c in cur.description], row)))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("User update failed")
        raise HTTPException(status_code=409, detail="Unable to update user; check that the email and branch are valid.") from exc


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(
    user_id: str, claims: dict[str, Any] = Depends(current_user)
) -> None:
    _ensure_admin(claims)
    if user_id == claims.get("sub"):
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    try:
        with cursor() as cur:
            cur.execute("DELETE FROM [dbo].[AppUsers] WHERE [Id] = ?", user_id)
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="User not found.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("User deletion failed")
        raise HTTPException(status_code=409, detail="Unable to delete this user because they may be referenced by existing records.") from exc


@app.get("/api/roles")
def list_roles(
    include_inactive: bool = Query(True, alias="includeInactive"),
    claims: dict[str, Any] = Depends(current_user),
) -> list[dict[str, Any]]:
    _ensure_admin(claims)
    roles = [
        ("ADMIN", "Administrator"),
        ("BRANCH_MANAGER", "Branch Manager"),
        ("EMPLOYEE", "Employee"),
        ("SECURITY", "Security"),
        ("HSE", "Health and Safety"),
        ("FIRE_WARDEN", "Fire Warden"),
        ("SERVICE_PROVIDER", "Service Provider"),
    ]
    with cursor() as cur:
        custom = {str(row.get("id")): row for row in _read_virtual(cur, "user_roles")}
    return [
        {
            "id": key, "key": key,
            "name": custom.get(key, {}).get("name", name),
            "description": custom.get(key, {}).get("description", ""),
            "status": custom.get(key, {}).get("status", "ACTIVE"),
        }
        for key, name in roles
        if include_inactive or custom.get(key, {}).get("status", "ACTIVE") == "ACTIVE"
    ]


@app.put("/api/roles/{role_id}")
def update_role(
    role_id: str, body: RoleWrite, claims: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    _ensure_admin(claims)
    built_in = {
        "ADMIN", "BRANCH_MANAGER", "EMPLOYEE", "SECURITY", "HSE",
        "FIRE_WARDEN", "SERVICE_PROVIDER",
    }
    if role_id not in built_in:
        raise HTTPException(status_code=404, detail="Role not found.")
    with cursor() as cur:
        rows = _read_virtual(cur, "user_roles")
        updated = {
            "id": role_id,
            "key": role_id,
            "name": body.name.strip(),
            "description": body.description,
            "status": body.status.upper(),
        }
        rows = [row for row in rows if row.get("id") != role_id]
        rows.append(updated)
        _write_virtual(cur, "user_roles", rows)
    return updated


from ewp_api import router as ewp_router

app.include_router(ewp_router, prefix="/api")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
