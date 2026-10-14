export const VISITOR_TYPE_OPTIONS = [
  { code: "EMPLOYEE", label: "Internal Visitor" },
  { code: "EXTERNAL", label: "External Visitor" },
] as const;

export function isSelectableVisitorType(code: string) {
  return VISITOR_TYPE_OPTIONS.some((visitorType) => visitorType.code === code.trim());
}

export function visitorTypeLabel(code: string, label: string) {
  switch (code) {
    case "EMPLOYEE":
    case "OTHER_BRANCH":
      return "Internal Visitor";
    case "EXTERNAL":
    case "WALK_IN":
    case "VIP":
    case "NORMAL":
      return "External Visitor";
    default:
      return label;
  }
}
