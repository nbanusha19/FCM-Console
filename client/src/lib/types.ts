export type RoleKey =
  "ADMIN" | "BRANCH_MANAGER" | "SECURITY" | "EMPLOYEE" | "HSE" | "FIRE_WARDEN" | "SERVICE_PROVIDER";

export type VisitorTypeKey = "EMPLOYEE" | "EXTERNAL";

export type VisitStatus =
  "PENDING" | "APPROVED" | "CARD_ISSUED" | "REJECTED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED";

export type CardStatus = "AVAILABLE" | "ASSIGNED" | "RETURNED" | "LOST" | "DAMAGED";

export type Status = "ACTIVE" | "INACTIVE";

export interface RoleMaster {
  id: string;
  key: RoleKey;
  name: string;
  description: string;
  status: Status;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  managerId: string | null;
  status: Status;
}

export interface Employee {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  departmentId: string;
  designationId: string;
  branchId: string;
  role: RoleKey;
  status: Status;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  branchId: string | null;
  description: string;
  status: Status;
}

export interface Designation {
  id: string;
  code: string;
  name: string;
  departmentId: string | null;
  description: string;
  status: Status;
}

export interface VisitorTypeMaster {
  id: string;
  key: VisitorTypeKey;
  name: string;
  description: string;
  status: Status;
}

export interface VisitorCard {
  id: string;
  cardNumber: string;
  cardType: string;
  description: string;
  status: CardStatus;
  assignedVisitId: string | null;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: RoleKey;
  branchId: string | null;
  employeeId: string | null;
  phone?: string | undefined;
  status: Status;
}

export interface TimelineEvent {
  key: string;
  label: string;
  at: string;
  by?: string | undefined;
  note?: string | undefined;
}

export interface AccessEvent {
  id: string;
  visitId: string;
  action: "CHECK_IN" | "CHECK_OUT";
  source: "PORTAL" | "SECURITY";
  actorName: string;
  at: string | null;
}

export interface Visit {
  id: string;
  requestId: string;
  visitorId: string | null;
  visitorType: VisitorTypeKey;
  origin?: "PRE_REGISTERED" | "WALK_IN" | undefined;
  status: VisitStatus;

  name: string;
  employeeIdNo?: string | undefined;
  company?: string | undefined;
  sourceBranchId?: string | null | undefined;
  branchId: string; // destination branch
  departmentId: string;
  designation: string;
  email: string;
  phone: string;
  address?: string | undefined;

  purpose: string;
  visitDate: string; // yyyy-mm-dd
  expectedArrival: string; // HH:mm
  expectedDeparture: string; // HH:mm
  hostEmployeeId: string;
  hostDepartmentId: string;
  remarks?: string | undefined;

  requestedById: string;
  requestedAt: string;
  approvedById?: string | null | undefined;
  approvedAt?: string | null | undefined;
  rejectionReason?: string | null | undefined;
  rejectedAt?: string | null | undefined;
  cancelledAt?: string | null | undefined;

  emailSentAt?: string | null | undefined;
  whatsappSentAt?: string | null | undefined;
  checkInAt?: string | null | undefined;
  checkInBy?: string | null | undefined;
  checkOutAt?: string | null | undefined;
  checkOutBy?: string | null | undefined;
  cardNumber?: string | null | undefined;
  photoUrl?: string | null | undefined;

  timeline: TimelineEvent[];
  accessEvents?: AccessEvent[] | undefined;
  canCheckIn?: boolean | undefined;
  canCheckOut?: boolean | undefined;
  portalUrl?: string | null | undefined;
}

export type NotificationKind =
  | "REQUEST_CREATED"
  | "REQUEST_APPROVED"
  | "REQUEST_REJECTED"
  | "REQUEST_CANCELLED"
  | "CARD_ISSUED"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "ARRIVING_SOON"
  | "OVERDUE"
  | "EMAIL_SENT";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  refId?: string | undefined;
  audience: RoleKey[] | "ALL";
  branchId?: string | null | undefined;
}

export interface AuditLog {
  id: string;
  at: string;
  user: string;
  action: string;
  module: string;
  refId: string;
  description: string;
}

export interface EmailRecord {
  id: string;
  to: string;
  subject: string;
  visitId: string;
  sentAt: string;
}

export interface AppSettings {
  appName: string;
  defaultBranchId: string;
  timeZone: string;
  dateFormat: string;
  visitorIdPrefix: string;
  defaultVisitDurationMins: number;
  enableVisitorCard: boolean;
  requireApproval: boolean;
  notifyEmail: boolean;
  notifyApproval: boolean;
  notifyCheckIn: boolean;
  notifyCheckOut: boolean;
}
