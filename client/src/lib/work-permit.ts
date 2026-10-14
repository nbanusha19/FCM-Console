export type WorkPermitStatus =
  | "DRAFT"
  | "PENDING_HSE"
  | "SENT_BACK"
  | "REJECTED"
  | "APPROVED"
  | "ACTIVE"
  | "CLOSURE_REQUESTED"
  | "EXTENSION_REQUESTED"
  | "CLOSED";

export type PermitTypeKey =
  "HOT_WORK" | "HEIGHT" | "ELECTRICAL" | "CONFINED" | "EXCAVATION" | "COLD";

export interface CatalogItem {
  key: string;
  name: string;
  prefix?: string;
  color?: string;
  permitTypes?: string[];
  label?: string;
  allowNa?: boolean;
  rights?: string;
  role?: string;
}

export interface WorkPermitCatalog {
  permitTypes: CatalogItem[];
  specializedTypes: CatalogItem[];
  natures: CatalogItem[];
  buildings: CatalogItem[];
  floors: CatalogItem[];
  wings: CatalogItem[];
  areas: CatalogItem[];
  workDescriptions: CatalogItem[];
  jsaRefs: CatalogItem[];
  contractors: CatalogItem[];
  ppe: CatalogItem[];
  roomWorkstationHint?: string;
  rejectionReasons: CatalogItem[];
  nightWorkItems: CatalogItem[];
  checklists: Record<string, string[]>;
  hseBlocks: CatalogItem[];
  roleMatrix: CatalogItem[];
}

export interface WorkPermitEvent {
  id: string;
  permitId: string;
  action: string;
  actorName: string;
  actorUserId?: string | null;
  detail: string;
  at: string | null;
}

export interface WorkPermit {
  id: string;
  permitNo: string | null;
  status: WorkPermitStatus;
  permitType: PermitTypeKey | string;
  specializedType: string;
  nature: string;
  natureOther: string;
  branchId: string;
  building: string;
  floor: string;
  wing: string;
  area: string;
  workDescription: string;
  jsaRef: string;
  workmenCount: number;
  contractor: string;
  contractorEmail?: string;
  roomAssetNo?: string;
  descriptionOfWork?: string;
  supervisorName: string;
  supervisorMobile: string;
  workDate: string;
  timeFrom: string;
  timeTo: string;
  durationMinutes: number;
  overNineHours: { justification?: string; hrAligned?: boolean; managementNote?: boolean };
  nightWork: { answers?: Record<string, "Y" | "N" | "NA"> };
  checklist: { item: string; answer: "Y" | "N" | "NA" | "" }[];
  ppe: { items: string[]; special: string };
  attachments: { name: string; kind: "photo" | "file"; dataUrl?: string }[];
  signatures: {
    contractor?: { signed?: boolean; method?: string; at?: string; by?: string };
    execution?: { signed?: boolean; method?: string; at?: string; by?: string };
  };
  fireWatch: { nominee?: string; validTill?: string; checks?: Record<string, boolean> };
  fallHeightMeters?: number;
  workingAtHeightChecklist?: { item: string; answer: "Y" | "N" | "NA" | "" }[];
  atmosphericTest?: {
    oxygen?: string | number;
    flammableGas?: string | number;
    dust?: string | number;
  };
  attendantName?: string;
  excavationDimensions?: {
    length?: string | number;
    width?: string | number;
    depth?: string | number;
  };
  utilityClearance?: { fire?: string; technical?: string };
  hseValidation: Record<string, { verdict?: string; note?: string }>;
  ownerEvaluation: {
    scores?: Record<string, number | string>;
    feedback?: string;
  };
  hseEvaluation: {
    inspection?: Record<string, string>;
    remarks?: string;
    scores?: Record<string, number | string>;
  };
  gates: Record<string, string>;
  raisedById: string;
  raisedByName: string;
  approvedById?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  rejectedByName?: string | null;
  rejectionReason?: string | null;
  sendBackNote?: string | null;
  successorId?: string | null;
  predecessorId?: string | null;
  extensionRequest?: {
    workDate?: string;
    timeFrom?: string;
    timeTo?: string;
    justification?: string;
  };
  extensionHistory?: Array<{
    previousWorkDate: string;
    previousTimeFrom: string;
    previousTimeTo: string;
    workDate: string;
    timeFrom: string;
    timeTo: string;
    justification: string;
    approvedBy: string;
    approvedAt: string;
  }>;
  entryGrantedAt?: string | null;
  entryGrantedBy?: string | null;
  contractorIdCard?: string | null;
  consentCaptured: boolean;
  events: WorkPermitEvent[];
  expiringSoon: boolean;
  qrWindow: { valid?: boolean; label?: string; now?: string; start?: string; end?: string };
  qrToken?: string;
  qrValue?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export const PERMIT_STATUS_LABEL: Record<WorkPermitStatus, string> = {
  DRAFT: "Draft",
  PENDING_HSE: "Pending HSE",
  SENT_BACK: "Sent back",
  REJECTED: "Rejected",
  APPROVED: "Approved",
  ACTIVE: "Active",
  CLOSURE_REQUESTED: "Closure requested",
  EXTENSION_REQUESTED: "Extension requested",
  CLOSED: "Closed",
};

export const OPEN_PERMIT_STATUSES: WorkPermitStatus[] = [
  "DRAFT",
  "PENDING_HSE",
  "SENT_BACK",
  "APPROVED",
  "ACTIVE",
  "CLOSURE_REQUESTED",
  "EXTENSION_REQUESTED",
];

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${String(m).padStart(2, "0")} m`;
}

export function locationLine(permit: Pick<WorkPermit, "building" | "floor" | "wing" | "area">) {
  return (
    [permit.building, permit.floor, permit.wing, permit.area].filter(Boolean).join(" · ") || "—"
  );
}

export function catalogName(items: CatalogItem[] | undefined, key?: string | null) {
  if (!key) return "—";
  return items?.find((item) => item.key === key)?.name ?? key;
}
