import unittest
from datetime import date, datetime, time, timedelta
from types import SimpleNamespace
from unittest.mock import ANY, MagicMock, patch
from email.message import EmailMessage
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from starlette.background import BackgroundTasks
from pydantic import ValidationError

from database import connection_string
from app import (
    app,
    TABLES,
    QueryRequest,
    HelpdeskFeedbackRequest,
    HelpdeskTicketFeedbackRequest,
    HelpdeskAssignmentRequest,
    PublicHelpdeskOtpRequest,
    PublicHelpdeskOtpVerifyRequest,
    PublicHelpdeskTicketRequest,
    PublicHelpdeskFeedbackRequest,
    RpcRequest,
    VisitorTokenRequest,
    VisitorCheckInOtpRequest,
    VisitorCheckInOtpVerifyRequest,
    _read_virtual,
    _prepare_visit_insert,
    _validate_visit_schedule,
    _prepare_branch_manager_visit,
    _apply_internal_visitor,
    _file_path,
    _field,
    _normalize,
    _next_helpdesk_ticket_no,
    _next_emergency_incident_no,
    _send_visitor_invitation,
    _send_branch_manager_visit_approved_email,
    _notify_branch_managers_of_approved_visit,
    _require_safety_report_mutation_access,
    _send_branch_manager_visit_request_email,
    _send_helpdesk_ticket_email,
    _send_helpdesk_closed_ticket_emails,
    _send_visitor_checkin_otp_email,
    _send_public_helpdesk_otp,
    _emergency_email_response_token,
    _decode_emergency_email_response_token,
    _visitor_email_decision_token,
    _decode_visitor_email_decision_token,
    _email_visitor_manager_claims,
    _prepare_admin_visit,
    preview_visitor_email_decision,
    submit_visitor_email_decision,
    _send_emergency_response_email,
    preview_emergency_email_response,
    submit_emergency_email_response,
    _vms_notification_payload,
    _vms_notification_visible,
    _visitor_checkin_url,
    _visitor_qr_token,
    _visitor_checkin_otp_hash,
    _visitor_checkin_window,
    _require_visitor_checkin_window,
    _public_helpdesk_otp_hash,
    _public_helpdesk_token,
    _verify_public_helpdesk_token,
    _helpdesk_feedback_ticket_options,
    get_public_helpdesk_ticket_history,
    _public_helpdesk_requester,
    _distance_meters,
    _require_helpdesk_building_context,
    _require_helpdesk_branch_access,
    _require_helpdesk_building_deletable,
    _require_visitor_inside_geofence,
    _require_card_issue_access,
    _require_visit_create_access,
    _require_visit_branch_access,
    _helpdesk_priority,
    _field,
    _select_fields,
    UNSTORED_FIELDS,
    assign_and_start_helpdesk_ticket,
    claim_helpdesk_ticket,
    public_visitor_check_out,
    list_branch_hosts,
    list_visits,
    notify_emergency_responders,
    _scope_clause,
    _select_fields,
    _virtual_query,
    database_query,
    approve_visit,
    issue_visitor_guest_pass,
    public_visitor_check_in,
    public_visitor_pass_by_qr_token,
    send_visitor_checkin_otp,
    verify_visitor_checkin_otp,
    list_helpdesk_feedback,
    submit_helpdesk_feedback,
    submit_helpdesk_ticket_feedback,
    submit_public_helpdesk_ticket_feedback,
)
from security import hash_password, verify_password
from ewp_api import (
    CHECKLISTS,
    GateOtpSend,
    GateOtpVerify,
    GateWrite,
    LifecycleWrite,
    NotificationReadWrite,
    ContractorOtpVerify,
    PermitWrite,
    _authorized,
    _apply_permit_extension,
    _contractor_email_for_approval,
    _contractor_otp_hash,
    _gate_checkin_url,
    _gate_otp_hash,
    _form,
    _ensure_requester_branch,
    _notify_ewp_event,
    _send_ewp_notification_email,
    _permit_storage_fields,
    _send_approval_email,
    _send_contractor_otp_email,
    _worker_count_label,
    _set_verified_contractor_signature,
    _validate_submission,
    confirm_closure,
    save_permit,
    send_contractor_otp,
    send_gate_otp,
    verify_contractor_otp,
    verify_gate_otp,
    verify_gate_otp_by_contractor,
    gate_permit,
    list_ewp_notifications,
    mark_ewp_notifications_read,
)


class ApiContractTests(unittest.TestCase):
    def test_fire_warden_can_record_safety_report_but_cannot_delete_reports(self):
        with patch("app._current_role", return_value="FIRE_WARDEN"):
            _require_safety_report_mutation_access(
                {"sub": "warden-1", "role": "FIRE_WARDEN"},
                "insert",
            )
            _require_safety_report_mutation_access(
                {"sub": "warden-1", "role": "FIRE_WARDEN"},
                "update",
            )
            with self.assertRaises(HTTPException) as context:
                _require_safety_report_mutation_access(
                    {"sub": "warden-1", "role": "FIRE_WARDEN"},
                    "delete",
                )

        self.assertEqual(context.exception.status_code, 403)

    def test_ewp_employee_and_branch_manager_are_limited_to_their_branch(self):
        with patch("ewp_api._branch_id", return_value="branch-bengaluru"):
            for role in ("EMPLOYEE", "BRANCH_MANAGER"):
                with self.subTest(role=role):
                    _ensure_requester_branch(
                        None,
                        role,
                        {"sub": "requester"},
                        {"branchId": "branch-bengaluru"},
                    )
                    with self.assertRaises(HTTPException) as context:
                        _ensure_requester_branch(
                            None,
                            role,
                            {"sub": "requester"},
                            {"branchId": "branch-hosur"},
                        )
                    self.assertEqual(context.exception.status_code, 403)

    def test_ewp_admin_can_raise_permits_for_any_branch(self):
        _ensure_requester_branch(
            None,
            "ADMIN",
            {"sub": "admin"},
            {"branchId": "branch-hosur"},
        )

    def test_ewp_save_rejects_an_employee_permit_for_another_branch(self):
        cursor = MagicMock()
        cursor_context = MagicMock()
        cursor_context.__enter__.return_value = cursor

        with (
            patch("ewp_api.cursor", return_value=cursor_context),
            patch("ewp_api._role", return_value="EMPLOYEE"),
            patch("ewp_api._branch_id", return_value="branch-bengaluru"),
        ):
            with self.assertRaises(HTTPException) as context:
                save_permit(
                    PermitWrite(
                        permit={
                            "permitType": "HOT_WORK",
                            "branchId": "branch-hosur",
                            "workmenCount": 1,
                        }
                    ),
                    claims={"sub": "employee-1"},
                )

        self.assertEqual(context.exception.status_code, 403)
        self.assertFalse(
            any("INSERT INTO [dbo].[WorkPermits]" in call.args[0] for call in cursor.execute.call_args_list)
        )

    def test_hse_cannot_mutate_ewp_vendor_or_location_masters(self):
        for table in ("ewp_vendors", "ewp_locations"):
            with self.subTest(table=table), patch("app._current_role", return_value="HSE"):
                with self.assertRaises(HTTPException) as context:
                    database_query(
                        table,
                        QueryRequest(action="insert", data={"name": "Restricted"}),
                        {"sub": "hse-user", "role": "HSE"},
                    )
            self.assertEqual(context.exception.status_code, 403)

    def test_emergency_assembly_point_is_derived_and_not_inserted_as_a_duplicate_column(self):
        self.assertEqual(_field("emergencies", "assembly_point_id", None), "SiteId")
        self.assertEqual(_field("emergencies", "assembly_point", None), "AssemblyPoint")
        self.assertIn("assembly_point", UNSTORED_FIELDS["emergencies"])
        selected = _select_fields("emergencies", "*", None)
        self.assertIn("[EvacuationIncidents].*", selected)
        self.assertIn("AS [AssemblyPoint]", selected[1])

    def test_emergency_triggered_at_is_preserved_with_created_at_alias(self):
        triggered_at = datetime(2026, 10, 15, 6, 30)

        normalized = _normalize(
            "emergencies",
            {"TriggeredAt": triggered_at},
            None,
        )

        self.assertEqual(normalized["triggered_at"], triggered_at.isoformat())
        self.assertEqual(normalized["created_at"], triggered_at.isoformat())

    def test_emergency_notifications_create_records_and_report_email_delivery(self):
        context = MagicMock()
        cursor = context.__enter__.return_value
        context.__exit__.return_value = False
        cursor.description = [
            ("Id",), ("IncidentNo",), ("Status",), ("EmergencyType",), ("Title",),
            ("Location",), ("Building",), ("Floor",), ("Area",), ("SiteId",),
            ("AssemblyPoint",),
        ]
        cursor.fetchone.side_effect = [
            (
                "incident-1", "EMG-1", "ACTIVE", "FIRE", "Fire", "Bengaluru Office",
                "A", "1", "Lobby", "site-1", "Assembly Point",
            ),
            ("branch-bengaluru",),
        ]
        cursor.fetchall.return_value = []
        responders = [
            {"Id": "user-1", "Name": "One", "Email": "one@example.test"},
            {"Id": "user-2", "Name": "Two", "Email": "two@example.test"},
            {"Id": "user-3", "Name": "Three", "Email": None},
        ]
        with (
            patch("app._require_roles"),
            patch("app.cursor", return_value=context),
            patch("app.rows_as_dicts", return_value=responders),
            patch("app._send_emergency_response_email", side_effect=[None, RuntimeError("smtp")]) as send_email,
        ):
            result = notify_emergency_responders(
                "incident-1", {"sub": "hse-user", "role": "HSE"}
            )

        branch_query, *branch_params = cursor.execute.call_args_list[1].args
        responder_query, *responder_params = cursor.execute.call_args_list[2].args
        self.assertIn("[Name] = ? OR [Address] = ?", branch_query)
        self.assertEqual(branch_params, ["Bengaluru Office", "Bengaluru Office", "Bengaluru Office"])
        self.assertIn(
            "UPPER(responder.[Role]) NOT IN ('ADMIN', 'HSE', 'FIRE_WARDEN')",
            responder_query,
        )
        self.assertIn("FROM [dbo].[AppUsers] AS responder", responder_query)
        self.assertNotIn("AS user", responder_query)
        self.assertIn("responder.[BranchId] = ?", responder_query)
        self.assertIn("branch.[IsActive] = 1", responder_query)
        self.assertEqual(responder_params, ["branch-bengaluru"])
        self.assertEqual(result, {
            "notified": 3,
            "emails_sent": 1,
            "emails_failed": 1,
            "emails_missing": 1,
        })
        self.assertEqual(send_email.call_count, 2)
        insert_queries = [
            call.args[0] for call in cursor.execute.call_args_list
            if "INSERT INTO [dbo].[EvacuationResponses]" in call.args[0]
        ]
        self.assertEqual(len(insert_queries), 3)

    def test_emergency_email_links_offer_confirmed_safe_and_support_responses(self):
        settings = SimpleNamespace(
            jwt_secret="s" * 32,
            api_public_url="https://api.example.test/api",
            public_app_url="https://app.example.test",
            smtp_host="mail.example.test",
            smtp_port=587,
            smtp_from_email="alerts@example.test",
            smtp_use_tls=True,
            smtp_use_ssl=False,
            smtp_username="smtp-user",
            smtp_password="smtp-password",
        )
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        incident = {
            "Id": "incident-1",
            "Title": "Fire",
            "Location": "Bengaluru Office",
            "Building": "Block A",
            "AssemblyPoint": "Ground parking",
        }
        recipient = {"Id": "user-1", "Name": "Responder", "Email": "user@example.test"}
        with (
            patch("app.settings", settings),
            patch("app.smtplib.SMTP", return_value=smtp),
        ):
            _send_emergency_response_email(recipient, incident)

        sent_message = smtp.send_message.call_args.args[0]
        html_body = next(
            part.get_content()
            for part in sent_message.walk()
            if part.get_content_type() == "text/html"
        )
        self.assertIn(">I AM SAFE</a>", html_body)
        self.assertIn("I NEED SUPPORT", html_body)
        self.assertEqual(html_body.count("/api/emergencies/email-response?token="), 2)

    def test_emergency_email_response_token_is_bound_to_user_and_action(self):
        with patch("app.settings", SimpleNamespace(jwt_secret="s" * 32)):
            token = _emergency_email_response_token(
                "incident-1", "user-1", "NEEDS_ASSISTANCE", expires=2_000_000_000
            )
            claims = _decode_emergency_email_response_token(token)
        self.assertEqual(
            claims,
            {
                "incident": "incident-1",
                "user": "user-1",
                "status": "NEEDS_ASSISTANCE",
                "exp": 2_000_000_000,
            },
        )
        with patch("app.settings", SimpleNamespace(jwt_secret="t" * 32)):
            with self.assertRaises(HTTPException) as error:
                _decode_emergency_email_response_token(token)
        self.assertEqual(error.exception.status_code, 403)

    def test_emergency_email_response_page_requires_confirmation_before_submission(self):
        with patch("app.settings", SimpleNamespace(jwt_secret="s" * 32, api_public_url="https://api.test/api")):
            token = _emergency_email_response_token(
                "incident-1", "user-1", "SAFE", expires=2_000_000_000
            )
            page = preview_emergency_email_response(token)
        self.assertIn("Confirm your emergency response", page.body.decode())
        self.assertIn('method="post"', page.body.decode())
        self.assertIn("Confirm response", page.body.decode())
        self.assertEqual(page.headers["cache-control"], "no-store")

    def test_emergency_email_response_updates_only_active_unanswered_response(self):
        context = MagicMock()
        cursor = context.__enter__.return_value
        context.__exit__.return_value = False
        cursor.rowcount = 1
        with (
            patch("app.settings", SimpleNamespace(jwt_secret="s" * 32)),
            patch("app.cursor", return_value=context),
        ):
            token = _emergency_email_response_token(
                "incident-1", "user-1", "SAFE", expires=2_000_000_000
            )
            result = submit_emergency_email_response(token=token)

        query, status, incident_id, user_id = cursor.execute.call_args.args
        self.assertIn("incident.[Status] = 'ACTIVE'", query)
        self.assertIn("response.[SafetyStatus] = 'NOT_RESPONDED'", query)
        self.assertEqual((status, incident_id, user_id), ("SAFE", "incident-1", "user-1"))
        self.assertIn("Response recorded", result.body.decode())

    def test_emergency_notifications_are_restricted_to_admin_and_hse(self):
        with patch("app._require_roles", side_effect=HTTPException(status_code=403)):
            with self.assertRaises(HTTPException) as error:
                notify_emergency_responders(
                    "incident-1", {"sub": "employee-1", "role": "EMPLOYEE"}
                )
        self.assertEqual(error.exception.status_code, 403)

    def test_helpdesk_priority_defaults_to_medium_and_accepts_high_medium_low(self):
        self.assertEqual(_helpdesk_priority(None), "MEDIUM")
        self.assertEqual(_helpdesk_priority("high"), "HIGH")
        self.assertEqual(_helpdesk_priority("Medium"), "MEDIUM")
        self.assertEqual(_helpdesk_priority(" LOW "), "LOW")
        with self.assertRaises(HTTPException) as error:
            _helpdesk_priority("URGENT")
        self.assertEqual(error.exception.status_code, 400)

    def test_helpdesk_floor_rename_updates_area_floor_references(self):
        context = MagicMock()
        cursor = context.__enter__.return_value
        cursor.__exit__.return_value = False
        virtual_rows = {
            "hd_buildings": [{"id": "building-1"}],
            "hd_building_floors": [
                {
                    "id": "floor-1",
                    "building_id": "building-1",
                    "floor_number": "1",
                    "name": "1",
                    "active": True,
                }
            ],
            "hd_building_areas": [
                {
                    "id": "area-1",
                    "building_id": "building-1",
                    "floor": "1",
                    "name": "Pantry",
                    "active": True,
                }
            ],
        }
        writes = {}

        def read_virtual(_, table):
            return [dict(row) for row in virtual_rows[table]]

        with (
            patch("app.cursor", return_value=context),
            patch("app._current_role", return_value="ADMIN"),
            patch("app._read_virtual", side_effect=read_virtual),
            patch("app._write_virtual", side_effect=lambda _, table, rows: writes.update({table: rows})),
        ):
            database_query(
                "hd_building_floors",
                QueryRequest(
                    action="upsert",
                    data={
                        "id": "floor-1",
                        "building_id": "building-1",
                        "floor_number": "1",
                        "floor_name": "Ground",
                        "name": "Ground",
                        "active": True,
                    },
                ),
                {"sub": "admin-1", "role": "ADMIN"},
            )

        self.assertEqual(writes["hd_building_areas"][0]["floor"], "Ground")

    def test_helpdesk_cannot_create_area_on_deactivated_floor(self):
        context = MagicMock()
        context.__exit__.return_value = False
        virtual_rows = {
            "hd_buildings": [{"id": "building-1"}],
            "hd_building_floors": [
                {
                    "id": "floor-1",
                    "building_id": "building-1",
                    "floor_number": "1",
                    "name": "Ground",
                    "active": False,
                }
            ],
            "hd_building_areas": [
                {
                    "id": "area-1",
                    "building_id": "building-1",
                    "floor": "Ground",
                    "name": "Pantry",
                    "active": True,
                }
            ],
        }
        writes = MagicMock()

        with (
            patch("app.cursor", return_value=context),
            patch("app._current_role", return_value="ADMIN"),
            patch(
                "app._read_virtual",
                side_effect=lambda _, table: [dict(row) for row in virtual_rows[table]],
            ),
            patch("app._write_virtual", writes),
        ):
            with self.assertRaises(HTTPException) as error:
                database_query(
                    "hd_building_areas",
                    QueryRequest(
                        action="upsert",
                        data={
                            "id": "area-2",
                            "building_id": "building-1",
                            "floor": "Ground",
                            "name": "Meeting room",
                            "active": True,
                        },
                    ),
                    {"sub": "admin-1", "role": "ADMIN"},
                )

        self.assertEqual(error.exception.status_code, 400)
        writes.assert_not_called()

    def test_helpdesk_can_create_area_using_global_floor(self):
        context = MagicMock()
        context.__exit__.return_value = False
        virtual_rows = {
            "hd_buildings": [{"id": "building-2"}],
            "hd_building_floors": [
                {
                    "id": "floor-global",
                    "building_id": None,
                    "floor_number": "1",
                    "name": "First Floor",
                    "active": True,
                }
            ],
            "hd_building_areas": [],
        }
        writes = {}

        with (
            patch("app.cursor", return_value=context),
            patch("app._current_role", return_value="ADMIN"),
            patch(
                "app._read_virtual",
                side_effect=lambda _, table: [dict(row) for row in virtual_rows.get(table, [])],
            ),
            patch(
                "app._write_virtual",
                side_effect=lambda _, table, rows: writes.update({table: rows}),
            ),
        ):
            database_query(
                "hd_building_areas",
                QueryRequest(
                    action="upsert",
                    data={
                        "id": "area-global-floor",
                        "building_id": "building-2",
                        "floor": "First Floor",
                        "name": "Pantry",
                        "active": True,
                    },
                ),
                {"sub": "admin-1", "role": "ADMIN"},
            )

        self.assertEqual(writes["hd_building_areas"][0]["building_id"], "building-2")
        self.assertEqual(writes["hd_building_areas"][0]["floor"], "First Floor")

    def test_helpdesk_can_create_global_floor_without_building_mapping(self):
        context = MagicMock()
        context.__exit__.return_value = False
        writes = {}

        with (
            patch("app.cursor", return_value=context),
            patch("app._current_role", return_value="ADMIN"),
            patch("app._read_virtual", return_value=[]),
            patch(
                "app._write_virtual",
                side_effect=lambda _, table, rows: writes.update({table: rows}),
            ),
        ):
            database_query(
                "hd_building_floors",
                QueryRequest(
                    action="upsert",
                    data={
                        "id": "floor-global",
                        "building_id": None,
                        "floor_number": "1",
                        "floor_name": "Reception",
                        "name": "Reception",
                        "active": True,
                    },
                ),
                {"sub": "admin-1", "role": "ADMIN"},
            )

        self.assertIsNone(writes["hd_building_floors"][0]["building_id"])
        self.assertEqual(writes["hd_building_floors"][0]["floor_number"], "1")

    def test_helpdesk_can_deactivate_floor_when_duplicate_exists(self):
        context = MagicMock()
        context.__exit__.return_value = False
        virtual_rows = {
            "hd_buildings": [],
            "hd_building_floors": [
                {
                    "id": "floor-1",
                    "building_id": None,
                    "floor_number": "Floor-1",
                    "name": "Floor-1",
                    "active": True,
                },
                {
                    "id": "floor-2",
                    "building_id": None,
                    "floor_number": "Floor-1",
                    "name": "Floor-1",
                    "active": True,
                },
            ],
        }
        writes = {}

        with (
            patch("app.cursor", return_value=context),
            patch("app._current_role", return_value="ADMIN"),
            patch(
                "app._read_virtual",
                side_effect=lambda _, table: [
                    dict(row) for row in virtual_rows.get(table, [])
                ],
            ),
            patch(
                "app._write_virtual",
                side_effect=lambda _, table, rows: writes.update({table: rows}),
            ),
        ):
            database_query(
                "hd_building_floors",
                QueryRequest(
                    action="upsert",
                    data={
                        **virtual_rows["hd_building_floors"][0],
                        "active": False,
                    },
                ),
                {"sub": "admin-1", "role": "ADMIN"},
            )

        statuses = {
            floor["id"]: floor["active"]
            for floor in writes["hd_building_floors"]
        }
        self.assertFalse(statuses["floor-1"])
        self.assertTrue(statuses["floor-2"])

    @patch("app._read_virtual")
    def test_helpdesk_building_context_checks_geofence_and_resolves_area(self, read_virtual):
        cursor = MagicMock()
        cursor.fetchone.return_value = ("Bengaluru Office",)
        read_virtual.side_effect = [
            [{
                "id": "building-1",
                "branch_id": "branch-1",
                "name": "Bengaluru Office",
                "latitude": 12.9716,
                "longitude": 77.5946,
                "radius_m": 150,
                "active": True,
            }],
            [{
                "id": "area-1",
                "building_id": "building-1",
                "floor": "Floor 1",
                "name": "Pantry",
                "active": True,
            }],
            [],
        ]

        building, area, branch_name = _require_helpdesk_building_context(
            cursor, "building-1", "area-1", 12.9717, 77.5947
        )

        self.assertEqual(building["name"], "Bengaluru Office")
        self.assertEqual(area["name"], "Pantry")
        self.assertEqual(branch_name, "Bengaluru Office")
        cursor.execute.assert_called_once()

    @patch("app._read_virtual")
    def test_helpdesk_building_context_rejects_area_on_deactivated_floor(self, read_virtual):
        cursor = MagicMock()
        cursor.fetchone.return_value = ("Bengaluru Office",)
        read_virtual.side_effect = [
            [{
                "id": "building-1",
                "branch_id": "branch-1",
                "name": "Bengaluru Office",
                "latitude": 12.9716,
                "longitude": 77.5946,
                "radius_m": 150,
                "active": True,
            }],
            [{
                "id": "area-1",
                "building_id": "building-1",
                "floor": "Floor 1",
                "name": "Pantry",
                "active": True,
            }],
            [{
                "id": "floor-1",
                "building_id": "building-1",
                "name": "Floor 1",
                "active": False,
            }],
        ]

        with self.assertRaises(HTTPException) as error:
            _require_helpdesk_building_context(
                cursor, "building-1", "area-1", 12.9717, 77.5947
            )

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(error.exception.detail, "Choose an area on an active floor.")

    @patch("app._read_virtual")
    def test_helpdesk_building_context_rejects_request_outside_geofence(self, read_virtual):
        cursor = MagicMock()
        read_virtual.return_value = [{
            "id": "building-1",
            "branch_id": "branch-1",
            "name": "Bengaluru Office",
            "latitude": 12.9716,
            "longitude": 77.5946,
            "radius_m": 100,
            "active": True,
        }]

        with self.assertRaises(HTTPException) as error:
            _require_helpdesk_building_context(
                cursor, "building-1", "area-1", 13.0, 77.6
            )

        self.assertEqual(error.exception.status_code, 403)
        cursor.execute.assert_not_called()
        self.assertEqual(read_virtual.call_count, 1)

    @patch("app._current_role", return_value="EMPLOYEE")
    def test_helpdesk_branch_access_rejects_other_branch(self, current_role):
        cursor = MagicMock()
        cursor.fetchone.return_value = ("hosur-branch",)

        with self.assertRaises(HTTPException) as error:
            _require_helpdesk_branch_access(
                cursor, "bengaluru-branch", {"sub": "employee-1"}
            )

        self.assertEqual(error.exception.status_code, 403)
        cursor.execute.assert_called_once()
        current_role.assert_called_once()

    @patch("app._current_role", return_value="EMPLOYEE")
    def test_helpdesk_branch_access_allows_assigned_branch(self, current_role):
        cursor = MagicMock()
        cursor.fetchone.return_value = ("hosur-branch",)

        _require_helpdesk_branch_access(
            cursor, "hosur-branch", {"sub": "employee-1"}
        )

        cursor.execute.assert_called_once()
        current_role.assert_called_once()

    @patch("app._current_role", return_value="ADMIN")
    def test_helpdesk_admin_can_access_any_branch(self, current_role):
        cursor = MagicMock()

        _require_helpdesk_branch_access(
            cursor, "bengaluru-branch", {"sub": "admin-1"}
        )

        cursor.execute.assert_not_called()
        current_role.assert_called_once()

    @patch("app._read_virtual", return_value=[])
    def test_helpdesk_building_delete_rejects_existing_tickets(self, read_virtual):
        cursor = MagicMock()
        cursor.fetchone.return_value = ("ticket-1",)

        with self.assertRaises(HTTPException) as error:
            _require_helpdesk_building_deletable(cursor, "building-1")

        self.assertEqual(error.exception.status_code, 409)
        self.assertIn("existing tickets", error.exception.detail)
        read_virtual.assert_not_called()

    @patch(
        "app._read_virtual",
        return_value=[{"building_id": "building-1", "id": "feedback-1"}],
    )
    def test_helpdesk_building_delete_rejects_feedback_history(self, read_virtual):
        cursor = MagicMock()
        cursor.fetchone.return_value = None

        with self.assertRaises(HTTPException) as error:
            _require_helpdesk_building_deletable(cursor, "building-1")

        self.assertEqual(error.exception.status_code, 409)
        self.assertIn("feedback history", error.exception.detail)
        read_virtual.assert_called_once_with(cursor, "hd_feedback")

    @patch("app._read_virtual", return_value=[])
    def test_helpdesk_building_without_history_can_be_deleted(self, read_virtual):
        cursor = MagicMock()
        cursor.fetchone.return_value = None

        _require_helpdesk_building_deletable(cursor, "building-1")

        cursor.execute.assert_called_once()
        read_virtual.assert_called_once_with(cursor, "hd_feedback")

    def test_helpdesk_ticket_insert_requires_building_qr_context(self):
        context = MagicMock()
        context.__enter__.return_value = MagicMock()
        context.__exit__.return_value = False

        with (
            patch("app._current_role", return_value="EMPLOYEE"),
            patch("app.cursor", return_value=context),
            patch("app._next_helpdesk_ticket_no", return_value="HD-2026-0001"),
        ):
            with self.assertRaises(HTTPException) as error:
                database_query(
                    "hd_tickets",
                    QueryRequest(
                        action="insert",
                        data={
                            "category_name": "Maintenance",
                            "description": "Repair the office light fixture.",
                            "location": "Hosur Office",
                            "priority": "MEDIUM",
                        },
                    ),
                    {"sub": "employee-1", "role": "EMPLOYEE"},
                )

        self.assertEqual(error.exception.status_code, 400)
        self.assertIn("Scan the QR code", error.exception.detail)

    @patch("app._current_role", return_value="SECURITY")
    def test_helpdesk_feedback_is_limited_to_employee_admin_and_branch_manager(self, current_role):
        request = HelpdeskFeedbackRequest(
            buildingId="building-1",
            feedback="The pantry is clean.",
            rating=5,
            latitude=12.9716,
            longitude=77.5946,
        )

        with self.assertRaises(HTTPException) as error:
            submit_helpdesk_feedback(request, {"sub": "security-1"})

        self.assertEqual(error.exception.status_code, 403)
        current_role.assert_called_once()

    def test_helpdesk_feedback_requires_a_rating_from_one_to_five(self):
        payload = {
            "buildingId": "building-1",
            "feedback": "The pantry is clean.",
            "latitude": 12.9716,
            "longitude": 77.5946,
        }
        self.assertEqual(HelpdeskFeedbackRequest(**payload, rating=4).rating, 4)
        for rating in (0, 6):
            with self.subTest(rating=rating):
                with self.assertRaises(ValidationError):
                    HelpdeskFeedbackRequest(**payload, rating=rating)

    def test_public_helpdesk_otp_and_guest_token_are_bound_to_building_and_email(self):
        secret = "h" * 32
        with patch("app.settings", SimpleNamespace(jwt_secret=secret)):
            token = _public_helpdesk_token("building-1", "Person@Example.test")
            identity = _verify_public_helpdesk_token(token, "building-1")

            self.assertEqual(identity, {
                "building_id": "building-1",
                "email": "person@example.test",
            })
            self.assertNotEqual(
                _public_helpdesk_otp_hash("building-1", "person@example.test", "123456"),
                _public_helpdesk_otp_hash("building-2", "person@example.test", "123456"),
            )
            with self.assertRaises(HTTPException) as error:
                _verify_public_helpdesk_token(token, "building-2")

        self.assertEqual(error.exception.status_code, 401)

    def test_public_helpdesk_request_contracts_validate_otp_and_feedback(self):
        self.assertEqual(
            PublicHelpdeskOtpRequest(email="person@example.test").email,
            "person@example.test",
        )
        self.assertEqual(
            PublicHelpdeskOtpVerifyRequest(
                email="person@example.test",
                code="123456",
            ).code,
            "123456",
        )
        with self.assertRaises(ValidationError):
            PublicHelpdeskOtpVerifyRequest(email="person@example.test", code="12345")
        with self.assertRaises(ValidationError):
            HelpdeskTicketFeedbackRequest(
                ticketId="ticket-1",
                feedback="A valid comment.",
                rating=6,
            )
        with self.assertRaises(ValidationError):
            PublicHelpdeskTicketRequest(
                token="x" * 32,
                name="Visitor Name",
                areaId="area-1",
                categoryId="category-1",
                description="Too short",
                latitude=0,
                longitude=0,
            )

    def test_public_helpdesk_requester_supports_guests_and_preserves_account_identity(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        guest_id, guest_name = _public_helpdesk_requester(
            cursor, "visitor@example.test", "Visitor Name"
        )
        self.assertIsNone(guest_id)
        self.assertEqual(guest_name, "Visitor Name")

        cursor.fetchone.return_value = ("employee-1", "Employee Name")
        user_id, user_name = _public_helpdesk_requester(
            cursor, "employee@example.test", "Entered Name"
        )
        self.assertEqual(user_id, "employee-1")
        self.assertEqual(user_name, "Employee Name")

    def test_feedback_ticket_options_include_only_closed_tickets_and_submitter_feedback_state(self):
        cursor = MagicMock()
        ticket_rows = [
            {
                "Id": "ticket-1",
                "TicketNo": "HD-001",
                "Category": "Maintenance",
                "Status": "CLOSED",
                "CreatedAt": datetime(2026, 1, 1),
                "Description": "Repair the office light fixture.",
            },
            {
                "Id": "ticket-2",
                "TicketNo": "HD-002",
                "Category": "Cleaning",
                "Status": "NEW",
                "CreatedAt": datetime(2026, 1, 2),
            },
        ]
        feedback_rows = [
            {
                "feedback_type": "TICKET",
                "ticket_id": "ticket-1",
                "submitted_by_email": "person@example.test",
            },
            {
                "feedback_type": "TICKET",
                "ticket_id": "ticket-2",
                "submitted_by_email": "other@example.test",
            },
        ]

        with (
            patch("app._read_virtual", return_value=feedback_rows),
            patch("app.rows_as_dicts", return_value=ticket_rows),
        ):
            options = _helpdesk_feedback_ticket_options(
                cursor, "building-1", "person@example.test"
            )

        self.assertEqual([item["id"] for item in options], ["ticket-1"])
        self.assertEqual(
            [item["feedback_submitted"] for item in options],
            [True],
        )
        self.assertEqual(options[0]["description"], "Repair the office light fixture.")
        self.assertIn("[Status] = 'CLOSED'", cursor.execute.call_args.args[0])

    def test_feedback_ticket_options_apply_owner_filter_without_a_result_limit(self):
        cursor = MagicMock()
        ticket_rows = [
            {
                "Id": f"ticket-{index}",
                "TicketNo": f"HD-{index:04d}",
                "Category": "Maintenance",
                "Status": "CLOSED",
                "Description": f"Ticket issue {index}",
                "CreatedAt": datetime(2026, 1, index),
            }
            for index in range(1, 14)
        ]
        with (
            patch("app._read_virtual", return_value=[]),
            patch("app.rows_as_dicts", return_value=ticket_rows),
        ):
            options = _helpdesk_feedback_ticket_options(
                cursor, "building-1", "person@example.test"
            )

        query = cursor.execute.call_args.args[0]
        self.assertIn("WHERE [BuildingId] = ?", query)
        self.assertNotIn("TOP", query.upper())
        self.assertEqual(len(options), 13)
        self.assertEqual([item["id"] for item in options], [row["Id"] for row in ticket_rows])
        self.assertIn("LOWER(LTRIM(RTRIM([RaisedByEmail]))) = ?", query)
        self.assertIn("[Status] = 'CLOSED'", query)

    def test_public_ticket_options_include_open_tickets_for_my_ticket_tracking(self):
        cursor = MagicMock()
        ticket_rows = [
            {
                "Id": "ticket-open",
                "TicketNo": "HD-OPEN",
                "Category": "Maintenance",
                "Status": "IN_PROGRESS",
                "CreatedAt": datetime(2026, 1, 1),
                "Description": "Repair the office light fixture.",
            }
        ]
        with (
            patch("app._read_virtual", return_value=[]),
            patch("app.rows_as_dicts", return_value=ticket_rows),
        ):
            options = _helpdesk_feedback_ticket_options(
                cursor, "building-1", "person@example.test", only_closed=False
            )

        self.assertEqual([item["id"] for item in options], ["ticket-open"])
        self.assertEqual(options[0]["status"], "IN_PROGRESS")
        query = cursor.execute.call_args.args[0]
        self.assertIn("LOWER(LTRIM(RTRIM([RaisedByEmail]))) = ?", query)
        self.assertNotIn("[Status] = 'CLOSED'", query)

    def test_employee_can_feedback_on_their_own_ticket(self):
        context = MagicMock()
        cursor = context.__enter__.return_value
        context.__exit__.return_value = False
        cursor.fetchone.return_value = ("employee@example.test",)
        ticket = {
            "id": "ticket-1",
            "ticket_no": "HD-001",
            "raiser_id": "employee-1",
            "branch_id": "branch-1",
            "building_id": "building-1",
            "building_area_id": "area-1",
            "location": "Main Office",
            "floor_name": "1",
            "area_name": "Reception",
            "status": "CLOSED",
        }
        body = HelpdeskTicketFeedbackRequest(
            ticketId="ticket-1",
            feedback="The issue was resolved.",
            rating=5,
        )

        with (
            patch("app._current_role", return_value="EMPLOYEE"),
            patch("app.cursor", return_value=context),
            patch("app.rows_as_dicts", return_value=[{"Id": "ticket-1"}]),
            patch("app._normalize", return_value=ticket),
            patch("app._require_helpdesk_branch_access"),
            patch("app._read_virtual", return_value=[]),
            patch("app._write_virtual") as write_virtual,
            patch("app._helpdesk_branch_name", return_value="Bengaluru Office"),
            patch("app._current_user_name", return_value="Feedback Employee"),
        ):
            result = submit_helpdesk_ticket_feedback(
                "ticket-1",
                body,
                {"sub": "employee-1"},
            )

        self.assertEqual(result["submitted_by_email"], "employee@example.test")
        self.assertEqual(result["ticket_id"], "ticket-1")
        self.assertEqual(result["submitted_by_name"], "Feedback Employee")
        self.assertEqual(result["branch_name"], "Bengaluru Office")
        write_virtual.assert_called_once()

    def test_employee_cannot_feedback_on_another_users_ticket(self):
        context = MagicMock()
        cursor = context.__enter__.return_value
        context.__exit__.return_value = False
        cursor.fetchone.return_value = ("employee@example.test",)
        body = HelpdeskTicketFeedbackRequest(
            ticketId="ticket-1",
            feedback="The issue was resolved.",
            rating=5,
        )
        with (
            patch("app._current_role", return_value="EMPLOYEE"),
            patch("app.cursor", return_value=context),
            patch("app.rows_as_dicts", return_value=[{"Id": "ticket-1"}]),
            patch(
                "app._normalize",
                return_value={
                    "id": "ticket-1",
                    "raiser_id": "another-employee",
                    "raiser_email": "another@example.test",
                    "branch_id": "branch-1",
                    "status": "CLOSED",
                },
            ),
            patch("app._write_virtual") as write_virtual,
        ):
            with self.assertRaises(HTTPException) as error:
                submit_helpdesk_ticket_feedback(
                    "ticket-1",
                    body,
                    {"sub": "employee-1"},
                )

        self.assertEqual(error.exception.status_code, 403)
        self.assertIn("ticket raiser", error.exception.detail)
        write_virtual.assert_not_called()

    def test_public_feedback_uses_employee_name_and_ticket_branch(self):
        context = MagicMock()
        cursor = context.__enter__.return_value
        context.__exit__.return_value = False
        cursor.fetchone.return_value = ("Employee Name",)
        body = PublicHelpdeskFeedbackRequest(
            token="t" * 32,
            name="Entered Name",
            ticketId="ticket-1",
            feedback="The issue was resolved.",
            rating=5,
        )
        ticket = {
            "id": "ticket-1",
            "ticket_no": "HD-001",
            "branch_id": "branch-1",
            "building_id": "building-1",
            "location": "Bengaluru Office · Main Building",
            "raiser_email": "employee@example.test",
            "status": "CLOSED",
        }
        feedback_rows = []
        with (
            patch(
                "app._verify_public_helpdesk_token",
                return_value={"email": "employee@example.test"},
            ),
            patch("app.cursor", return_value=context),
            patch("app.rows_as_dicts", return_value=[{"Id": "ticket-1"}]),
            patch("app._normalize", return_value=ticket),
            patch("app._read_virtual", return_value=feedback_rows),
            patch("app._write_virtual") as write_virtual,
            patch("app._helpdesk_branch_name", return_value="Bengaluru Office"),
        ):
            result = submit_public_helpdesk_ticket_feedback("building-1", body)

        self.assertEqual(result["submitted_by_name"], "Employee Name")
        self.assertEqual(result["branch_name"], "Bengaluru Office")
        self.assertEqual(write_virtual.call_args.args[2][0]["submitted_by_name"], "Employee Name")

    def test_public_feedback_rejects_non_raiser(self):
        body = PublicHelpdeskFeedbackRequest(
            token="t" * 32,
            ticketId="ticket-1",
            feedback="The issue was resolved.",
            rating=5,
        )
        context = MagicMock()
        context.__enter__.return_value = MagicMock()
        context.__exit__.return_value = False
        with (
            patch(
                "app._verify_public_helpdesk_token",
                return_value={"email": "other@example.test"},
            ),
            patch("app.cursor", return_value=context),
            patch("app.rows_as_dicts", return_value=[{"Id": "ticket-1"}]),
            patch(
                "app._normalize",
                return_value={
                    "id": "ticket-1",
                    "raiser_email": "raiser@example.test",
                    "status": "CLOSED",
                },
            ),
            patch("app._read_virtual") as read_virtual,
        ):
            with self.assertRaises(HTTPException) as error:
                submit_public_helpdesk_ticket_feedback("building-1", body)

        self.assertEqual(error.exception.status_code, 404)
        read_virtual.assert_not_called()

    def test_public_ticket_history_is_available_only_to_raiser(self):
        context = MagicMock()
        context.__enter__.return_value = MagicMock()
        context.__exit__.return_value = False
        ticket = {
            "id": "ticket-1",
            "ticket_no": "HD-001",
            "raiser_email": "person@example.test",
            "category_name": "Maintenance",
            "status": "CLOSED",
            "created_at": "2026-01-01T10:00:00Z",
            "closed_at": "2026-01-02T10:00:00Z",
        }
        with (
            patch(
                "app._verify_public_helpdesk_token",
                return_value={"email": "person@example.test"},
            ),
            patch("app.cursor", return_value=context),
            patch(
                "app.rows_as_dicts",
                side_effect=[
                    [{"Id": "ticket-1"}],
                    [
                        {
                            "Action": "Ticket closed",
                            "Note": "Completed",
                            "ActorName": "Helpdesk",
                            "CreatedAt": datetime(2026, 1, 2, 10),
                        }
                    ],
                ],
            ),
            patch("app._normalize", return_value=ticket),
        ):
            result = get_public_helpdesk_ticket_history(
                "building-1", "ticket-1", "t" * 32
            )

        self.assertEqual(result["ticket"]["ticket_no"], "HD-001")
        self.assertEqual(result["events"][0]["action"], "Ticket closed")
        self.assertEqual(result["events"][0]["remarks"], "Completed")

    def test_feedback_list_resolves_legacy_email_submitters_and_branch_names(self):
        context = MagicMock()
        context.__enter__.return_value = MagicMock()
        context.__exit__.return_value = False
        feedback_rows = [
            {
                "submitted_by": "employee@example.test",
                "submitted_by_email": "employee@example.test",
                "submitted_by_name": "employee@example.test",
                "branch_id": "branch-1",
                "branch_name": "",
            }
        ]
        with (
            patch("app._ensure_admin"),
            patch("app.cursor", return_value=context),
            patch("app._read_virtual", return_value=feedback_rows),
            patch(
                "app.rows_as_dicts",
                side_effect=[
                    [{"Id": "employee-1", "Name": "Employee Name", "Email": "employee@example.test"}],
                    [{"Id": "branch-1", "Name": "Bengaluru Office"}],
                ],
            ),
        ):
            result = list_helpdesk_feedback({"sub": "admin-1"})

        self.assertEqual(result[0]["submitted_by_name"], "Employee Name")
        self.assertEqual(result[0]["branch_name"], "Bengaluru Office")

    def test_employee_cannot_submit_feedback_for_unclosed_ticket(self):
        context = MagicMock()
        context.__enter__.return_value = MagicMock()
        context.__exit__.return_value = False
        body = HelpdeskTicketFeedbackRequest(
            ticketId="ticket-1",
            feedback="The issue is still pending.",
            rating=2,
        )
        with (
            patch("app._current_role", return_value="EMPLOYEE"),
            patch("app.cursor", return_value=context),
            patch("app.rows_as_dicts", return_value=[{"Id": "ticket-1"}]),
            patch(
                "app._normalize",
                return_value={
                    "id": "ticket-1",
                    "raiser_id": "employee-1",
                    "status": "IN_PROGRESS",
                },
            ),
            patch("app._require_helpdesk_branch_access"),
            patch("app._write_virtual") as write_virtual,
        ):
            with self.assertRaises(HTTPException) as error:
                submit_helpdesk_ticket_feedback(
                    "ticket-1",
                    body,
                    {"sub": "employee-1"},
                )

        self.assertEqual(error.exception.status_code, 409)
        self.assertIn("closed tickets", error.exception.detail)
        write_virtual.assert_not_called()

    def test_public_feedback_submission_rejects_unclosed_ticket(self):
        body = PublicHelpdeskFeedbackRequest(
            token="t" * 32,
            ticketId="ticket-1",
            feedback="The issue is still pending.",
            rating=2,
        )
        context = MagicMock()
        context.__enter__.return_value = MagicMock()
        context.__exit__.return_value = False
        with (
            patch(
                "app._verify_public_helpdesk_token",
                return_value={"email": "person@example.test"},
            ),
            patch("app.cursor", return_value=context),
            patch("app.rows_as_dicts", return_value=[{"Id": "ticket-1"}]),
            patch(
                "app._normalize",
                return_value={
                    "id": "ticket-1",
                    "raiser_email": "person@example.test",
                    "status": "RESOLVED",
                },
            ),
            patch("app._read_virtual") as read_virtual,
        ):
            with self.assertRaises(HTTPException) as error:
                submit_public_helpdesk_ticket_feedback("building-1", body)

        self.assertEqual(error.exception.status_code, 409)
        self.assertIn("closed tickets", error.exception.detail)
        read_virtual.assert_not_called()

    def test_service_provider_cannot_submit_ticket_feedback(self):
        body = HelpdeskTicketFeedbackRequest(
            ticketId="ticket-1",
            feedback="The issue was resolved.",
            rating=5,
        )
        with (
            patch("app._current_role", return_value="SERVICE_PROVIDER"),
            patch("app.cursor") as open_cursor,
        ):
            with self.assertRaises(HTTPException) as error:
                submit_helpdesk_ticket_feedback(
                    "ticket-1",
                    body,
                    {"sub": "provider-1"},
                )

        self.assertEqual(error.exception.status_code, 403)
        open_cursor.assert_not_called()

    def test_branch_manager_can_create_ticket_and_notifies_active_service_provider(self):
        context = MagicMock()
        cursor = context.__enter__.return_value
        context.__exit__.return_value = False
        inserted = {
            "Id": "ticket-1",
            "TicketNo": "HD-2026-0001",
            "RaisedByUserId": "manager-1",
            "RaisedByName": "Branch Manager",
            "RaisedByEmail": "manager@example.test",
            "Category": "Maintenance",
            "Subcategory": "Electrical",
            "ServiceName": "Repair",
            "Description": "Repair the office light fixture.",
            "Location": "North Office",
            "Priority": "HIGH",
            "Status": "NEW",
        }
        providers = [
            {
                "Id": "provider-user-1",
                "Name": "Raju",
                "Email": "raju@example.test",
                "Role": "SERVICE_PROVIDER",
            },
            {
                "Id": "provider-user-2",
                "Name": "Provider Without Email",
                "Email": None,
                "Role": "SERVICE_PROVIDER",
            },
            {
                "Id": "admin-user-1",
                "Name": "Admin",
                "Email": "admin@example.test",
                "Role": "ADMIN",
            },
        ]
        write_notifications = MagicMock()
        with (
            patch("app._current_role", return_value="BRANCH_MANAGER"),
            patch("app._next_helpdesk_ticket_no", return_value="HD-2026-0001"),
            patch("app.cursor", return_value=context),
            patch("app.rows_as_dicts", side_effect=[[inserted], providers]),
            patch("app._read_virtual", return_value=[]),
            patch("app._write_virtual", write_notifications),
            patch("app._send_helpdesk_ticket_email") as send_email,
            patch(
                "app._require_helpdesk_building_context",
                return_value=(
                    {"id": "building-1", "branch_id": "branch-1", "name": "Hosur Office"},
                    {"id": "area-1", "floor": "Floor 1", "name": "Pantry"},
                    "Hosur Office",
                ),
            ),
            patch("app._require_helpdesk_branch_access"),
        ):
            result = database_query(
                "hd_tickets",
                QueryRequest(
                    action="insert",
                    data={
                        "raiser_name": "Branch Manager",
                        "raiser_email": "manager@example.test",
                        "category_name": "Maintenance",
                        "subcategory_name": "Electrical",
                        "service_name": "Repair",
                        "description": "Repair the office light fixture.",
                        "location": "North Office",
                        "building_id": "building-1",
                        "building_area_id": "area-1",
                        "_latitude": 12.9716,
                        "_longitude": 77.5946,
                        "priority": "HIGH",
                        "status": "NEW",
                    },
                ),
                {"sub": "manager-1", "role": "BRANCH_MANAGER"},
            )

        self.assertEqual(result["data"][0]["raiser_id"], "manager-1")
        self.assertEqual(result["data"][0]["provider_notification_status"], "SENT")
        notification_query = next(
            call.args[0]
            for call in cursor.execute.call_args_list
            if "FROM [dbo].[AppUsers]" in call.args[0]
        )
        self.assertIn("[Role]", notification_query.split("FROM", 1)[0])
        self.assertEqual(
            result["data"][0]["provider_in_app_notification_status"], "SENT"
        )
        send_email.assert_called_once()
        self.assertEqual(send_email.call_args.args[0]["Email"], "raju@example.test")
        self.assertEqual(send_email.call_args.args[1]["ticket_no"], "HD-2026-0001")
        write_notifications.assert_called_once()
        self.assertEqual(write_notifications.call_args.args[1], "hd_notifications")
        self.assertEqual(
            [row["recipient_id"] for row in write_notifications.call_args.args[2]],
            ["provider-user-1", "provider-user-2", "admin-user-1"],
        )
        self.assertTrue(
            all(not row["is_read"] for row in write_notifications.call_args.args[2])
        )
        provider_query = [
            call.args[0]
            for call in cursor.execute.call_args_list
            if "SERVICE_PROVIDER" in call.args[0]
        ][0]
        self.assertIn("[Role] IN ('SERVICE_PROVIDER', 'ADMIN')", provider_query)
        self.assertIn("[Id] <> ?", provider_query)
        self.assertEqual(
            next(
                call.args[1]
                for call in cursor.execute.call_args_list
                if "SERVICE_PROVIDER" in call.args[0]
            ),
            "manager-1",
        )

    def test_helpdesk_ticket_email_contains_ticket_details_and_link(self):
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        smtp.__exit__.return_value = False
        smtp_settings = SimpleNamespace(
            smtp_host="smtp.example.test",
            smtp_port=25,
            smtp_username="",
            smtp_password="",
            smtp_from_email="helpdesk@example.test",
            smtp_use_tls=False,
            smtp_use_ssl=False,
            public_app_url="https://app.example.test",
        )
        ticket = {
            "id": "ticket-1",
            "ticket_no": "HD-2026-0001",
            "category_name": "Maintenance",
            "subcategory_name": "Electrical",
            "service_name": "Repair",
            "location": "North Office",
            "priority": "HIGH",
            "raiser_name": "Branch Manager",
            "description": "Repair the office light fixture.",
        }
        with (
            patch("app.settings", smtp_settings),
            patch("app.smtplib.SMTP", return_value=smtp),
        ):
            _send_helpdesk_ticket_email(
                {"Email": "raju@example.test"},
                ticket,
            )

        message = smtp.send_message.call_args.args[0]
        self.assertEqual(message["To"], "raju@example.test")
        self.assertIn("HD-2026-0001", message["Subject"])
        self.assertIn(
            "FCM Console",
            message.get_body(preferencelist=("html",)).get_content(),
        )
        plain = message.get_body(preferencelist=("plain",)).get_content()
        self.assertIn("Repair the office light fixture.", plain)
        self.assertIn("https://app.example.test/hd-ticket/ticket-1", plain)

    def test_helpdesk_closed_email_sends_requester_only_ticket_feedback_link(self):
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        smtp.__exit__.return_value = False
        smtp_settings = SimpleNamespace(
            smtp_host="smtp.example.test",
            smtp_port=25,
            smtp_username="",
            smtp_password="",
            smtp_from_email="helpdesk@example.test",
            smtp_use_tls=False,
            smtp_use_ssl=False,
            public_app_url="https://app.example.test",
        )
        with (
            patch("app.settings", smtp_settings),
            patch("app.smtplib.SMTP", return_value=smtp),
        ):
            _send_helpdesk_closed_ticket_emails(
                [
                    {"Name": "Admin", "Email": "admin@example.test"},
                    {"Name": "Employee", "Email": "employee@example.test"},
                    {
                        "Name": "Guest",
                        "Email": "guest@example.test",
                        "PublicRequester": True,
                        "TicketRaiser": True,
                    },
                    {
                        "Name": "Employee",
                        "Email": "employee@example.test",
                        "TicketRaiser": True,
                    },
                ],
                {
                    "id": "ticket-1",
                    "ticket_no": "HD-2026-0001",
                    "building_id": "building-1",
                    "raiser_email": "guest@example.test",
                },
            )

        messages = {
            call.args[0]["To"]: call.args[0]
            for call in smtp.send_message.call_args_list
        }
        self.assertEqual(
            set(messages),
            {"admin@example.test", "employee@example.test", "guest@example.test"},
        )
        admin_plain = messages["admin@example.test"].get_body(
            preferencelist=("plain",)
        ).get_content()
        self.assertIn("closed", messages["admin@example.test"]["Subject"].lower())
        self.assertIn("https://app.example.test/hd-ticket/ticket-1", admin_plain)
        employee_plain = messages["employee@example.test"].get_body(
            preferencelist=("plain",)
        ).get_content()
        self.assertNotIn("View ticket:", employee_plain)
        self.assertNotIn("https://app.example.test/hd-ticket/ticket-1", employee_plain)
        self.assertIn(
            "https://app.example.test/hd-raise?building=building-1&ticket=ticket-1",
            employee_plain,
        )
        guest_plain = messages["guest@example.test"].get_body(
            preferencelist=("plain",)
        ).get_content()
        self.assertNotIn("View ticket:", guest_plain)
        self.assertNotIn("https://app.example.test/hd-ticket/ticket-1", guest_plain)
        self.assertIn(
            "https://app.example.test/hd-raise?building=building-1&ticket=ticket-1",
            guest_plain,
        )
        self.assertIn("resolved and closed", guest_plain)
        self.assertIn("We'd love to hear your feedback", guest_plain)
        self.assertEqual(guest_plain.count("Share feedback:"), 1)
        guest_html = messages["guest@example.test"].get_body(
            preferencelist=("html",)
        ).get_content()
        self.assertIn(">Share your feedback</a>", guest_html)
        self.assertNotIn(">View ticket</a>", guest_html)

    def test_helpdesk_close_schedules_email_after_transition_only(self):
        context = MagicMock()
        cursor = context.__enter__.return_value
        context.__exit__.return_value = False
        previous = {
            "Id": "ticket-1",
            "TicketNo": "HD-2026-0001",
            "RaisedByName": "Employee",
            "RaisedByEmail": "employee@example.test",
            "RaisedByUserId": "employee-1",
            "Category": "Maintenance",
            "Location": "North Office",
            "BuildingId": "building-1",
            "Status": "RESOLVED",
        }
        updated = {
            **previous,
            "Status": "CLOSED",
        }
        background_tasks = BackgroundTasks()
        with (
            patch("app._current_role", return_value="ADMIN"),
            patch("app.cursor", return_value=context),
            patch(
                "app.rows_as_dicts",
                side_effect=[[previous], [updated], [{"Name": "Admin", "Email": "admin@example.test"}]],
            ),
        ):
            result = database_query(
                "hd_tickets",
                QueryRequest(
                    action="update",
                    data={"status": "CLOSED"},
                    filters=[{"column": "id", "value": "ticket-1"}],
                ),
                {"sub": "admin-1", "role": "ADMIN"},
                background_tasks,
            )

        self.assertEqual(result["data"][0]["status"], "CLOSED")
        self.assertEqual(len(background_tasks.tasks), 1)
        self.assertEqual(background_tasks.tasks[0].func, _send_helpdesk_closed_ticket_emails)
        recipients = background_tasks.tasks[0].args[0]
        self.assertEqual(
            {recipient["Email"] for recipient in recipients},
            {"admin@example.test", "employee@example.test"},
        )
        requester = next(
            recipient
            for recipient in recipients
            if recipient["Email"] == "employee@example.test"
        )
        self.assertTrue(requester["TicketRaiser"])
        self.assertFalse(requester["PublicRequester"])
        self.assertIn("UPDLOCK, ROWLOCK", cursor.execute.call_args_list[0].args[0])
        self.assertIn("RaisedByUserId", cursor.execute.call_args_list[0].args[0])

    def test_admin_cannot_assign_helpdesk_ticket_through_generic_database_api(self):
        for changes in (
            {"provider_id": "provider-1", "status": "ASSIGNED"},
            {"ProviderName": "Service Team"},
            {"status": "ASSIGNED"},
        ):
            with self.subTest(changes=changes), patch(
                "app._current_role", return_value="ADMIN"
            ):
                with self.assertRaises(HTTPException) as error:
                    database_query(
                        "hd_tickets",
                        QueryRequest(
                            action="update",
                            data=changes,
                            filters=[{"column": "id", "value": "ticket-1"}],
                        ),
                        {"sub": "admin-1", "role": "ADMIN"},
                    )
            self.assertEqual(error.exception.status_code, 403)

    def test_helpdesk_resolved_status_does_not_schedule_closure_email(self):
        context = MagicMock()
        cursor = context.__enter__.return_value
        context.__exit__.return_value = False
        background_tasks = BackgroundTasks()
        with (
            patch("app._current_role", return_value="SERVICE_PROVIDER"),
            patch("app.cursor", return_value=context),
            patch(
                "app.rows_as_dicts",
                return_value=[
                    {
                        "Id": "ticket-1",
                        "TicketNo": "HD-2026-0001",
                        "Status": "RESOLVED",
                    }
                ],
            ),
        ):
            database_query(
                "hd_tickets",
                QueryRequest(
                    action="update",
                    data={"status": "RESOLVED"},
                    filters=[{"column": "id", "value": "ticket-1"}],
                ),
                {"sub": "provider-1", "role": "SERVICE_PROVIDER"},
                background_tasks,
            )

        self.assertEqual(background_tasks.tasks, [])

    def test_branch_manager_helpdesk_ticket_and_event_scope_stays_owner_limited(self):
        claims = {"sub": "manager-1", "role": "BRANCH_MANAGER"}
        ticket_scope, ticket_params = _scope_clause("hd_tickets", claims)
        event_scope, event_params = _scope_clause("hd_ticket_events", claims)
        self.assertEqual(ticket_scope, "[RaisedByUserId] = ?")
        self.assertEqual(ticket_params, ["manager-1"])
        self.assertIn("[RecordId] IN (SELECT [Id] FROM [dbo].[HelpdeskTickets]", event_scope)
        self.assertEqual(event_params, ["manager-1"])

    def test_service_provider_can_assign_active_provider_and_start_ticket_atomically(self):
        cursor = MagicMock()
        context = MagicMock()
        context.__enter__.return_value = cursor
        context.__exit__.return_value = False
        ticket_id = "ticket-123"
        provider_id = "provider-456"
        with (
            patch("app._current_role", return_value="SERVICE_PROVIDER"),
            patch("app._current_user_name", return_value="Queue Manager"),
            patch("app.cursor", return_value=context),
            patch("app._read_virtual", return_value=[{
                "id": provider_id,
                "name": "Electrical Works",
                "active": True,
            }]),
            patch("app.rows_as_dicts", return_value=[{
                "Id": ticket_id,
                "Status": "IN_PROGRESS",
                "ProviderName": "Electrical Works",
            }]),
        ):
            result = assign_and_start_helpdesk_ticket(
                ticket_id,
                HelpdeskAssignmentRequest(providerId=provider_id),
                {"sub": "provider-user", "role": "SERVICE_PROVIDER"},
            )

        update_query, *update_params = cursor.execute.call_args_list[0].args
        event_query, *event_params = cursor.execute.call_args_list[1].args
        self.assertEqual(result["status"], "IN_PROGRESS")
        self.assertEqual(result["provider_name"], "Electrical Works")
        self.assertIn("[Status] = 'NEW'", update_query)
        self.assertIn("[ProviderName] IS NULL", update_query)
        self.assertEqual(update_params, ["Electrical Works", ticket_id])
        self.assertIn("'HELPDESK'", event_query)
        self.assertIn("Provider assigned and work started", event_query)
        self.assertEqual(
            event_params,
            [ticket_id, "Assigned to Electrical Works; work started.", "provider-user", "Queue Manager"],
        )

    def test_service_provider_cannot_assign_inactive_or_missing_provider(self):
        context = MagicMock()
        context.__enter__.return_value = MagicMock()
        context.__exit__.return_value = False
        with (
            patch("app._current_role", return_value="SERVICE_PROVIDER"),
            patch("app._current_user_name", return_value="Queue Manager"),
            patch("app.cursor", return_value=context),
            patch("app._read_virtual", return_value=[{
                "id": "provider-456",
                "name": "Electrical Works",
                "active": False,
            }]),
        ):
            with self.assertRaises(HTTPException) as error:
                assign_and_start_helpdesk_ticket(
                    "ticket-123",
                    HelpdeskAssignmentRequest(providerId="provider-456"),
                    {"sub": "provider-user", "role": "SERVICE_PROVIDER"},
                )
        self.assertEqual(error.exception.status_code, 400)

    def test_service_provider_cannot_claim_ticket_already_assigned(self):
        context = MagicMock()
        context.__enter__.return_value = MagicMock()
        context.__exit__.return_value = False
        with (
            patch("app._current_role", return_value="SERVICE_PROVIDER"),
            patch("app._current_user_name", return_value="Queue Manager"),
            patch("app.cursor", return_value=context),
            patch("app._read_virtual", return_value=[{
                "id": "provider-456",
                "name": "Electrical Works",
                "active": True,
            }]),
            patch("app.rows_as_dicts", return_value=[]),
        ):
            with self.assertRaises(HTTPException) as error:
                assign_and_start_helpdesk_ticket(
                    "ticket-123",
                    HelpdeskAssignmentRequest(providerId="provider-456"),
                    {"sub": "provider-user", "role": "SERVICE_PROVIDER"},
                )
        self.assertEqual(error.exception.status_code, 409)

    def test_helpdesk_evidence_created_at_uses_upload_timestamp_column(self):
        self.assertEqual(_field("hd_evidence", "created_at", "HELPDESK"), "UploadedAt")
        self.assertEqual(_field("hd_ticket_events", "created_at", "HELPDESK"), "CreatedAt")
        self.assertIn("UploadedByName", str(_select_fields("hd_evidence", "*", "HELPDESK")))
        self.assertIn("uploaded_by_name", UNSTORED_FIELDS["hd_evidence"])
        self.assertIn(
            "UploadedByUserId",
            str(_select_fields("hd_evidence", "uploaded_by_name", "HELPDESK")),
        )

    def test_helpdesk_claim_is_provider_only_and_conditionally_updates_new_unassigned_ticket(self):
        cursor = MagicMock()
        context = MagicMock()
        context.__enter__.return_value = cursor
        context.__exit__.return_value = False
        ticket_id = "ticket-123"
        with (
            patch("app._current_role", return_value="SERVICE_PROVIDER"),
            patch("app._current_user_name", return_value="Service Provider"),
            patch("app.cursor", return_value=context),
            patch("app.rows_as_dicts", return_value=[{
                "Id": ticket_id,
                "Status": "ASSIGNED",
                "ProviderName": "Service Provider",
            }]),
        ):
            result = claim_helpdesk_ticket(
                ticket_id, {"sub": "provider-user", "role": "SERVICE_PROVIDER"}
            )
        query, *params = cursor.execute.call_args.args
        self.assertEqual(result["id"], ticket_id)
        self.assertEqual(result["provider_name"], "Service Provider")
        self.assertIn("[Status] = 'NEW'", query)
        self.assertIn("[ProviderName] IS NULL", query)
        self.assertEqual(params, ["Service Provider", ticket_id])

    def test_helpdesk_claim_rejects_non_provider(self):
        with patch("app._current_role", return_value="EMPLOYEE"):
            with self.assertRaises(HTTPException) as error:
                claim_helpdesk_ticket("ticket-123", {"sub": "employee", "role": "EMPLOYEE"})
        self.assertEqual(error.exception.status_code, 403)

    def test_helpdesk_claim_reports_ticket_already_claimed(self):
        context = MagicMock()
        context.__enter__.return_value = MagicMock()
        context.__exit__.return_value = False
        with (
            patch("app._current_role", return_value="SERVICE_PROVIDER"),
            patch("app._current_user_name", return_value="Service Provider"),
            patch("app.cursor", return_value=context),
            patch("app.rows_as_dicts", return_value=[]),
        ):
            with self.assertRaises(HTTPException) as error:
                claim_helpdesk_ticket(
                    "ticket-123", {"sub": "provider-user", "role": "SERVICE_PROVIDER"}
                )
        self.assertEqual(error.exception.status_code, 409)

    def test_helpdesk_ticket_number_generation_is_year_scoped_and_locked(self):
        class TicketNumberCursor:
            def __init__(self):
                self.queries = []

            def execute(self, query, *params):
                self.queries.append((query, params))
                return self

            def fetchone(self):
                if len(self.queries) == 1:
                    return (0,)
                return (42,)

        cursor = TicketNumberCursor()
        self.assertEqual(_next_helpdesk_ticket_no(cursor, 2026), "HD-2026-00042")
        self.assertIn("sp_getapplock", cursor.queries[0][0])
        self.assertEqual(cursor.queries[0][1], ("HelpdeskTicketNo:2026",))
        self.assertIn("[HelpdeskTickets]", cursor.queries[1][0])
        self.assertEqual(cursor.queries[1][1], ("HD-2026-%",))

    def test_emergency_incident_number_generation_is_year_scoped_and_locked(self):
        class IncidentNumberCursor:
            def __init__(self):
                self.queries = []

            def execute(self, query, *params):
                self.queries.append((query, params))
                return self

            def fetchone(self):
                if len(self.queries) == 1:
                    return (0,)
                return (7,)

        cursor = IncidentNumberCursor()
        self.assertEqual(_next_emergency_incident_no(cursor, 2026), "EMG-2026-00007")
        self.assertIn("sp_getapplock", cursor.queries[0][0])
        self.assertEqual(cursor.queries[0][1], ("EmergencyIncidentNo:2026",))
        self.assertIn("[EvacuationIncidents]", cursor.queries[1][0])
        self.assertIn("SUBSTRING([IncidentNo], 10, 50)", cursor.queries[1][0])
        self.assertEqual(cursor.queries[1][1], ("EMG-2026-%",))

    def test_emergency_insert_generates_required_incident_number(self):
        context = MagicMock()
        cursor = context.__enter__.return_value
        context.__exit__.return_value = False
        incident = {"Id": "incident-1", "IncidentNo": "EMG-2026-00008"}
        with (
            patch("app._current_role", return_value="ADMIN"),
            patch("app.cursor", return_value=context),
            patch("app._next_emergency_incident_no", return_value="EMG-2026-00008"),
            patch("app.rows_as_dicts", return_value=[incident]),
        ):
            result = database_query(
                "emergencies",
                QueryRequest(action="insert", data={"title": "Fire"}),
                {"sub": "admin-1", "role": "ADMIN"},
            )

        insert_query, insert_params = cursor.execute.call_args.args
        self.assertIn("[IncidentNo]", insert_query)
        self.assertIn("EMG-2026-00008", insert_params)
        self.assertEqual(result["data"][0]["incident_no"], "EMG-2026-00008")

    def test_sql_auth_connection_string_includes_escaped_password(self):
        settings = SimpleNamespace(
            sql_driver="ODBC Driver 18 for SQL Server",
            sql_server="192.0.2.10,1433",
            sql_database="VMS1",
            sql_encrypt=True,
            sql_trust_certificate=True,
            sql_username="vms-login",
            sql_password="test;pass}word",
        )
        with patch("database.settings", settings):
            value = connection_string()

        self.assertIn("SERVER={192.0.2.10,1433}", value)
        self.assertIn("UID={vms-login}", value)
        self.assertIn("PWD={test;pass}}word}", value)

    def test_existing_vms1_tables_are_used(self):
        self.assertEqual(TABLES["profiles"][0], "AppUsers")
        self.assertEqual(TABLES["visit_requests"][0], "Visits")
        self.assertIsNone(TABLES["visit_requests"][1])
        self.assertEqual(TABLES["visit_events"], ("ModuleEvents", "VISIT"))
        self.assertEqual(TABLES["emergencies"][0], "EvacuationIncidents")
        self.assertEqual(TABLES["work_permits"][0], "WorkPermits")
        self.assertEqual(TABLES["hd_tickets"][0], "HelpdeskTickets")

    def test_visit_insert_generates_required_identifiers_and_qr_token(self):
        first = _prepare_visit_insert({"visitor_name": "Visitor"})
        second = _prepare_visit_insert({"visitor_name": "Another visitor"})

        for row in (first, second):
            self.assertRegex(row["request_no"], r"^REQ-\d{4}-[A-F0-9]{12}$")
            self.assertRegex(row["visitor_code"], r"^[A-Z0-9]{6}$")
            self.assertTrue(row["qr_token"])

        self.assertNotEqual(first["request_no"], second["request_no"])
        self.assertNotEqual(first["visitor_code"], second["visitor_code"])

    def test_visit_insert_preserves_supplied_identifiers(self):
        supplied = {
            "request_no": "REQ-CUSTOM",
            "visitor_code": "VIS-CUSTOM",
            "qr_token": "custom-token",
        }

        self.assertEqual(_prepare_visit_insert(supplied), supplied)
        self.assertEqual(_field("visit_requests", "visitor_employee_id", None), "VisitorEmployeeId")
        self.assertEqual(_field("visit_requests", "visitor_branch_id", None), "VisitorBranchId")

    def test_visit_schedule_rejects_past_start_time_on_visit_day(self):
        now = datetime(2026, 10, 16, 12, 51)
        with self.assertRaises(HTTPException) as error:
            _validate_visit_schedule(
                {
                    "visit_date": "2026-10-16",
                    "expected_arrival": "10:00",
                },
                now,
            )
        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(
            error.exception.detail,
            "Invalid time. Please select a proper time schedule.",
        )

    def test_visit_schedule_allows_future_start_times_and_future_dates(self):
        now = datetime(2026, 10, 16, 12, 51)
        _validate_visit_schedule(
            {"visit_date": "2026-10-16", "expected_arrival": "12:52"},
            now,
        )
        _validate_visit_schedule(
            {"visit_date": "2026-10-17", "expected_arrival": "10:00"},
            now,
        )

    def test_internal_visitor_details_are_resolved_from_active_employee_and_other_branch(self):
        class InternalVisitorCursor:
            def __init__(self, destination_id):
                self.destination_id = destination_id
                self.calls = 0
                self.queries = []

            def execute(self, query, *_args):
                self.calls += 1
                self.queries.append(query)

            def fetchone(self):
                if self.calls == 1:
                    return SimpleNamespace(
                        Id="employee-1",
                        Name="Internal Visitor",
                        Email="employee@example.com",
                        Phone="12345678",
                        Department="Operations",
                        Designation="Engineer",
                        BranchId="branch-hosur",
                        BranchName="Hosur Office",
                    )
                return SimpleNamespace(Id=self.destination_id)

        visit = {
            "visitor_type": "EMPLOYEE",
            "visitor_employee_id": "employee-1",
            "visitor_branch_id": "branch-hosur",
            "location": "Bengaluru Office",
            "visitor_name": "Forged Name",
            "email": "forged@example.com",
        }
        visitor_cursor = InternalVisitorCursor("branch-bengaluru")
        _apply_internal_visitor(visitor_cursor, visit)
        self.assertNotIn("employee.[Role] = 'EMPLOYEE'", visitor_cursor.queries[0])
        self.assertEqual(visit["visitor_name"], "Internal Visitor")
        self.assertEqual(visit["email"], "employee@example.com")
        self.assertEqual(visit["company"], "Hosur Office")
        self.assertEqual(visit["visitor_employee_id"], "employee-1")

    def test_external_visitors_do_not_keep_internal_employee_selection(self):
        visit = {
            "visitor_type": "EXTERNAL",
            "visitor_employee_id": "employee-1",
            "visitor_branch_id": "branch-hosur",
        }
        _apply_internal_visitor(None, visit)
        self.assertNotIn("visitor_employee_id", visit)
        self.assertNotIn("visitor_branch_id", visit)

    def test_internal_visitor_cannot_visit_their_own_branch(self):
        class SameBranchCursor:
            def __init__(self):
                self.calls = 0

            def execute(self, *_args):
                self.calls += 1

            def fetchone(self):
                if self.calls == 1:
                    return SimpleNamespace(
                        Id="employee-1",
                        Name="Internal Visitor",
                        Email="employee@example.com",
                        Phone="12345678",
                        Department="Operations",
                        Designation="Engineer",
                        BranchId="branch-hosur",
                        BranchName="Hosur Office",
                    )
                return SimpleNamespace(Id="branch-hosur")

        with self.assertRaises(HTTPException) as context:
            _apply_internal_visitor(
                SameBranchCursor(),
                {
                    "visitor_type": "EMPLOYEE",
                    "visitor_employee_id": "employee-1",
                    "visitor_branch_id": "branch-hosur",
                    "location": "Hosur Office",
                },
            )
        self.assertEqual(context.exception.status_code, 400)

    def test_branch_manager_visit_is_approved_only_for_their_assigned_location(self):
        request = {"visitor_name": "Visitor", "location": "Bengaluru Office", "status": "PENDING"}

        own_branch = _prepare_branch_manager_visit(request, "Anusha", True)
        other_branch = _prepare_branch_manager_visit(request, "Anusha", False)

        self.assertEqual(own_branch["status"], "APPROVED")
        self.assertEqual(own_branch["reviewed_by_name"], "Anusha")
        self.assertIsNotNone(own_branch["reviewed_at"])
        self.assertEqual(other_branch["status"], "PENDING")
        self.assertNotIn("reviewed_by_name", other_branch)
        self.assertNotIn("reviewed_at", other_branch)
        self.assertEqual(request["status"], "PENDING")

    def test_admin_visit_is_approved_and_reviewed_without_mutating_input(self):
        request = {"visitor_name": "Visitor", "status": "PENDING"}

        approved = _prepare_admin_visit(request, "System Admin")

        self.assertEqual(approved["status"], "APPROVED")
        self.assertEqual(approved["reviewed_by_name"], "System Admin")
        self.assertIsNotNone(approved["reviewed_at"])
        self.assertEqual(request["status"], "PENDING")

    def test_admin_created_visit_is_inserted_as_approved_and_sends_visitor_invitation(self):
        context = MagicMock()
        cursor = context.__enter__.return_value
        context.__exit__.return_value = False
        inserted = {"Id": "visit-1", "Status": "APPROVED"}
        with (
            patch("app._current_role", return_value="ADMIN"),
            patch("app.cursor", return_value=context),
            patch("app.rows_as_dicts", return_value=[inserted]),
            patch("app._current_user_name", return_value="System Admin"),
            patch("app._visitor_qr_token", return_value="qr-token"),
            patch("app._send_visitor_invitation") as send_invitation,
            patch("app._notify_branch_managers_of_approved_visit", return_value="SENT") as notify_managers,
            patch("app._normalize", return_value={"id": "visit-1", "name": "Visitor"}),
            patch("app._append_vms_notification"),
        ):
            result = database_query(
                "visit_requests",
                QueryRequest(
                    action="insert",
                    data={
                        "visitor_name": "Visitor",
                        "location": "Hosur Office",
                        "status": "PENDING",
                    },
                ),
                {"sub": "admin-1", "role": "ADMIN"},
            )

        insert_sql, insert_values = cursor.execute.call_args_list[0].args
        self.assertIn("[Status]", insert_sql)
        self.assertIn("APPROVED", insert_values)
        self.assertIn("[ReviewedByName]", insert_sql)
        self.assertIn("System Admin", insert_values)
        send_invitation.assert_called_once()
        notify_managers.assert_called_once()
        self.assertIs(notify_managers.call_args.args[0], cursor)
        self.assertEqual(notify_managers.call_args.args[1]["id"], "visit-1")
        self.assertEqual(result["data"][0]["id"], "visit-1")
        self.assertEqual(result["data"][0]["branch_manager_notification_status"], "SENT")

    def test_pending_visit_emails_only_active_branch_managers_for_its_location(self):
        context = MagicMock()
        cursor = context.__enter__.return_value
        context.__exit__.return_value = False
        inserted = {"Id": "visit-1", "Status": "PENDING"}
        manager = {"Id": "manager-1", "Email": "manager@example.com", "Name": "Manager"}
        with (
            patch("app._current_role", return_value="EMPLOYEE"),
            patch("app.cursor", return_value=context),
            patch("app.rows_as_dicts", side_effect=[[inserted], [manager]]),
            patch("app._normalize", return_value={"id": "visit-1", "location": "Hosur Office"}),
            patch("app._send_branch_manager_visit_request_email") as send_manager_email,
            patch("app._append_vms_notification") as notification,
        ):
            result = database_query(
                "visit_requests",
                QueryRequest(
                    action="insert",
                    data={
                        "visitor_name": "Visitor",
                        "location": "Hosur Office",
                        "status": "PENDING",
                    },
                ),
                {"sub": "employee-1", "role": "EMPLOYEE"},
            )

        manager_query = cursor.execute.call_args_list[1]
        self.assertIn("manager.[Role] = 'BRANCH_MANAGER'", manager_query.args[0])
        self.assertIn("manager.[IsActive] = 1", manager_query.args[0])
        self.assertEqual(manager_query.args[1:], ("Hosur Office", "Hosur Office"))
        send_manager_email.assert_called_once_with(
            manager, {"id": "visit-1", "location": "Hosur Office"}
        )
        self.assertEqual(notification.call_args.kwargs["audience"], ["ADMIN", "BRANCH_MANAGER"])
        self.assertEqual(result["data"][0]["id"], "visit-1")

    def test_visitor_email_decision_token_is_manager_and_action_scoped_and_expires(self):
        settings = SimpleNamespace(jwt_secret="s" * 32)
        with patch("app.settings", settings):
            token = _visitor_email_decision_token("visit-1", "manager-1", "APPROVE")
            decoded = _decode_visitor_email_decision_token(token)
            self.assertEqual(decoded["visit"], "visit-1")
            self.assertEqual(decoded["manager"], "manager-1")
            self.assertEqual(decoded["action"], "APPROVE")
            with self.assertRaises(HTTPException):
                _decode_visitor_email_decision_token(token[:-1] + "x")
            expired = _visitor_email_decision_token(
                "visit-1",
                "manager-1",
                "REJECT",
                expires=int(datetime.now().timestamp()) - 1,
            )
            with self.assertRaises(HTTPException):
                _decode_visitor_email_decision_token(expired)

    def test_branch_manager_email_has_confirmable_approve_and_reject_links(self):
        smtp_settings = SimpleNamespace(
            jwt_secret="s" * 32,
            api_public_url="https://api.example.com/api",
            smtp_host="mail.example.com",
            smtp_port=587,
            smtp_username="smtp-user",
            smtp_password="smtp-password",
            smtp_from_email="visitors@example.com",
            smtp_use_tls=True,
            smtp_use_ssl=False,
        )
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        with (
            patch("app.settings", smtp_settings),
            patch("app.smtplib.SMTP", return_value=smtp),
        ):
            _send_branch_manager_visit_request_email(
                {"Id": "manager-1", "Email": "manager@example.com"},
                {
                    "id": "visit-1",
                    "name": "Example Visitor",
                    "location": "Hosur Office",
                    "visitDate": "2026-10-10",
                },
            )

        sent = smtp.send_message.call_args.args[0]
        self.assertEqual(sent["To"], "manager@example.com")
        message_body = sent.get_body(("plain",)).get_content()
        self.assertIn("Approve:", message_body)
        self.assertIn("Reject:", message_body)
        self.assertIn("confirm", message_body.lower())

    def test_email_decision_manager_must_be_active_branch_manager_for_visit_location(self):
        class ManagerVisitCursor:
            def __init__(self, row):
                self.row = row

            def execute(self, *_args):
                pass

            def fetchone(self):
                return self.row

        with self.assertRaises(HTTPException) as wrong_branch:
            _email_visitor_manager_claims(
                ManagerVisitCursor(("BRANCH_MANAGER", True, "PENDING", "Bengaluru", "Hosur", None, "visit-1")),
                "visit-1",
                "manager-1",
            )
        self.assertEqual(wrong_branch.exception.status_code, 403)

        claims, status = _email_visitor_manager_claims(
            ManagerVisitCursor(("BRANCH_MANAGER", True, "PENDING", "Hosur", "Hosur", None, "visit-1")),
            "visit-1",
            "manager-1",
        )
        self.assertEqual(claims, {"sub": "manager-1", "role": "BRANCH_MANAGER"})
        self.assertEqual(status, "PENDING")

    def test_visitor_email_link_get_only_previews_and_post_uses_existing_decision_workflows(self):
        smtp_settings = SimpleNamespace(
            jwt_secret="s" * 32,
            api_public_url="https://api.example.com/api",
        )
        with (
            patch("app.settings", smtp_settings),
            patch("app.cursor"),
            patch(
                "app._email_visitor_manager_claims",
                return_value=({"sub": "manager-1", "role": "BRANCH_MANAGER"}, "PENDING"),
            ) as validate,
            patch("app.approve_visit", return_value={"status": "APPROVED"}) as approve,
            patch("app.reject_visit", return_value={"status": "REJECTED"}) as reject,
        ):
            approve_token = _visitor_email_decision_token(
                "visit-1", "manager-1", "APPROVE"
            )
            reject_token = _visitor_email_decision_token(
                "visit-2", "manager-1", "REJECT"
            )
            preview = preview_visitor_email_decision(approve_token)
            self.assertIn("Confirm approval", preview.body.decode())
            approve.assert_not_called()
            validate.assert_called_once()

            approved = submit_visitor_email_decision(approve_token, "")
            self.assertIn("approved", approved.body.decode())
            approve.assert_called_once_with(
                "visit-1", {"sub": "manager-1", "role": "BRANCH_MANAGER"}
            )

            with self.assertRaises(HTTPException) as missing_reason:
                submit_visitor_email_decision(reject_token, "")
            self.assertEqual(missing_reason.exception.status_code, 400)
            rejected = submit_visitor_email_decision(reject_token, "Duplicate request")
            self.assertIn("rejected", rejected.body.decode())
            self.assertEqual(reject.call_args.args[0], "visit-2")
            self.assertEqual(reject.call_args.args[1].reason, "Duplicate request")

    def test_resolved_email_decision_link_shows_current_status_without_repeating_decision(self):
        settings = SimpleNamespace(
            jwt_secret="s" * 32,
            api_public_url="https://api.example.com/api",
        )
        with (
            patch("app.settings", settings),
            patch("app.cursor"),
            patch(
                "app._email_visitor_manager_claims",
                return_value=({"sub": "manager-1", "role": "BRANCH_MANAGER"}, "APPROVED"),
            ),
            patch("app.approve_visit") as approve,
        ):
            token = _visitor_email_decision_token(
                "visit-1", "manager-1", "APPROVE"
            )
            preview = preview_visitor_email_decision(token)
            self.assertIn("already handled", preview.body.decode())
            self.assertIn("Approved", preview.body.decode())

            submitted = submit_visitor_email_decision(token, "")
            self.assertIn("already handled", submitted.body.decode())
            approve.assert_not_called()

    def test_default_visitor_types_are_internal_and_external_only(self):
        class EmptySettingsCursor:
            def execute(self, *_args):
                pass

            def fetchone(self):
                return None

        rows = _read_virtual(EmptySettingsCursor(), "visitor_types")
        self.assertEqual(
            [row["code"] for row in rows],
            ["EMPLOYEE", "EXTERNAL"],
        )

    def test_client_used_routes_are_registered(self):
        paths = app.openapi()["paths"]
        self.assertIn("/api/auth/login", paths)
        for route in (
            "/api/work-permits",
            "/api/work-permits/catalog",
            "/api/work-permits/{permit_id}/gate",
            "/api/work-permits/{permit_id}/confirm-closure",
            "/api/work-permits/{permit_id}/resend-approval-email",
            "/api/work-permits/{permit_id}/contractor-otp/send",
            "/api/work-permits/{permit_id}/contractor-otp/verify",
            "/api/work-permit-notifications",
            "/api/work-permit-notifications/read",
        ):
            self.assertIn(route, paths)
        self.assertIn("/api/branches", paths)
        self.assertIn("/api/branches/{branch_id}/hosts", paths)
        self.assertIn("/api/visits", paths)
        self.assertIn("/api/visits/{visit_id}/approve", paths)
        self.assertIn("/api/visits/{visit_id}/pass-link", paths)
        self.assertIn("/api/visits/{visit_id}/issue-guest-pass", paths)
        self.assertIn("/api/visits/{visit_id}/authorize-card-issue", paths)
        self.assertIn("/api/vms/notifications", paths)
        self.assertIn("/api/vms/notifications/read", paths)
        self.assertIn("/api/public/visits/{visit_id}/pass", paths)
        self.assertIn("/api/public/visitor-passes/{token}", paths)
        self.assertIn("/api/public/visits/{visit_id}/check-in", paths)
        self.assertIn("/api/public/visits/{visit_id}/check-in/otp", paths)
        self.assertIn("/api/public/visits/{visit_id}/check-in/verify", paths)
        self.assertIn("/api/public/visits/{visit_id}/check-out", paths)
        self.assertIn("/api/visitor-requests/{visit_id}/issue-card", paths)
        self.assertIn("/api/visitor-requests/{visit_id}/return-card", paths)
        self.assertIn("/api/visitor-requests/{visit_id}/check-out", paths)
        self.assertIn("/api/rpc/{name}", paths)
        self.assertIn("/api/files", paths)

    def test_ewp_event_notifications_are_recipient_scoped_and_email_only_permit_events(self):
        cur = MagicMock()
        requester = {"Id": "requester-1", "Name": "Requester", "Email": "requester@example.test"}
        reviewer = {"Id": "hse-1", "Name": "Reviewer", "Email": "hse@example.test"}
        with (
            patch("ewp_api._form", return_value={"branchId": "branch-1"}),
            patch("ewp_api.rows_as_dicts", side_effect=[[requester], [reviewer]]),
            patch("ewp_api.settings", SimpleNamespace(public_app_url="https://app.example.test")),
            patch("ewp_api._send_ewp_notification_email") as send_email,
        ):
            _notify_ewp_event(
                cur,
                {"Id": "permit-1", "PermitNo": "WHP-0001", "RaisedByUserId": "requester-1"},
                "SUBMITTED",
                "Submitted to HSE for review.",
            )

        insert_calls = [
            call
            for call in cur.execute.call_args_list
            if "INSERT INTO [dbo].[EwpNotifications]" in call.args[0]
        ]
        self.assertEqual(len(insert_calls), 2)
        self.assertEqual({call.args[1] for call in insert_calls}, {"requester-1", "hse-1"})
        self.assertTrue(all("EwpNotifications" in call.args[0] for call in insert_calls))
        self.assertEqual(send_email.call_count, 2)
        self.assertTrue(all("https://app.example.test/ework-permit/permit-1" in call.args[2] for call in send_email.call_args_list))

    def test_ewp_notification_email_is_sent_with_permit_details(self):
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        smtp.__exit__.return_value = False
        smtp_settings = SimpleNamespace(
            smtp_host="smtp.example.test",
            smtp_from_email="noreply@example.test",
            smtp_use_tls=False,
            smtp_use_ssl=False,
            smtp_username="",
            smtp_password="",
            smtp_port=25,
        )
        with (
            patch("ewp_api.settings", smtp_settings),
            patch("ewp_api.smtplib.SMTP", return_value=smtp),
        ):
            _send_ewp_notification_email(
                "requester@example.test",
                "E-Work Permit WHP-0001 — Permit approved by HSE",
                "Permit WHP-0001 has been approved.",
            )

        message = smtp.send_message.call_args.args[0]
        self.assertEqual(message["To"], "requester@example.test")
        self.assertIn("E-Work Permit WHP-0001", message["Subject"])
        self.assertIn(
            "Permit WHP-0001 has been approved.",
            message.get_body(preferencelist=("plain",)).get_content(),
        )
        html_body = message.get_body(preferencelist=("html",)).get_content()
        self.assertIn("FCM Console", html_body)
        self.assertIn("E-Work Permit", html_body)

    def test_ewp_notifications_are_loaded_only_for_the_signed_in_user(self):
        context = MagicMock()
        cur = context.__enter__.return_value
        cur.__exit__.return_value = False
        notification = {
            "Id": "notification-1",
            "PermitId": "permit-1",
            "PermitNo": "WHP-0001",
            "Action": "SUBMITTED",
            "Title": "Permit submitted for HSE review",
            "Message": "E-Work Permit WHP-0001 submitted.",
            "IsRead": False,
            "CreatedAt": datetime(2026, 10, 13, 10, 0),
        }
        claims = {"sub": "employee-1"}
        with (
            patch("ewp_api.cursor", return_value=context),
            patch("ewp_api._role", return_value="EMPLOYEE"),
            patch("ewp_api.rows_as_dicts", return_value=[notification]),
        ):
            result = list_ewp_notifications(claims)

        self.assertEqual(result[0]["permitId"], "permit-1")
        query = cur.execute.call_args.args[0]
        self.assertIn("[dbo].[EwpNotifications]", query)
        self.assertIn("[RecipientUserId]=?", query)
        self.assertEqual(cur.execute.call_args.args[1], "employee-1")
        self.assertNotIn("VmsNotifications", query)

    def test_ewp_mark_read_cannot_update_another_users_notification(self):
        context = MagicMock()
        cur = context.__enter__.return_value
        cur.__exit__.return_value = False
        cur.rowcount = 1
        with (
            patch("ewp_api.cursor", return_value=context),
            patch("ewp_api._role", return_value="EMPLOYEE"),
        ):
            result = mark_ewp_notifications_read(
                NotificationReadWrite(ids=["notification-1"]),
                {"sub": "employee-1"},
            )

        query = cur.execute.call_args.args[0]
        self.assertIn("[RecipientUserId]=?", query)
        self.assertEqual(cur.execute.call_args.args[1:], ("employee-1", "notification-1"))
        self.assertEqual(result, {"updated": 1})

    def test_ewp_catalog_covers_all_required_permit_types(self):
        self.assertEqual(
            set(CHECKLISTS),
            {"HOT_WORK", "HEIGHT", "ELECTRICAL", "CONFINED", "EXCAVATION", "COLD"},
        )
        self.assertEqual(
            CHECKLISTS["HOT_WORK"],
            [
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
        )

    def test_partial_permit_draft_uses_empty_strings_for_optional_text_columns(self):
        fields = _permit_storage_fields(
            {
                "workDate": "2099-01-01",
                "timeFrom": "09:00",
                "timeTo": "17:00",
            }
        )

        self.assertEqual(fields["contractor"], "")
        self.assertEqual(fields["location"], "")
        self.assertEqual(fields["work_description"], "")
        self.assertEqual(fields["supervisor_name"], "")
        self.assertEqual(fields["supervisor_mobile"], "")
        self.assertEqual(fields["work_date"], "2099-01-01")
        self.assertEqual(fields["time_from"], "09:00")
        self.assertEqual(fields["time_to"], "17:00")

    def test_ewp_form_defaults_missing_detail_page_collections(self):
        permit = _form(
            {
                "Id": "permit-1",
                "FormData": "{}",
                "Status": "PENDING_HSE",
                "PermitType": "HOT_WORK",
            }
        )

        self.assertEqual(permit["checklist"], [])
        self.assertEqual(permit["gates"], {})

    def test_contractor_otp_hash_is_keyed_and_email_case_insensitive(self):
        with patch("ewp_api.settings", SimpleNamespace(jwt_secret="test-secret")):
            first = _contractor_otp_hash("permit-1", "user-1", "Vendor@Example.com", "123456")
            same = _contractor_otp_hash("permit-1", "user-1", "vendor@example.com", "123456")
            different_code = _contractor_otp_hash("permit-1", "user-1", "vendor@example.com", "654321")

        self.assertEqual(first, same)
        self.assertNotEqual(first, different_code)

    def test_gate_otp_hash_is_bound_to_permit_and_email(self):
        with patch("ewp_api.settings", SimpleNamespace(jwt_secret="s" * 32)):
            first = _gate_otp_hash("permit-1", "Vendor@Example.com", "012345")
            same = _gate_otp_hash("permit-1", "vendor@example.com", "012345")
            other_permit = _gate_otp_hash("permit-2", "vendor@example.com", "012345")
            other_code = _gate_otp_hash("permit-1", "vendor@example.com", "654321")

        self.assertEqual(first, same)
        self.assertNotEqual(first, other_permit)
        self.assertNotEqual(first, other_code)

    def test_gate_checkin_url_uses_public_app_url_and_fragment_token(self):
        with patch(
            "ewp_api.settings",
            SimpleNamespace(public_app_url="https://app.example.test"),
        ):
            url = _gate_checkin_url("permit id", "qr-secret")

        self.assertEqual(
            url,
            "https://app.example.test/ework-permit-checkin?permitId=permit%20id#qrToken=qr-secret",
        )

    def test_contractor_otp_is_sent_to_the_permit_email(self):
        smtp_settings = SimpleNamespace(
            smtp_host="mail.example.com",
            smtp_port=587,
            smtp_username="smtp-user",
            smtp_password="smtp-password",
            smtp_from_email="permits@example.com",
            smtp_use_tls=True,
            smtp_use_ssl=False,
        )
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        with (
            patch("ewp_api.settings", smtp_settings),
            patch("ewp_api.smtplib.SMTP", return_value=smtp),
        ):
            _send_contractor_otp_email(
                "vendor@example.com", "012345", {"id": "permit-1"}
            )

        message = smtp.send_message.call_args.args[0]
        self.assertEqual(message["To"], "vendor@example.com")
        self.assertIn("012345", message.get_body(preferencelist=("plain",)).get_content())
        self.assertIn(
            "012345",
            message.get_body(preferencelist=("html",)).get_content(),
        )
        smtp.starttls.assert_called_once()

    def test_gate_otp_email_identifies_gate_checkin_purpose(self):
        smtp_settings = SimpleNamespace(
            smtp_host="mail.example.com",
            smtp_port=587,
            smtp_username="smtp-user",
            smtp_password="smtp-password",
            smtp_from_email="permits@example.com",
            smtp_use_tls=True,
            smtp_use_ssl=False,
        )
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        with (
            patch("ewp_api.settings", smtp_settings),
            patch("ewp_api.smtplib.SMTP", return_value=smtp),
        ):
            _send_contractor_otp_email(
                "vendor@example.com",
                "012345",
                {"permitNo": "CWP-0001"},
                purpose="gate check-in",
            )

        message = smtp.send_message.call_args.args[0]
        self.assertEqual(message["To"], "vendor@example.com")
        self.assertIn("gate check-in", message["Subject"])
        self.assertIn("012345", message.get_body(preferencelist=("plain",)).get_content())

    def test_gate_otp_email_includes_contractor_verification_link(self):
        smtp_settings = SimpleNamespace(
            smtp_host="mail.example.com",
            smtp_port=587,
            smtp_username="smtp-user",
            smtp_password="smtp-password",
            smtp_from_email="permits@example.com",
            smtp_use_tls=True,
            smtp_use_ssl=False,
        )
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        link = "https://app.example.test/ework-permit-checkin?permitId=permit-1#qrToken=qr-secret"
        with (
            patch("ewp_api.settings", smtp_settings),
            patch("ewp_api.smtplib.SMTP", return_value=smtp),
        ):
            _send_contractor_otp_email(
                "vendor@example.com",
                "012345",
                {"permitNo": "CWP-0001"},
                purpose="gate check-in",
                verification_url=link,
            )

        message = smtp.send_message.call_args.args[0]
        self.assertIn(link, message.get_body(preferencelist=("plain",)).get_content())
        html_body = message.get_body(preferencelist=("html",)).get_content()
        self.assertIn("012345", html_body)
        self.assertIn(link, html_body)

    def test_gate_otp_send_requires_approved_qr_and_sends_to_permit_contractor(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        cursor_context = MagicMock()
        cursor_context.__enter__.return_value = cursor
        row = {
            "Id": "permit-1",
            "PermitNo": "CWP-0001",
            "Status": "APPROVED",
            "FormData": '{"contractorEmail":"vendor@example.com"}',
        }

        with (
            patch("ewp_api.cursor", return_value=cursor_context),
            patch("ewp_api._role", return_value="SECURITY"),
            patch("ewp_api._get", return_value=row),
            patch("ewp_api._authorized"),
            patch("ewp_api._validate_gate_qr"),
            patch("ewp_api._gate_otp_hash", return_value="otp-hash"),
            patch(
                "ewp_api._gate_checkin_url",
                return_value="http://localhost:8080/ework-permit-checkin?permitId=permit-1#qrToken=qr-token",
            ),
            patch("ewp_api._send_contractor_otp_email") as send_email,
            patch("ewp_api._event"),
        ):
            result = send_gate_otp(
                "permit-1",
                GateOtpSend(qrToken="qr-token"),
                claims={"sub": "security-1"},
            )

        self.assertTrue(result["sent"])
        self.assertEqual(result["destination"], "v***@example.com")
        send_email.assert_called_once()
        self.assertEqual(send_email.call_args.args[0], "vendor@example.com")
        self.assertRegex(send_email.call_args.args[1], r"^\d{6}$")
        self.assertEqual(send_email.call_args.args[2]["permitNo"], "CWP-0001")
        self.assertEqual(send_email.call_args.kwargs["purpose"], "gate check-in")
        self.assertEqual(
            send_email.call_args.kwargs["verification_url"],
            "http://localhost:8080/ework-permit-checkin?permitId=permit-1#qrToken=qr-token",
        )
        self.assertTrue(
            any("[dbo].[EwpGateOtpChallenges]" in call.args[0] for call in cursor.execute.call_args_list)
        )

    def test_contractor_can_verify_gate_otp_from_public_email_link(self):
        verified_at = datetime(2026, 10, 13, 10, 0)
        cursor = MagicMock()
        cursor.rowcount = 1
        cursor.fetchone.side_effect = [
            (
                "vendor@example.com",
                "otp-hash",
                0,
                None,
                None,
                0,
            ),
            (verified_at,),
        ]
        cursor_context = MagicMock()
        cursor_context.__enter__.return_value = cursor
        row = {
            "Id": "permit-1",
            "Status": "APPROVED",
            "FormData": '{"contractorEmail":"vendor@example.com"}',
        }

        with (
            patch("ewp_api.cursor", return_value=cursor_context),
            patch("ewp_api._get", return_value=row),
            patch("ewp_api._validate_gate_qr"),
            patch("ewp_api._gate_otp_hash", return_value="otp-hash"),
        ):
            result = verify_gate_otp_by_contractor(
                "permit-1",
                GateOtpVerify(qrToken="qr-token", code="012345"),
            )

        self.assertTrue(result["verified"])
        self.assertEqual(result["verifiedAt"], verified_at.isoformat())
        executed_sql = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertTrue(any("SET [VerifiedAt]" in sql for sql in executed_sql))
        self.assertTrue(any("GATE_OTP_VERIFIED" in sql for sql in executed_sql))

    def test_gate_otp_verification_marks_code_verified(self):
        verified_at = datetime(2026, 10, 13, 10, 0)
        cursor = MagicMock()
        cursor.fetchone.side_effect = [
            (
                "vendor@example.com",
                "otp-hash",
                datetime(2026, 10, 13, 10, 10),
                0,
                None,
                None,
                0,
            ),
            (verified_at,),
        ]
        cursor_context = MagicMock()
        cursor_context.__enter__.return_value = cursor
        row = {
            "Id": "permit-1",
            "Status": "APPROVED",
            "FormData": '{"contractorEmail":"vendor@example.com"}',
        }

        with (
            patch("ewp_api.cursor", return_value=cursor_context),
            patch("ewp_api._role", return_value="SECURITY"),
            patch("ewp_api._get", return_value=row),
            patch("ewp_api._authorized"),
            patch("ewp_api._validate_gate_qr"),
            patch("ewp_api._gate_otp_hash", return_value="otp-hash"),
            patch("ewp_api._event"),
        ):
            result = verify_gate_otp(
                "permit-1",
                GateOtpVerify(qrToken="qr-token", code="012345"),
                claims={"sub": "security-1"},
            )

        self.assertTrue(result["verified"])
        self.assertEqual(result["verifiedAt"], verified_at.isoformat())
        self.assertTrue(
            any("SET [VerifiedAt]" in call.args[0] for call in cursor.execute.call_args_list)
        )

    def test_gate_grant_requires_a_verified_unused_otp(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        cursor_context = MagicMock()
        cursor_context.__enter__.return_value = cursor
        row = {
            "Id": "permit-1",
            "Status": "APPROVED",
            "FormData": (
                '{"contractorEmail":"vendor@example.com","workDate":"'
                + date.today().isoformat()
                + '","timeFrom":"00:00","timeTo":"23:59"}'
            ),
        }

        with (
            patch("ewp_api.cursor", return_value=cursor_context),
            patch("ewp_api._role", return_value="SECURITY"),
            patch("ewp_api._get", return_value=row),
            patch("ewp_api._authorized"),
            patch("ewp_api._validate_gate_qr"),
        ):
            with self.assertRaises(HTTPException) as error:
                gate_permit(
                    "permit-1",
                    GateWrite(
                        grant=True,
                        qrToken="qr-token",
                        contractorIdCard="ID-1",
                        consent=True,
                    ),
                    claims={"sub": "security-1"},
                )

        self.assertEqual(error.exception.status_code, 409)
        self.assertIn("verify the gate check-in code", error.exception.detail)

    def test_contractor_otp_for_unsaved_permit_does_not_create_a_draft(self):
        cursor = MagicMock()
        cursor.description = []
        cursor.fetchall.return_value = []
        cursor.fetchone.side_effect = [("EMPLOYEE", True), None]
        cursor_context = MagicMock()
        cursor_context.__enter__.return_value = cursor

        with (
            patch("ewp_api.cursor", return_value=cursor_context),
            patch("ewp_api._contractor_otp_hash", return_value="otp-hash"),
            patch("ewp_api._send_contractor_otp_email"),
        ):
            result = send_contractor_otp(
                "temporary-challenge-id",
                body=SimpleNamespace(contractorEmail="vendor@example.com"),
                claims={"sub": "employee-1"},
            )

        executed_sql = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertTrue(result["sent"])
        self.assertTrue(any("INSERT INTO [dbo].[EwpContractorOtpChallenges]" in sql for sql in executed_sql))
        self.assertFalse(any("INSERT INTO [dbo].[WorkPermits]" in sql for sql in executed_sql))

    def test_contractor_otp_can_be_verified_before_saving_a_permit(self):
        verified_at = datetime(2026, 10, 12, 10, 0)
        cursor = MagicMock()
        cursor.description = []
        cursor.fetchall.return_value = []
        cursor.fetchone.side_effect = [
            ("EMPLOYEE", True),
            (
                "employee-1",
                "vendor@example.com",
                "otp-hash",
                datetime(2026, 10, 12, 10, 10),
                0,
                None,
                0,
            ),
            (verified_at,),
        ]
        cursor_context = MagicMock()
        cursor_context.__enter__.return_value = cursor

        with (
            patch("ewp_api.cursor", return_value=cursor_context),
            patch("ewp_api._contractor_otp_hash", return_value="otp-hash"),
        ):
            result = verify_contractor_otp(
                "temporary-challenge-id",
                ContractorOtpVerify(code="123456", contractorEmail="vendor@example.com"),
                claims={"sub": "employee-1"},
            )

        executed_sql = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertTrue(result["verified"])
        self.assertEqual(result["verifiedAt"], verified_at.isoformat())
        self.assertFalse(any("[dbo].[ModuleEvents]" in sql for sql in executed_sql))

    def test_admin_can_verify_contractor_otp_before_saving_a_permit(self):
        verified_at = datetime(2026, 10, 12, 10, 0)
        cursor = MagicMock()
        cursor.description = []
        cursor.fetchall.return_value = []
        cursor.fetchone.side_effect = [
            ("ADMIN", True),
            (
                "admin-1",
                "vendor@example.com",
                "otp-hash",
                datetime(2026, 10, 12, 10, 10),
                0,
                None,
                0,
            ),
            (verified_at,),
        ]
        cursor_context = MagicMock()
        cursor_context.__enter__.return_value = cursor

        with (
            patch("ewp_api.cursor", return_value=cursor_context),
            patch("ewp_api._contractor_otp_hash", return_value="otp-hash"),
        ):
            result = verify_contractor_otp(
                "temporary-challenge-id",
                ContractorOtpVerify(code="123456", contractorEmail="vendor@example.com"),
                claims={"sub": "admin-1"},
            )

        self.assertTrue(result["verified"])
        self.assertEqual(result["verifiedAt"], verified_at.isoformat())

    def test_saving_verified_permit_uses_its_temporary_otp_challenge_id(self):
        permit_id = "temporary-challenge-id"
        cursor = MagicMock()
        cursor.fetchone.side_effect = [(0,), None, None]
        cursor_context = MagicMock()
        cursor_context.__enter__.return_value = cursor
        saved_row = {"Id": permit_id, "PermitType": "HOT_WORK", "Status": "DRAFT"}

        with (
            patch("ewp_api.cursor", return_value=cursor_context),
            patch("ewp_api._role", return_value="EMPLOYEE"),
            patch("ewp_api._branch_id", return_value="branch-1"),
            patch("ewp_api.rows_as_dicts", return_value=[]),
            patch("ewp_api._name", return_value="Permit User"),
            patch("ewp_api._get", return_value=saved_row),
            patch("ewp_api._event"),
            patch("ewp_api._payload", return_value={"id": permit_id}),
        ):
            result = save_permit(
                PermitWrite(
                    permit={
                        "id": permit_id,
                        "permitType": "HOT_WORK",
                        "branchId": "branch-1",
                        "workmenCount": 1,
                    }
                ),
                claims={"sub": "employee-1"},
            )

        insert_call = next(
            call for call in cursor.execute.call_args_list
            if "INSERT INTO [dbo].[WorkPermits]" in call.args[0]
        )
        self.assertEqual(result["id"], permit_id)
        self.assertEqual(insert_call.args[1], permit_id)

    def test_active_permit_blocks_creation_by_another_user(self):
        cursor = MagicMock()
        cursor.fetchone.side_effect = [(0,), None, ("active-permit",)]
        cursor_context = MagicMock()
        cursor_context.__enter__.return_value = cursor

        with (
            patch("ewp_api.cursor", return_value=cursor_context),
            patch("ewp_api._role", return_value="EMPLOYEE"),
            patch("ewp_api._branch_id", return_value="branch-1"),
        ):
            with self.assertRaises(HTTPException) as error:
                save_permit(
                    PermitWrite(
                        permit={
                            "permitType": "HOT_WORK",
                            "branchId": "branch-1",
                            "workmenCount": 1,
                        }
                    ),
                    claims={"sub": "another-employee"},
                )

        self.assertEqual(error.exception.status_code, 409)
        executed_sql = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertTrue(any("EwpActivePermitCreation" in sql for sql in executed_sql))
        self.assertTrue(any("'APPROVED','ACTIVE','CLOSURE_REQUESTED','EXTENSION_REQUESTED'" in sql for sql in executed_sql))
        self.assertFalse(any("INSERT INTO [dbo].[WorkPermits]" in sql for sql in executed_sql))

    def test_admin_cannot_approve_an_extension(self):
        cursor = MagicMock()
        cursor_context = MagicMock()
        cursor_context.__enter__.return_value = cursor
        row = {"Id": "permit-1", "Status": "EXTENSION_REQUESTED"}

        with (
            patch("ewp_api.cursor", return_value=cursor_context),
            patch("ewp_api._role", return_value="ADMIN"),
            patch("ewp_api._get", return_value=row),
            patch(
                "ewp_api._form",
                return_value={
                    "extensionRequest": {
                        "workDate": "2026-10-13",
                        "timeFrom": "09:00",
                        "timeTo": "17:00",
                        "justification": "Additional work time.",
                    }
                },
            ),
        ):
            with self.assertRaises(HTTPException) as error:
                confirm_closure(
                    "permit-1",
                    LifecycleWrite(action="APPROVE_EXTENSION"),
                    claims={"sub": "admin-1"},
                )

        self.assertEqual(error.exception.status_code, 403)
        self.assertFalse(any("UPDATE [dbo].[WorkPermits]" in call.args[0] for call in cursor.execute.call_args_list))

    def test_hse_extension_approval_updates_the_same_permit(self):
        permit_id = "permit-1"
        row = {"Id": permit_id, "Status": "EXTENSION_REQUESTED"}
        permit = {
            "id": permit_id,
            "permitNo": "CSWP-0001",
            "workDate": "2026-10-12",
            "timeFrom": "09:00",
            "timeTo": "17:00",
            "extensionRequest": {
                "workDate": "2026-10-13",
                "timeFrom": "09:00",
                "timeTo": "17:00",
                "justification": "Additional work time.",
            },
        }
        cursor = MagicMock()
        cursor_context = MagicMock()
        cursor_context.__enter__.return_value = cursor

        with (
            patch("ewp_api.cursor", return_value=cursor_context),
            patch("ewp_api._role", return_value="HSE"),
            patch("ewp_api._get", return_value=row),
            patch("ewp_api._form", return_value=permit),
            patch("ewp_api._name", return_value="HSE Reviewer"),
            patch("ewp_api._event"),
            patch("ewp_api._payload", return_value={"id": permit_id, "permitNo": "CSWP-0001"}),
        ):
            result = confirm_closure(
                permit_id,
                LifecycleWrite(action="APPROVE_EXTENSION"),
                claims={"sub": "hse-1"},
            )

        self.assertEqual(result, {"id": permit_id, "permitNo": "CSWP-0001"})
        self.assertEqual(permit["id"], permit_id)
        self.assertEqual(permit["permitNo"], "CSWP-0001")
        executed_sql = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertTrue(any("UPDATE [dbo].[WorkPermits] SET [Status]=?" in sql and "WHERE [Id]=?" in sql for sql in executed_sql))
        self.assertFalse(any("INSERT INTO [dbo].[WorkPermits]" in sql for sql in executed_sql))
        self.assertFalse(any("[CompletedAt]" in sql for sql in executed_sql))

    def test_submission_signature_is_populated_only_from_verified_otp(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = ("user-1", "vendor@example.com", datetime(2026, 10, 12))
        row = {"Id": "permit-1", "RaisedByUserId": "user-1"}
        permit = {"contractorEmail": "VENDOR@example.com", "signatures": {}}

        _set_verified_contractor_signature(
            cursor, row, permit, {"sub": "user-1"}, "EMPLOYEE"
        )

        self.assertEqual(permit["signatures"]["contractor"]["method"], "OTP")
        self.assertIs(permit["signatures"]["contractor"]["signed"], True)

    def test_submission_rejects_unverified_contractor_otp(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = ("user-1", "vendor@example.com", None)

        with self.assertRaises(HTTPException) as error:
            _set_verified_contractor_signature(
                cursor,
                {"Id": "permit-1", "RaisedByUserId": "user-1"},
                {"contractorEmail": "vendor@example.com"},
                {"sub": "user-1"},
                "EMPLOYEE",
            )

        self.assertEqual(error.exception.status_code, 409)

    def test_ewp_generic_reads_deny_fire_warden_and_scope_security(self):
        security_scope, security_params = _scope_clause(
            "work_permits", {"role": "SECURITY", "sub": "security-1"}
        )
        fire_scope, fire_params = _scope_clause(
            "work_permits", {"role": "FIRE_WARDEN", "sub": "fire-1"}
        )
        self.assertIn("[Status] IN ('APPROVED','ACTIVE')", security_scope)
        self.assertIn("JSON_VALUE([FormData], '$.branchId')", security_scope)
        self.assertEqual(security_params, ["security-1"])
        self.assertEqual(fire_scope, "1 = 0")
        self.assertEqual(fire_params, [])
        with self.assertRaises(HTTPException) as error:
            _authorized(
                MagicMock(),
                {"PermitType": "HOT_WORK", "Status": "PENDING_HSE"},
                "FIRE_WARDEN",
                {"sub": "fire-1"},
            )
        self.assertEqual(error.exception.status_code, 403)

    def test_work_permit_submission_requires_checklist_signatures_and_long_shift_justification(self):
        permit = {
            "permitType": "COLD",
            "branchId": "branch-1",
            "specializedType": "MAINTENANCE",
            "nature": "PREVENTIVE",
            "workDate": "2099-01-01",
            "timeFrom": "09:00",
            "timeTo": "17:00",
            "building": "A",
            "floor": "1",
            "wing": "N",
            "area": "Plant",
            "workDescription": "Planned maintenance activity",
            "jsaRef": "JSA-1",
            "contractor": "Contractor",
            "contractorEmail": "vendor@example.com",
            "supervisorName": "Supervisor",
            "supervisorMobile": "1234567890",
            "workmenCount": 1,
            "checklist": [
                {"item": "Area barricaded", "answer": "Y"},
                {"item": "Tools inspected", "answer": "Y"},
            ],
            "ppe": {"items": ["HELMET"]},
            "signatures": {"contractor": {"signed": True}, "execution": {"signed": True}},
        }
        _validate_submission(permit)
        permit["timeTo"] = "19:00"
        with self.assertRaises(HTTPException):
            _validate_submission(permit)
        permit["overNineHours"] = {
            "justification": "Work must be completed in one planned shift.",
            "hrAligned": True,
            "managementNote": True,
        }
        _validate_submission(permit)
        permit["timeTo"] = "20:00"
        with self.assertRaises(HTTPException):
            _validate_submission(permit)
        permit["nightWork"] = {
            "answers": {
                "SECURITY_NOTIFIED": "Y",
                "SUPERVISOR_PRESENT": "Y",
                "BUDDY_SYSTEM": "Y",
                "FIRE_WATCHER": "NA",
                "MEDICAL_SUPPORT": "Y",
            }
        }
        _validate_submission(permit)
        permit["checklist"][0]["answer"] = ""
        with self.assertRaises(HTTPException):
            _validate_submission(permit)

    def test_ewp_approval_email_uses_configured_smtp_and_attaches_qr_to_contractor(self):
        smtp_settings = SimpleNamespace(
            smtp_host="mail.example.com",
            smtp_port=587,
            smtp_username="smtp-user",
            smtp_password="smtp-password",
            smtp_from_email="permits@example.com",
            ewp_critical_contacts="HSE control room|100|hse@example.com;Security gate|101|security@example.com",
            smtp_use_tls=True,
            smtp_use_ssl=False,
        )
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        with (
            patch("ewp_api.settings", smtp_settings),
            patch("ewp_api.smtplib.SMTP", return_value=smtp) as smtp_factory,
        ):
            _send_approval_email(
                {
                    "id": "permit-1",
                    "permitNo": "CWP-0001",
                    "qrValue": "FCM-EWP:permit-1:token",
                    "workDescription": "Planned maintenance",
                    "building": "A",
                    "floor": "1",
                    "wing": "East",
                    "area": "Boiler room",
                    "contractor": "Example Works",
                    "contractorEmail": "contractor@example.com",
                    "supervisorName": "Supervisor",
                    "workmenCount": 12,
                    "workDate": "2099-01-01",
                    "timeFrom": "09:00",
                    "timeTo": "17:00",
                    "checklist": [{"item": "Area cleared", "answer": "Y"}],
                    "ppe": {"items": ["HELMET"], "special": ""},
                },
                "contractor@example.com",
            )

        smtp_factory.assert_called_once_with("mail.example.com", 587, timeout=15)
        smtp.starttls.assert_called_once()
        message = smtp.send_message.call_args.args[0]
        self.assertEqual(message["To"], "contractor@example.com")
        self.assertIn("CWP-0001", message["Subject"])
        self.assertIn("Expected workers: 12 workers", message.get_body(preferencelist=("plain",)).get_content())
        self.assertIn(
            "Workers expected:</strong> 12 workers",
            message.get_body(preferencelist=("html",)).get_content(),
        )
        self.assertTrue(any(part.get_content_type() == "image/png" for part in message.walk()))
        pdf = next(
            part for part in message.walk() if part.get_content_type() == "application/pdf"
        )
        self.assertEqual(pdf.get_filename(), "CWP-0001_precaution_pack.pdf")
        self.assertTrue(pdf.get_payload(decode=True).startswith(b"%PDF-"))
        self.assertIn(b"CWP-0001", pdf.get_payload(decode=True))

    def test_ewp_worker_count_label_handles_singular_plural_and_missing_values(self):
        self.assertEqual(_worker_count_label({"workmenCount": 1}), "1 worker")
        self.assertEqual(_worker_count_label({"workmenCount": 12}), "12 workers")
        self.assertEqual(_worker_count_label({}), "Not recorded")

    def test_ewp_approval_email_destination_is_the_permit_contractor(self):
        permit = {
            "contractorEmail": "contractor@example.com",
            "raisedByEmail": "requester@example.com",
        }

        self.assertEqual(
            _contractor_email_for_approval(permit),
            "contractor@example.com",
        )

    def test_public_email_checkout_does_not_require_an_inventory_card(self):
        cursor = MagicMock()
        cursor.rowcount = 1
        context = MagicMock()
        context.__enter__.return_value = cursor
        with (
            patch("app.cursor", return_value=context),
            patch("app._public_visit_by_token", return_value={"Status": "CHECKED_IN", "GuestCardNumber": None}),
            patch("app.rows_as_dicts", return_value=[{"Id": "visit-1"}]),
            patch("app._public_visit_payload", return_value={"id": "visit-1", "status": "CHECKED_OUT"}),
            patch("app._append_vms_notification"),
            patch("app._read_virtual") as read_virtual,
        ):
            result = public_visitor_check_out(
                "visit-1",
                VisitorTokenRequest(token="s" * 64),
            )

        self.assertEqual(result["status"], "CHECKED_OUT")
        read_virtual.assert_not_called()

    def test_public_visitor_pass_lookup_by_qr_token_reports_verified_state(self):
        context = MagicMock()
        context.__exit__.return_value = False
        visit = {"Id": "visit-1", "Status": "APPROVED"}
        with (
            patch("app.cursor", return_value=context),
            patch("app._public_visit_by_qr_token", return_value=visit),
            patch("app._visitor_checkin_otp_verified", return_value=True) as is_verified,
            patch(
                "app._public_visit_payload",
                return_value={"id": "visit-1", "check_in_verified": True},
            ) as payload,
        ):
            result = public_visitor_pass_by_qr_token("s" * 64)

        self.assertTrue(result["check_in_verified"])
        is_verified.assert_called_once_with(context.__enter__.return_value, "visit-1")
        payload.assert_called_once_with(visit, True)

    def test_public_qr_check_in_requires_verified_otp(self):
        now = datetime.now(ZoneInfo("Asia/Kolkata"))
        db_context = MagicMock()
        cursor = db_context.__enter__.return_value
        cursor.fetchone.return_value = None
        db_context.__exit__.return_value = False
        with self.assertRaises(HTTPException) as error:
            with (
                patch("app.cursor", return_value=db_context),
                patch(
                    "app._public_visit_by_token",
                    return_value={
                        "Status": "APPROVED",
                        "Email": "visitor@example.com",
                        "VisitDate": now.date(),
                        "ExpectedArrival": (now - timedelta(minutes=5)).time(),
                        "ExpectedDeparture": (now + timedelta(minutes=30)).time(),
                    },
                ),
                patch("app._require_visitor_inside_geofence"),
            ):
                public_visitor_check_in(
                    "visit-1",
                    VisitorCheckInOtpRequest(
                        token="s" * 64,
                        latitude=12.0,
                        longitude=77.0,
                    ),
                )

        self.assertEqual(error.exception.status_code, 409)
        self.assertIn("Verify the visitor email", error.exception.detail)

    def test_public_qr_check_in_after_verified_otp_updates_visit(self):
        now = datetime.now(ZoneInfo("Asia/Kolkata"))
        db_context = MagicMock()
        cursor = db_context.__enter__.return_value
        cursor.fetchone.return_value = ("visitor@example.com", datetime.now())
        cursor.rowcount = 1
        db_context.__exit__.return_value = False
        with (
            patch("app.cursor", return_value=db_context),
            patch(
                "app._public_visit_by_token",
                return_value={
                    "Id": "visit-1",
                    "Status": "APPROVED",
                    "Email": "visitor@example.com",
                    "VisitDate": now.date(),
                    "ExpectedArrival": (now - timedelta(minutes=5)).time(),
                    "ExpectedDeparture": (now + timedelta(minutes=30)).time(),
                },
            ),
            patch("app._require_visitor_checkin_window") as check_window,
            patch("app._require_visitor_inside_geofence") as check_geofence,
            patch(
                "app.rows_as_dicts",
                return_value=[{"Id": "visit-1", "Status": "CHECKED_IN"}],
            ),
            patch(
                "app._public_visit_payload",
                return_value={"id": "visit-1", "status": "CHECKED_IN"},
            ) as payload,
            patch("app._append_vms_notification"),
        ):
            result = public_visitor_check_in(
                "visit-1",
                VisitorCheckInOtpRequest(
                    token="s" * 64,
                    latitude=12.0,
                    longitude=77.0,
                ),
            )

        self.assertEqual(result["status"], "CHECKED_IN")
        check_window.assert_called_once()
        check_geofence.assert_called_once_with(cursor, ANY, 12.0, 77.0)
        payload.assert_called_once_with({"Id": "visit-1", "Status": "CHECKED_IN"})
        statements = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertTrue(
            any("SET [Status] = 'CHECKED_IN'" in statement for statement in statements)
        )
        self.assertTrue(
            any(
                "'CHECKED_IN'" in statement and "ModuleEvents" in statement
                for statement in statements
            )
        )

    def test_visitor_geofence_distance_and_radius_check(self):
        self.assertAlmostEqual(_distance_meters(12.0, 77.0, 12.0, 77.0), 0)
        self.assertGreater(_distance_meters(12.0, 77.0, 12.001, 77.0), 100)

        class GeofenceCursor:
            def __init__(self, row):
                self.row = row

            def execute(self, *_args):
                pass

            def fetchone(self):
                return self.row

        visit = {"Location": "Hosur Office"}
        distance = _require_visitor_inside_geofence(
            GeofenceCursor((12.0, 77.0, 100)),
            visit,
            12.0001,
            77.0,
        )
        self.assertLess(distance, 100)
        with self.assertRaises(HTTPException) as outside:
            _require_visitor_inside_geofence(
                GeofenceCursor((12.0, 77.0, 100)),
                visit,
                12.002,
                77.0,
            )
        self.assertEqual(outside.exception.status_code, 403)
        with self.assertRaises(HTTPException) as missing_config:
            _require_visitor_inside_geofence(
                GeofenceCursor((None, None, 100)),
                visit,
                12.0,
                77.0,
            )
        self.assertEqual(missing_config.exception.status_code, 409)

    def test_visitor_checkin_otp_hash_is_keyed_by_visit_email_and_code(self):
        with patch("app.settings", SimpleNamespace(jwt_secret="s" * 32)):
            original = _visitor_checkin_otp_hash(
                "visit-1", "Visitor@example.com", "123456"
            )
            self.assertEqual(
                original,
                _visitor_checkin_otp_hash(
                    "visit-1", "visitor@EXAMPLE.com", "123456"
                ),
            )
            self.assertNotEqual(
                original,
                _visitor_checkin_otp_hash(
                    "visit-2", "Visitor@example.com", "123456"
                ),
            )

    def test_visitor_checkin_otp_send_checks_location_and_sends_to_registered_email(self):
        now = datetime.now(ZoneInfo("Asia/Kolkata"))
        context = MagicMock()
        cursor = context.__enter__.return_value
        cursor.fetchone.return_value = None
        context.__exit__.return_value = False
        visit = {
            "Status": "APPROVED",
            "Email": "visitor@example.com",
            "VisitorName": "Visitor",
            "Location": "Hosur Office",
            "VisitDate": now.date(),
            "ExpectedArrival": (now - timedelta(minutes=5)).time(),
            "ExpectedDeparture": (now + timedelta(minutes=30)).time(),
        }
        with (
            patch("app.cursor", return_value=context),
            patch("app.settings", SimpleNamespace(jwt_secret="s" * 32)),
            patch("app._public_visit_by_token", return_value=visit),
            patch("app._require_visitor_inside_geofence", return_value=12.0) as inside,
            patch("app._send_visitor_checkin_otp_email") as send_email,
        ):
            result = send_visitor_checkin_otp(
                "visit-1",
                VisitorCheckInOtpRequest(
                    token="s" * 64,
                    latitude=12.0,
                    longitude=77.0,
                ),
            )

        inside.assert_called_once_with(cursor, visit, 12.0, 77.0)
        send_email.assert_called_once()
        self.assertEqual(send_email.call_args.args[0], "visitor@example.com")
        self.assertEqual(result["destination"], "v***@example.com")
        self.assertEqual(result["expiresInSeconds"], 600)

    def test_visitor_cannot_request_checkin_code_before_scheduled_start(self):
        timezone = ZoneInfo("Asia/Kolkata")
        start = datetime.now(timezone) + timedelta(minutes=30)
        visit = {
            "Status": "APPROVED",
            "Email": "visitor@example.com",
            "Location": "Hosur Office",
            "VisitDate": start.date(),
            "ExpectedArrival": start.time(),
            "ExpectedDeparture": (start + timedelta(hours=1)).time(),
        }
        context = MagicMock()
        context.__enter__.return_value = MagicMock()
        context.__exit__.return_value = False
        with (
            patch("app.cursor", return_value=context),
            patch("app._public_visit_by_token", return_value=visit),
            patch("app._require_visitor_inside_geofence") as check_geofence,
            patch("app._send_visitor_checkin_otp_email") as send_email,
        ):
            with self.assertRaises(HTTPException) as error:
                send_visitor_checkin_otp(
                    "visit-1",
                    VisitorCheckInOtpRequest(
                        token="s" * 64,
                        latitude=12.0,
                        longitude=77.0,
                    ),
                )

        self.assertEqual(error.exception.status_code, 409)
        self.assertIn("opens at", error.exception.detail)
        check_geofence.assert_not_called()
        send_email.assert_not_called()

    def test_visitor_checkin_is_limited_to_approved_local_schedule_window(self):
        timezone = ZoneInfo("Asia/Kolkata")
        visit = {
            "VisitDate": date(2026, 10, 16),
            "ExpectedArrival": time(18, 0),
            "ExpectedDeparture": time(21, 0),
        }
        before = datetime(2026, 10, 16, 17, 0, tzinfo=timezone)
        during = datetime(2026, 10, 16, 18, 0, tzinfo=timezone)
        after = datetime(2026, 10, 16, 21, 0, tzinfo=timezone)

        available, message = _visitor_checkin_window(visit, before)
        self.assertFalse(available)
        self.assertIn("opens at 18:00 IST", message)
        with self.assertRaises(HTTPException) as early:
            _require_visitor_checkin_window(visit, before)
        self.assertEqual(early.exception.status_code, 409)

        self.assertTrue(_visitor_checkin_window(visit, during)[0])
        available, message = _visitor_checkin_window(visit, after)
        self.assertFalse(available)
        self.assertIn("window ended at 21:00 IST", message)
        with self.assertRaises(HTTPException) as late:
            _require_visitor_checkin_window(visit, after)
        self.assertEqual(late.exception.status_code, 409)

    def test_visitor_checkin_otp_verification_counts_bad_codes_without_checking_in(self):
        now = datetime.now(ZoneInfo("Asia/Kolkata"))
        context = MagicMock()
        cursor = context.__enter__.return_value
        cursor.fetchone.return_value = (
            "visitor@example.com",
            "0" * 64,
            datetime.now(),
            0,
            None,
            0,
        )
        context.__exit__.return_value = False
        with (
            patch("app.cursor", return_value=context),
            patch("app.settings", SimpleNamespace(jwt_secret="s" * 32)),
            patch(
                "app._public_visit_by_token",
                return_value={
                    "Status": "APPROVED",
                    "Email": "visitor@example.com",
                    "Location": "Hosur Office",
                    "VisitDate": now.date(),
                    "ExpectedArrival": (now - timedelta(minutes=5)).time(),
                    "ExpectedDeparture": (now + timedelta(minutes=30)).time(),
                },
            ),
            patch("app._require_visitor_inside_geofence"),
        ):
            with self.assertRaises(HTTPException) as context_error:
                verify_visitor_checkin_otp(
                    "visit-1",
                    VisitorCheckInOtpVerifyRequest(
                        token="s" * 64,
                        latitude=12.0,
                        longitude=77.0,
                        code="123456",
                    ),
                )

        self.assertEqual(context_error.exception.status_code, 400)
        self.assertTrue(
            any(
                "SET [Attempts] = [Attempts] + 1" in call.args[0]
                for call in cursor.execute.call_args_list
            )
        )
        self.assertFalse(
            any("SET [Status] = 'CHECKED_IN'" in call.args[0] for call in cursor.execute.call_args_list)
        )

    def test_visitor_checkin_otp_verification_marks_email_verified_without_checking_in(self):
        now = datetime.now(ZoneInfo("Asia/Kolkata"))
        code = "123456"
        with patch("app.settings", SimpleNamespace(jwt_secret="s" * 32)):
            code_hash = _visitor_checkin_otp_hash("visit-1", "visitor@example.com", code)
        challenge = ("visitor@example.com", code_hash, datetime.now(), 0, None, 0)
        context = MagicMock()
        cursor = context.__enter__.return_value
        cursor.fetchone.return_value = challenge
        context.__exit__.return_value = False
        with (
            patch("app.cursor", return_value=context),
            patch("app.settings", SimpleNamespace(jwt_secret="s" * 32)),
            patch(
                "app._public_visit_by_token",
                return_value={
                    "Id": "visit-1",
                    "Status": "APPROVED",
                    "Email": "visitor@example.com",
                    "VisitDate": now.date(),
                    "ExpectedArrival": (now - timedelta(minutes=5)).time(),
                    "ExpectedDeparture": (now + timedelta(minutes=30)).time(),
                },
            ),
            patch("app._require_visitor_inside_geofence"),
            patch(
                "app.rows_as_dicts",
                return_value=[{"Id": "visit-1", "Status": "APPROVED"}],
            ),
            patch(
                "app._public_visit_payload",
                return_value={"id": "visit-1", "check_in_verified": True},
            ) as payload,
        ):
            result = verify_visitor_checkin_otp(
                "visit-1",
                VisitorCheckInOtpVerifyRequest(
                    token="s" * 64,
                    latitude=12.0,
                    longitude=77.0,
                    code=code,
                ),
            )

        self.assertTrue(result["check_in_verified"])
        payload.assert_called_once_with(
            {"Id": "visit-1", "Status": "APPROVED"},
            check_in_verified=True,
        )
        self.assertTrue(
            any(
                "SET [UsedAt] = SYSUTCDATETIME()" in call.args[0]
                for call in cursor.execute.call_args_list
            )
        )
        self.assertFalse(
            any("SET [Status] = 'CHECKED_IN'" in call.args[0] for call in cursor.execute.call_args_list)
        )

    def test_issuing_guest_pass_updates_approved_visit_status(self):
        cursor = MagicMock()
        cursor.rowcount = 1
        cursor.fetchone.side_effect = [
            ("SECURITY", True, "Bengaluru Office", "Bengaluru", "Bengaluru Office", "APPROVED", "visit-1"),
            ("APPROVED",),
        ]
        context = MagicMock()
        context.__enter__.return_value = cursor
        event_cursor = MagicMock()
        event_cursor.execute.side_effect = RuntimeError("activity storage unavailable")
        event_context = MagicMock()
        event_context.__enter__.return_value = event_cursor
        notification_context = MagicMock()
        notification_context.__enter__.return_value = MagicMock()
        with (
            patch("app.cursor", side_effect=[context, event_context, notification_context]),
            patch("app._legacy_visit", return_value={"id": "visit-1", "status": "CARD_ISSUED"}),
            patch("app._current_user_name", return_value="Security"),
            patch("app._append_vms_notification", side_effect=RuntimeError("notification storage unavailable")),
        ):
            visit = issue_visitor_guest_pass("visit-1", {"sub": "security-1", "role": "SECURITY"})

        self.assertEqual(visit["status"], "CARD_ISSUED")
        event_cursor.execute.assert_called_once()
        self.assertTrue(
            any(
                "SET [Status] = 'CARD_ISSUED'" in call.args[0]
                for call in cursor.execute.call_args_list
            )
        )

    def test_branch_hosts_include_designation_and_all_active_roles(self):
        class HostCursor:
            description = []

            def __init__(self):
                self.calls = 0

            def execute(self, *_args):
                self.calls += 1
                if self.calls == 2:
                    self.description = [
                        ("Id",), ("Name",), ("Designation",), ("Role",)
                    ]

            def fetchone(self):
                return ("active-branch",)

            def fetchall(self):
                return [
                    ("manager-1", "Branch Manager", "Manager", "BRANCH_MANAGER"),
                    ("security-1", "Security User", "Security Officer", "SECURITY"),
                ]

        host_cursor = HostCursor()
        cursor_context = MagicMock()
        cursor_context.__enter__.return_value = host_cursor
        cursor_context.__exit__.return_value = False
        with patch("app.cursor", return_value=cursor_context):
            hosts = list_branch_hosts("branch-1", {})

        self.assertEqual(
            hosts,
            [
                {
                    "id": "manager-1",
                    "name": "Branch Manager",
                    "designation": "Manager",
                    "role": "BRANCH_MANAGER",
                },
                {
                    "id": "security-1",
                    "name": "Security User",
                    "designation": "Security Officer",
                    "role": "SECURITY",
                },
            ],
        )
    def test_invitation_url_opens_gate_verification_and_requires_https_public_url(self):
        settings = SimpleNamespace(public_app_url="https://vms.example.com")
        with patch("app.settings", settings):
            url = _visitor_checkin_url("secure-token")
            self.assertEqual(url, "https://vms.example.com/gate/secure-token/verify")

        with patch("app.settings", SimpleNamespace(public_app_url="http://vms.example.com")):
            with self.assertRaises(RuntimeError):
                _visitor_checkin_url("secure-token")

    def test_visitor_pass_token_is_stable_and_visit_scoped(self):
        settings = SimpleNamespace(jwt_secret="s" * 32)
        with patch("app.settings", settings):
            first = _visitor_qr_token("visit-1")
            self.assertEqual(first, _visitor_qr_token("visit-1"))
            self.assertNotEqual(first, _visitor_qr_token("visit-2"))

    def test_otp_emails_include_branded_html_and_plain_text_alternatives(self):
        smtp_settings = SimpleNamespace(
            smtp_host="mail.example.com",
            smtp_port=587,
            smtp_username="",
            smtp_password="",
            smtp_from_email="noreply@example.com",
            smtp_use_tls=False,
            smtp_use_ssl=False,
        )
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        with (
            patch("app.settings", smtp_settings),
            patch("app.smtplib.SMTP", return_value=smtp),
        ):
            _send_visitor_checkin_otp_email(
                "visitor@example.com",
                "012345",
                {"VisitorName": "Example Visitor", "VisitorCode": "VIS-001"},
            )
            _send_public_helpdesk_otp(
                "employee@example.com",
                "654321",
                "North Office",
            )

        self.assertEqual(smtp.send_message.call_count, 2)
        for call in smtp.send_message.call_args_list:
            message = call.args[0]
            plain = message.get_body(preferencelist=("plain",)).get_content()
            html_body = message.get_body(preferencelist=("html",)).get_content()
            self.assertIn("FCM Console", html_body)
            self.assertNotIn("This is an automated message from FCM Console.", html_body)
            self.assertIn("expires in 10 minutes", plain)
        self.assertIn(
            "012345",
            smtp.send_message.call_args_list[0].args[0]
            .get_body(preferencelist=("html",))
            .get_content(),
        )
        self.assertIn(
            "654321",
            smtp.send_message.call_args_list[1].args[0]
            .get_body(preferencelist=("html",))
            .get_content(),
        )

    def test_visitor_invitation_is_sent_through_configured_smtp(self):
        smtp_settings = SimpleNamespace(
            smtp_host="mail.example.com",
            smtp_port=587,
            smtp_username="smtp-user",
            smtp_password="smtp-password",
            smtp_from_email="visitors@example.com",
            smtp_use_tls=True,
            smtp_use_ssl=False,
            public_app_url="https://vms.example.com",
        )
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        visit = {
            "id": "visit-1",
            "email": "visitor@example.com",
            "visitor_name": "Example Visitor",
            "visit_date": "2026-10-10",
        }

        with (
            patch("app.settings", smtp_settings),
            patch("app.smtplib.SMTP", return_value=smtp) as smtp_factory,
        ):
            message_id = _send_visitor_invitation(visit, "secure-token")

        smtp_factory.assert_called_once_with("mail.example.com", 587, timeout=15)
        smtp.starttls.assert_called_once()
        smtp.login.assert_called_once_with("smtp-user", "smtp-password")
        sent_message = smtp.send_message.call_args.args[0]
        self.assertIsInstance(sent_message, EmailMessage)
        self.assertEqual(sent_message["To"], "visitor@example.com")
        self.assertEqual(sent_message["From"], "visitors@example.com")
        self.assertTrue(
            any(part.get_content_type() == "image/png" for part in sent_message.walk())
        )
        html_content = next(
            part.get_content()
            for part in sent_message.walk()
            if part.get_content_type() == "text/html"
        )
        self.assertIn("FCM Console", html_content)
        self.assertNotIn("This is an automated message from FCM Console.", html_content)
        self.assertIn("Visitor Management", html_content)
        self.assertIn(">Check in now</a>", html_content)
        plain_content = sent_message.get_body(("plain",)).get_content()
        removed_instructions = (
            "Present this QR at the entrance",
            "This printable QR pass is your guest card",
            "Return the printed pass to Security manually before checking out",
        )
        for instruction in removed_instructions:
            self.assertNotIn(instruction, plain_content)
            self.assertNotIn(instruction, html_content)
        self.assertIn("Open your secure visitor pass and check in:", plain_content)
        self.assertEqual(message_id, sent_message["Message-ID"])

    def test_approved_visit_schedule_email_includes_destination_and_schedule(self):
        smtp_settings = SimpleNamespace(
            smtp_host="mail.example.com",
            smtp_port=587,
            smtp_username="smtp-user",
            smtp_password="smtp-password",
            smtp_from_email="visitors@example.com",
            smtp_use_tls=True,
            smtp_use_ssl=False,
        )
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        with (
            patch("app.settings", smtp_settings),
            patch("app.smtplib.SMTP", return_value=smtp),
        ):
            _send_branch_manager_visit_approved_email(
                {"Id": "manager-1", "Email": "manager@example.com"},
                {
                    "id": "visit-1",
                    "name": "Example Visitor",
                    "location": "Hosur Office",
                    "visitDate": "2026-10-10",
                    "expectedArrival": "09:30",
                    "expectedDeparture": "12:30",
                    "hostName": "Anusha",
                    "purpose": "Project meeting",
                    "requestId": "REQ-100",
                    "visitorId": "VIS-100",
                },
            )

        sent = smtp.send_message.call_args.args[0]
        self.assertEqual(sent["To"], "manager@example.com")
        self.assertIn("scheduled to visit Hosur Office", sent["Subject"])
        body = sent.get_body(("plain",)).get_content()
        for expected in (
            "This visitor is scheduled to visit your branch.",
            "Visitor: Example Visitor",
            "Date: 2026-10-10",
            "Time: 09:30 - 12:30",
            "Location: Hosur Office",
            "Host: Anusha",
            "Purpose: Project meeting",
            "Request: REQ-100",
            "Visitor ID: VIS-100",
        ):
            self.assertIn(expected, body)

    def test_approved_visit_emails_active_branch_managers(self):
        cursor = MagicMock()
        manager = {"Id": "manager-1", "Email": "manager@example.com", "Name": "Manager"}
        visit = {"id": "visit-1", "location": "Hosur Office"}
        with (
            patch("app.rows_as_dicts", return_value=[manager]),
            patch("app._send_branch_manager_visit_approved_email") as send_manager_email,
        ):
            status = _notify_branch_managers_of_approved_visit(cursor, visit)

        query, location, address = cursor.execute.call_args.args
        self.assertIn("manager.[Role] = 'BRANCH_MANAGER'", query)
        self.assertIn("manager.[IsActive] = 1", query)
        self.assertEqual((location, address), ("Hosur Office", "Hosur Office"))
        send_manager_email.assert_called_once_with(manager, visit)
        self.assertEqual(status, "SENT")

    def test_approved_visit_manager_email_resolves_location_for_legacy_visit(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = ("Hosur Office",)
        manager = {"Id": "manager-1", "Email": "manager@example.com", "Name": "Manager"}
        with (
            patch("app.rows_as_dicts", return_value=[manager]),
            patch("app._send_branch_manager_visit_approved_email") as send_manager_email,
        ):
            status = _notify_branch_managers_of_approved_visit(cursor, {"id": "visit-1"})

        self.assertIn("[Location]", cursor.execute.call_args_list[0].args[0])
        self.assertEqual(cursor.execute.call_args_list[1].args[1:], ("Hosur Office", "Hosur Office"))
        send_manager_email.assert_called_once_with(
            manager, {"id": "visit-1", "location": "Hosur Office"}
        )
        self.assertEqual(status, "SENT")

    def test_approving_visit_sends_schedule_email_to_branch_managers(self):
        context = MagicMock()
        cursor = context.__enter__.return_value
        context.__exit__.return_value = False
        visit = {
            "id": "visit-1",
            "name": "Example Visitor",
            "email": "visitor@example.com",
            "location": "Hosur Office",
        }
        with (
            patch("app.cursor", return_value=context),
            patch("app._current_role", return_value="BRANCH_MANAGER"),
            patch("app._require_visit_branch_access"),
            patch("app._current_user_name", return_value="Branch Manager"),
            patch("app._visitor_qr_token", return_value="qr-token"),
            patch("app._legacy_visit", return_value=visit),
            patch("app._append_vms_notification"),
            patch("app._send_visitor_invitation"),
            patch("app._visitor_checkin_url", return_value="https://example.com/pass"),
            patch("app._notify_branch_managers_of_approved_visit", return_value="SENT") as notify_managers,
        ):
            result = approve_visit("visit-1", {"sub": "manager-1", "role": "BRANCH_MANAGER"})

        notify_managers.assert_called_once_with(cursor, visit)
        self.assertEqual(result["branchManagerNotificationStatus"], "SENT")

    def test_security_cannot_mutate_visit_rows_through_generic_database_api(self):
        with patch("app._current_role", return_value="SECURITY"):
            with self.assertRaises(HTTPException) as context:
                database_query(
                    "visit_requests",
                    QueryRequest(action="update", filters=[{"column": "id", "value": "visit-1"}]),
                    {"sub": "security-1", "role": "SECURITY"},
                )
        self.assertEqual(context.exception.status_code, 403)

    def test_security_cannot_create_visit_rows_through_generic_database_api(self):
        with patch("app._current_role", return_value="SECURITY"):
            with self.assertRaises(HTTPException) as context:
                database_query(
                    "visit_requests",
                    QueryRequest(action="insert", data={"visitor_name": "Guest"}),
                    {"sub": "security-1", "role": "SECURITY"},
                )
        self.assertEqual(context.exception.status_code, 403)

    def test_security_can_create_walk_in_visit_requests_only(self):
        claims = {"sub": "security-1", "role": "SECURITY"}
        with patch("app._current_role", return_value="SECURITY"):
            _require_visit_create_access(claims, {"source": "WALK_IN"})
            with self.assertRaises(HTTPException) as context:
                _require_visit_create_access(claims, {"source": "PORTAL"})
        self.assertEqual(context.exception.status_code, 403)

    def test_user_password_hash_is_not_selectable(self):
        with self.assertRaises(HTTPException) as context:
            _select_fields("profiles", "id,password_hash", None)
        self.assertEqual(context.exception.status_code, 403)
        self.assertEqual(_field("profiles", "id", None), "Id")

    def test_profiles_are_normalized_without_a_physical_building_column(self):
        selected = _select_fields("profiles", "id,name,building", None)
        self.assertEqual(selected[-1], "CAST(NULL AS nvarchar(200)) AS [Building]")
        normalized = _normalize(
            "profiles",
            {"Id": "u-1", "Name": "Example", "IsActive": True},
            None,
        )
        self.assertEqual(normalized["status"], "ACTIVE")
        self.assertTrue(normalized["active"])

    def test_visit_events_are_normalized_to_frontend_event_shape(self):
        normalized = _normalize(
            "visit_events",
            {
                "Id": "event-1",
                "RecordId": "visit-1",
                "Action": "CREATED",
                "Note": "Request submitted",
                "ActorName": "Admin",
                "CreatedAt": "2026-10-09T12:00:00",
            },
            "VISIT",
        )

        self.assertEqual(
            normalized,
            {
                "id": "event-1",
                "visit_id": "visit-1",
                "event": "CREATED",
                "note": "Request submitted",
                "actor_name": "Admin",
                "created_at": "2026-10-09T12:00:00",
            },
        )

    def test_employee_visit_scope_is_owner_or_host(self):
        clause, params = _scope_clause(
            "visit_requests", {"sub": "user-1", "role": "EMPLOYEE"}
        )
        self.assertIn("RequestedByUserId", clause)
        self.assertIn("HostUserId", clause)
        self.assertEqual(params, ["user-1", "user-1"])

    def test_employee_can_mark_own_helpdesk_notification_read(self):
        context = MagicMock()
        cursor = context.__enter__.return_value
        context.__exit__.return_value = False
        notifications = [
            {"id": "notification-own", "recipient_id": "employee-1", "is_read": False},
            {"id": "notification-other", "recipient_id": "employee-2", "is_read": False},
        ]
        with (
            patch("app._current_role", return_value="EMPLOYEE"),
            patch("app.cursor", return_value=context),
            patch("app._read_virtual", return_value=notifications),
            patch("app._write_virtual") as write_virtual,
        ):
            result = database_query(
                "hd_notifications",
                QueryRequest(
                    action="update",
                    data={"is_read": True},
                    filters=[{"column": "id", "value": "notification-own"}],
                ),
                {"sub": "employee-1", "role": "EMPLOYEE"},
            )

        self.assertEqual(result["data"][0]["id"], "notification-own")
        self.assertTrue(result["data"][0]["is_read"])
        self.assertEqual(
            [row["id"] for row in write_virtual.call_args.args[2]],
            ["notification-own", "notification-other"],
        )
        self.assertTrue(write_virtual.call_args.args[2][0]["is_read"])
        self.assertFalse(write_virtual.call_args.args[2][1]["is_read"])

    def test_helpdesk_notification_list_is_limited_to_current_recipient(self):
        context = MagicMock()
        context.__enter__.return_value = MagicMock()
        context.__exit__.return_value = False
        notifications = [
            {"id": "notification-own", "recipient_id": "employee-1"},
            {"id": "notification-other", "recipient_id": "employee-2"},
        ]
        with (
            patch("app._current_role", return_value="EMPLOYEE"),
            patch("app.cursor", return_value=context),
            patch("app._read_virtual", return_value=notifications),
        ):
            result = database_query(
                "hd_notifications",
                QueryRequest(action="select"),
                {"sub": "employee-1", "role": "EMPLOYEE"},
            )

        self.assertEqual(
            [notification["id"] for notification in result["data"]],
            ["notification-own"],
        )

    def test_employee_cannot_mark_another_users_helpdesk_notification_read(self):
        context = MagicMock()
        context.__enter__.return_value = MagicMock()
        context.__exit__.return_value = False
        notifications = [
            {"id": "notification-other", "recipient_id": "employee-2", "is_read": False},
        ]
        with (
            patch("app._current_role", return_value="EMPLOYEE"),
            patch("app.cursor", return_value=context),
            patch("app._read_virtual", return_value=notifications),
            patch("app._write_virtual") as write_virtual,
        ):
            result = database_query(
                "hd_notifications",
                QueryRequest(
                    action="update",
                    data={"is_read": True},
                    filters=[{"column": "id", "value": "notification-other"}],
                ),
                {"sub": "employee-1", "role": "EMPLOYEE"},
            )

        self.assertEqual(result["data"], [])
        self.assertFalse(write_virtual.call_args.args[2][0]["is_read"])

    def test_helpdesk_notification_update_cannot_change_other_fields(self):
        with patch("app._current_role", return_value="EMPLOYEE"):
            with self.assertRaises(HTTPException) as error:
                database_query(
                    "hd_notifications",
                    QueryRequest(
                        action="update",
                        data={"is_read": True, "recipient_id": "employee-2"},
                        filters=[{"column": "id", "value": "notification-own"}],
                    ),
                    {"sub": "employee-1", "role": "EMPLOYEE"},
                )

        self.assertEqual(error.exception.status_code, 400)

    def test_branch_manager_visit_scope_matches_assigned_branch_location(self):
        claims = {"sub": "manager-1", "role": "BRANCH_MANAGER"}
        visit_scope, visit_params = _scope_clause("visit_requests", claims)
        event_scope, event_params = _scope_clause("visit_events", claims)

        self.assertIn("AppUsers", visit_scope)
        self.assertIn("Branches", visit_scope)
        self.assertIn("[Location] = branch.[Name]", visit_scope)
        self.assertIn("[Location] = branch.[Address]", visit_scope)
        self.assertEqual(visit_params, ["manager-1"])
        self.assertIn("[RecordId] IN (SELECT [Id] FROM [dbo].[Visits]", event_scope)
        self.assertEqual(event_params, ["manager-1"])

    def test_security_visit_scope_is_limited_to_assigned_branch_location(self):
        claims = {"sub": "security-hosur", "role": "SECURITY"}
        visit_scope, visit_params = _scope_clause("visit_requests", claims)
        event_scope, event_params = _scope_clause("visit_events", claims)

        self.assertIn("manager.[Id] = ?", visit_scope)
        self.assertIn("[Location] = branch.[Name]", visit_scope)
        self.assertIn("[Location] = branch.[Address]", visit_scope)
        self.assertEqual(visit_params, ["security-hosur"])
        self.assertIn("[RecordId] IN (SELECT [Id] FROM [dbo].[Visits]", event_scope)
        self.assertIn("manager.[Id] = ?", event_scope)
        self.assertEqual(event_params, ["security-hosur"])

    def test_security_visit_listing_applies_assigned_branch_filter(self):
        context = MagicMock()
        cursor = context.__enter__.return_value
        context.__exit__.return_value = False
        cursor.fetchall.return_value = []
        with (
            patch("app._current_role", return_value="SECURITY"),
            patch("app.cursor", return_value=context),
        ):
            result = list_visits({"sub": "security-hosur", "role": "SECURITY"})

        query, params = cursor.execute.call_args.args
        self.assertIn("WHERE", query)
        self.assertIn("manager.[BranchId]", query)
        self.assertIn("visit.[Location] = branch.[Name]", query)
        self.assertEqual(params, ["security-hosur"])
        self.assertEqual(result, [])

    def test_branch_manager_cannot_review_visit_from_another_branch(self):
        class Cursor:
            row = (0,)

            def execute(self, query, *params):
                self.query = query
                self.params = params

            def fetchone(self):
                return self.row

        cursor = Cursor()
        with self.assertRaises(HTTPException) as context:
            _require_visit_branch_access(
                cursor,
                "visit-1",
                {"sub": "manager-1", "role": "BRANCH_MANAGER"},
            )

        self.assertEqual(context.exception.status_code, 403)
        self.assertEqual(cursor.params, ("manager-1", "visit-1"))
        self.assertIn("target.[Location] = branch.[Name]", cursor.query)

        cursor.row = (1,)
        _require_visit_branch_access(
            cursor,
            "visit-1",
            {"sub": "manager-1", "role": "BRANCH_MANAGER"},
        )

    def test_card_issue_permission_includes_security_manager_and_admin_with_branch_scope(self):
        class Cursor:
            row = ("SECURITY", True, "Bengaluru Office", "Bengaluru", "Bengaluru Office", "CHECKED_IN", "visit-1")

            def execute(self, query, *params):
                self.query = query
                self.params = params

            def fetchone(self):
                return self.row

        cursor = Cursor()
        _require_card_issue_access(cursor, "visit-1", {"sub": "security-1"})
        self.assertEqual(cursor.params, ("visit-1", "security-1"))
        self.assertIn("actor.[BranchId]", cursor.query)

        cursor.row = ("SECURITY", True, "Bengaluru Office", "Bengaluru", "Hosur Office", "CHECKED_IN", "visit-1")
        with self.assertRaises(HTTPException) as context:
            _require_card_issue_access(cursor, "visit-1", {"sub": "security-1"})
        self.assertEqual(context.exception.status_code, 403)

        cursor.row = ("BRANCH_MANAGER", True, "Bengaluru Office", "Bengaluru", "Bengaluru Office", "CHECKED_IN", "visit-1")
        _require_card_issue_access(cursor, "visit-1", {"sub": "manager-1"})

        cursor.row = ("BRANCH_MANAGER", True, "Bengaluru Office", "Bengaluru", "Hosur Office", "CHECKED_IN", "visit-1")
        with self.assertRaises(HTTPException) as context:
            _require_card_issue_access(cursor, "visit-1", {"sub": "manager-1"})
        self.assertEqual(context.exception.status_code, 403)

        cursor.row = ("ADMIN", True, None, None, "Hosur Office", "CHECKED_IN", "visit-1")
        _require_card_issue_access(cursor, "visit-1", {"sub": "admin-1"})

    def test_card_issue_is_allowed_for_approved_or_checked_in_visit_but_not_pending(self):
        class Cursor:
            row = ("SECURITY", True, "Hosur Office", None, "Hosur Office", "PENDING", "visit-1")

            def execute(self, *_args):
                pass

            def fetchone(self):
                return self.row

        cursor = Cursor()
        with self.assertRaises(HTTPException) as context:
            _require_card_issue_access(cursor, "visit-1", {"sub": "security-1"})
        self.assertEqual(context.exception.status_code, 409)
        cursor.row = ("SECURITY", True, "Hosur Office", None, "Hosur Office", "APPROVED", "visit-1")
        _require_card_issue_access(cursor, "visit-1", {"sub": "security-1"})
        cursor.row = ("SECURITY", True, "Hosur Office", None, "Hosur Office", "CHECKED_IN", "visit-1")
        _require_card_issue_access(cursor, "visit-1", {"sub": "security-1"})

    def test_rpc_aliases_accept_frontend_argument_names(self):
        request = RpcRequest.model_validate({"_incident": "i-1", "_status": "SAFE"})
        self.assertEqual((request.incident, request.status), ("i-1", "SAFE"))

    def test_virtual_delete_requires_a_filter(self):
        class Cursor:
            pass

        with patch("app._read_virtual", return_value=[{"id": "1"}]):
            with self.assertRaises(HTTPException) as context:
                _virtual_query(Cursor(), "guest_cards", QueryRequest(action="delete"))
        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(context.exception.status_code, 400)
    def test_vms_notification_visibility_is_role_and_branch_scoped(self):
        notification = {
            "audience": ["ADMIN", "BRANCH_MANAGER", "SECURITY"],
            "branchId": "branch-1",
        }

        self.assertTrue(_vms_notification_visible(notification, "SECURITY", "branch-1"))
        self.assertFalse(_vms_notification_visible(notification, "SECURITY", "branch-2"))
        self.assertFalse(_vms_notification_visible(notification, "EMPLOYEE", "branch-1"))
        self.assertTrue(_vms_notification_visible(notification, "ADMIN", "branch-2"))
        self.assertFalse(_vms_notification_visible(notification, "SECURITY", None))
        self.assertFalse(
            _vms_notification_visible(
                {**notification, "branchId": None}, "SECURITY", "branch-1"
            )
        )

    def test_security_can_access_only_permits_for_assigned_branch(self):
        class BranchCursor:
            def __init__(self, branch_id):
                self.branch_id = branch_id

            def execute(self, *_args):
                return self

            def fetchone(self):
                return (self.branch_id,)

        row = {
            "Id": "permit-1",
            "Status": "APPROVED",
            "FormData": '{"branchId":"branch-1"}',
        }
        claims = {"sub": "security-1"}

        _authorized(BranchCursor("branch-1"), row, "SECURITY", claims)
        _authorized(BranchCursor(" BRANCH-1 "), row, "SECURITY", claims)
        with self.assertRaises(HTTPException) as context:
            _authorized(BranchCursor("branch-2"), row, "SECURITY", claims)
        self.assertEqual(context.exception.status_code, 403)

    def test_generic_security_permit_scope_is_limited_to_assigned_branch(self):
        scope, params = _scope_clause(
            "work_permits", {"role": "SECURITY", "sub": "security-1"}
        )

        self.assertIn("[Status] IN ('APPROVED','ACTIVE')", scope)
        self.assertIn("JSON_VALUE([FormData], '$.branchId')", scope)
        self.assertIn("[BranchId]", scope)
        self.assertEqual(params, ["security-1"])

    def test_next_day_extension_updates_the_existing_permit_schedule(self):
        permit = {
            "id": "permit-1",
            "permitNo": "CSWP-0001",
            "workDate": "2026-10-12",
            "timeFrom": "09:00",
            "timeTo": "17:00",
            "extensionRequest": {
                "workDate": "2026-10-13",
                "timeFrom": "11:44",
                "timeTo": "12:45",
                "justification": "Work needs additional time.",
            },
        }

        work_date, start, end, note, requires_gate_reverification = _apply_permit_extension(
            permit,
            permit["extensionRequest"],
            "HSE Reviewer",
            datetime.now().astimezone(),
        )

        self.assertEqual(permit["id"], "permit-1")
        self.assertEqual(permit["permitNo"], "CSWP-0001")
        self.assertEqual(work_date, date(2026, 10, 13))
        self.assertEqual((start, end), (time(11, 44), time(12, 45)))
        self.assertEqual(permit["workDate"], "2026-10-13")
        self.assertEqual(permit["durationMinutes"], 61)
        self.assertNotIn("extensionRequest", permit)
        self.assertEqual(permit["extensionHistory"][0]["approvedBy"], "HSE Reviewer")
        self.assertIn("existing permit", note)
        self.assertTrue(requires_gate_reverification)

    def test_same_day_extension_extends_original_end_time(self):
        permit = {
            "workDate": "2026-10-12",
            "timeFrom": "09:00",
            "timeTo": "17:00",
        }
        extension = {
            "workDate": "2026-10-12",
            "timeFrom": "17:00",
            "timeTo": "18:30",
            "justification": "Finish the planned work.",
        }

        work_date, start, end, _, requires_gate_reverification = _apply_permit_extension(
            permit, extension, "HSE Reviewer", datetime.now().astimezone()
        )

        self.assertEqual(work_date, date(2026, 10, 12))
        self.assertEqual((start, end), (time(9), time(18, 30)))
        self.assertEqual(permit["timeFrom"], "09:00")
        self.assertEqual(permit["timeTo"], "18:30")
        self.assertFalse(requires_gate_reverification)

    def test_vms_notification_read_state_is_per_user_and_does_not_expose_readers(self):
        notification = {
            "id": "notification-1",
            "readByUserIds": ["user-1"],
        }

        self.assertTrue(_vms_notification_payload(notification, "user-1")["read"])
        self.assertFalse(_vms_notification_payload(notification, "user-2")["read"])
        self.assertNotIn("readByUserIds", _vms_notification_payload(notification, "user-1"))

    def test_helpdesk_subcategories_are_seeded_for_existing_categories(self):
        class VirtualTableCursor:
            def __init__(self):
                self.rows = [
                    ('[]',),
                    (
                        '[{"id":"electrical-custom","name":"Electrical"},'
                        '{"id":"custom-category","name":"Custom"}]',
                    ),
                ]

            def execute(self, *_args):
                return self

            def fetchone(self):
                return self.rows.pop(0)

        rows = _read_virtual(VirtualTableCursor(), "hd_subcategories")

        electrical = [row for row in rows if row["category_id"] == "electrical-custom"]
        self.assertEqual(
            [row["name"] for row in electrical],
            ["Light Not Working", "Power Socket Issue", "Fan Not Working", "Wiring / Sparking"],
        )
        self.assertTrue(all(row["active"] for row in rows))
        self.assertNotIn("custom-category", [row["category_id"] for row in rows])

    def test_upload_path_rejects_traversal(self):
        with self.assertRaises(HTTPException) as context:
            _file_path("helpdesk-evidence", "../secret.txt")
        self.assertEqual(context.exception.status_code, 400)

    def test_password_hash_verification(self):
        stored = hash_password("a-long-test-password")
        self.assertTrue(verify_password("a-long-test-password", stored))
        self.assertFalse(verify_password("wrong-password", stored))


if __name__ == "__main__":
    unittest.main()
