# VMS1 backend

FastAPI API for the client application. It connects to the existing SQL Server
database `VMS1`; this service does not create or alter the database schema.

## Setup

1. Install Microsoft ODBC Driver 18 for SQL Server on the API host.
2. Create a virtual environment and install dependencies:

   ```powershell
   cd server
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

3. Copy `.env.example` to `.env` and set the SQL Server host, authentication
   credentials (or use Windows integrated authentication by leaving the SQL
   username and password empty), a random `JWT_SECRET` of at least 32 characters,
   the allowed client origins, the API's public URL, and `PUBLIC_APP_URL` (the
   externally reachable HTTPS URL of the client in production).
4. Bootstrap the first administrator once:

   ```powershell
   python bootstrap_admin.py
   ```

   The command refuses to run if an active administrator already exists and
   stores only a salted PBKDF2 password hash.
5. Start the API from the `server` directory:

   ```powershell
   py app.py
   ```

   Keep this terminal open while using the client. The launcher starts the
   FastAPI service on `http://127.0.0.1:8000` and reloads it when backend files
   change. The API, its configuration, database, and security modules are kept
   directly in the `server` directory.

Set `VITE_API_URL` in the client environment to the public API base URL, for
example `http://localhost:8000/api`.

## Existing schema expectations

The API uses the existing PascalCase objects in `dbo`, including `AppUsers`,
`Branches`, `Visits`, `VisitorAccessEvents`, `EvacuationIncidents`,
`EvacuationResponses`, `EvacSites`, `WorkPermits`, `WorkPermitWorkers`,
`WorkPermitAttendance`, `EwpNotifications`, `HelpdeskTickets`, `ModuleEvents`, `FileUploads`,
`OtpChallenges`, and `AppSettings`. Some frontend lookup collections are stored
as separate JSON entries in `AppSettings` so the reduced VMS1 schema remains
unchanged. Verify all physical columns against VMS1 before deploying.

The generic database adapter, admin/user/branch/auth routes, and authenticated
visit listing and status actions are implemented. Approved VMS visits send
email with an inline QR code through SMTP; configure `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASSWORD`, optional `SMTP_FROM_EMAIL`, the appropriate TLS option,
and `PUBLIC_APP_URL` on the API host. For STARTTLS (commonly port 587), set
`SMTP_USE_TLS=true` and `SMTP_USE_SSL=false`. For implicit TLS (commonly port
465), set `SMTP_USE_TLS=false` and `SMTP_USE_SSL=true`. SMTP authentication is
optional for trusted relays, but if used both username and password are
required. The sender address defaults to `SMTP_USER` unless `SMTP_FROM_EMAIL`
is configured. The QR opens a public visitor pass where the visitor can check in.
Evidence-file storage and the emergency response RPC operations are also
available. WhatsApp delivery, visitor-photo persistence, and public walk-in
registration are not configured.
Visitor QR check-in now requires device location within the configured branch
geofence and a one-time code sent to the visitor email on the request. Run
`migrations/20261013_add_vms_visitor_checkin_verification.sql` against VMS1
before deploying this change. Set each branch's map coordinates and allowed
radius in **Master data → Branches**; the default UI radius is 100 metres.
Visitor devices must open the pass over HTTPS (or localhost for development)
and grant browser location permission. The visitor OTP is email-only because
no SMS gateway is configured; add an approved SMS provider before enabling
mobile OTP delivery. Direct QR-only check-in is intentionally rejected, while
the existing visitor-pass lookup and check-out flow remain unchanged.
Pending visitor requests email approval links to active Branch Managers
assigned to the request location. Configure `API_PUBLIC_URL` as the externally
reachable API base URL ending in `/api` (HTTPS outside local development), and
ensure each relevant Branch Manager has an active account with an email
address. The links expire after 48 hours and require a confirmation submission;
rejecting a request requires a reason. Requests created by Admin are approved
immediately and continue to use the existing visitor-pass email.
The SQL mappings and role/record scopes must be verified against the actual
VMS1 schema and exercised with the live database before production deployment;
the backend has not been tested with your server credentials.

### Helpdesk ticket creation notifications

Branch Managers can raise Helpdesk tickets and track their own tickets and
activity. When any eligible user raises a ticket, the API creates a Helpdesk
in-app notification for every active `SERVICE_PROVIDER` and `ADMIN` account,
excluding the ticket raiser. The raiser receives notifications when work starts,
the service is resolved, and the ticket is closed. Other users, including
Branch Managers who did not raise the ticket, are not notified. The API emails
active service-provider accounts that have a configured email address,
excluding the ticket raiser. The email includes ticket number, category,
service, location, priority, description, and a ticket link when
`PUBLIC_APP_URL` is configured. Delivery failures are logged and reported
without undoing ticket creation. SMTP must be configured as described above.

### E-Work Permit contractor verification

Run `migrations/20261013_add_ewp_notifications.sql` against VMS1 before
deploying E-Work Permit notifications. The dedicated `EwpNotifications` table
stores only permit-module alerts, scoped to each recipient account; the E-Work
Permit notification toggle does not read VMS, Helpdesk, or Emergency feeds.
Permit submissions, HSE decisions, gate outcomes, and closure/extension
decisions create in-app alerts and send individual emails to the relevant
requester, HSE/Admin reviewers, or branch Security users. Contractor approval
and OTP emails remain on their existing dedicated flows. Configure SMTP as
described above. Failed notification email delivery is logged by the API; the
in-app alert remains available.

Before deploying contractor email OTP verification, run
`migrations/20261012_add_ewp_contractor_otp.sql` against VMS1. The API stores
only a keyed hash of each short-lived code, limits verification attempts, and
requires verification for permit submission. SMTP must be configured on the
API host using the settings described above; the code is sent to the contractor
email address on the permit.

When HSE approves a permit, the contractor approval email includes the QR code
and an attached `<permit-number>_precaution_pack.pdf` with the approved work
window, location, contractor/supervisor, QR, safety precautions, selected
checklist/PPE, and applicable extended/night-work notes. HSE's **Resend QR
email** action sends the same PDF and QR again. Configure SMTP as described
above. Optional site-specific critical contacts can be supplied to the API
using `EWP_CRITICAL_CONTACTS`, as semicolon-separated entries in
`Label|Phone|Email` format, for example
`HSE control room|100|hse@example.com;Security gate|101|security@example.com`.
If no contacts are configured, the PDF directs the contractor to the emergency
contacts posted at the work site rather than using unverified numbers.

For gate check-in, run
`migrations/20261013_add_ewp_gate_otp.sql` against VMS1. Security scans the
approved permit QR, which sends a six-digit code and a secure verification link
to the contractor email saved on that permit. The contractor opens the link on
their phone and verifies the code; Security sees the confirmed status and then
uses the existing contractor ID, consent, grant, or reject actions. Granting
entry requires a verified, unexpired, unused code; codes expire after 10
minutes, are single-use, and allow at most five verification attempts. Resending
is limited to once per minute. SMTP, `PUBLIC_APP_URL`, and a JWT signing secret
of at least 32 characters must be configured on the API host.

Run `migrations/20261012_filter_unique_ewp_vendor_token.sql` against VMS1. It
changes the `PermitNo` and `VendorTokenHash` uniqueness rules to apply only
when those optional values are populated. This allows multiple draft permits
without a permit number or vendor token, while still preventing duplicate
assigned permit numbers and vendor-token hashes.

### Internal VMS visitors

Before using the guest-card issuance action, run
`migrations/20261010_allow_card_issued_visit_status.sql` against VMS1. The
`CK_Visits_Status` constraint must allow `CARD_ISSUED`; without it, SQL Server
rejects issuance and leaves the visit Approved.

Before deploying the internal cross-branch visitor selector, run
`migrations/20261010_add_internal_visitor_fields.sql` against VMS1. This
additive migration stores the selected employee and source branch on each visit;
existing visit rows remain unchanged. The API validates the selected active
employee and rejects internal visits to that employee's own branch.
