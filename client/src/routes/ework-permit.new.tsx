import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/context/app-context";
import { listBranches } from "@/services/branches";
import { listVendors } from "@/services/permits";
import {
  getWorkPermitCatalog,
  getWorkPermit,
  listWorkPermits,
  closeWorkPermit,
  sendContractorOtp,
  saveWorkPermit,
  submitWorkPermit,
  verifyContractorOtp,
} from "@/services/work-permits-api";
import type { WorkPermit, WorkPermitCatalog } from "@/lib/work-permit";

interface PermitDraft extends Partial<WorkPermit> {
  [key: string]: unknown;
}

const TYPES = [
  ["HOT_WORK", "Hot work"],
  ["HEIGHT", "Work at height"],
  ["ELECTRICAL", "Electrical"],
  ["CONFINED", "Confined space"],
  ["EXCAVATION", "Excavation"],
  ["COLD", "Cold work"],
] as const;

const STEPS = ["Classification", "Schedule", "Checklist & PPE", "Review"] as const;
const NATURES = [
  ["PREVENTIVE", "Regular preventive maintenance"],
  ["BREAKDOWN", "Breakdown / failure rectification"],
  ["EMERGENCY", "Emergency work"],
  ["RENOVATION", "Renovation / modification"],
  ["PROJECT", "New project / installation"],
  ["OTHER", "Others — specify"],
] as const;

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function displayValue(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export const Route = createFileRoute("/ework-permit/new")({
  component: NewPermit,
});

function NewPermit() {
  const { user } = useApp();
  const allowed =
    user?.role === "ADMIN" || user?.role === "EMPLOYEE" || user?.role === "BRANCH_MANAGER";
  const queryClient = useQueryClient();
  const {
    data: catalog,
    error: catalogError,
    isLoading: catalogLoading,
  } = useQuery({
    queryKey: ["ewp-work-permit-catalog"],
    queryFn: getWorkPermitCatalog,
    enabled: allowed,
  });
  const { data: branches = [], error: branchError } = useQuery({
    queryKey: ["ewp-permit-branches"],
    queryFn: () => listBranches(false),
    enabled: allowed,
  });
  const selectableBranches =
    user?.role === "ADMIN" ? branches : branches.filter((branch) => branch.id === user?.branchId);
  const { data: vendors = [], error: vendorError } = useQuery({
    queryKey: ["ewp-permit-contractors"],
    queryFn: () => listVendors(),
    enabled: allowed,
  });
  const { data: permits = [], error: permitsError } = useQuery({
    queryKey: ["ewp-work-permits"],
    queryFn: listWorkPermits,
    enabled: allowed,
  });
  const [form, setForm] = useState<PermitDraft>({
    permitType: "HOT_WORK",
    branchId: user?.branchId ?? "",
    specializedType: "WELDING",
    nature: "",
    natureOther: "",
    building: "",
    floor: "",
    wing: "",
    area: "",
    roomAssetNo: "",
    descriptionOfWork: "",
    workDescription: "",
    jsaRef: "",
    workmenCount: 1,
    contractor: "",
    contractorEmail: "",
    supervisorName: "",
    supervisorMobile: "",
    workDate: new Date().toLocaleDateString("en-CA"),
    timeFrom: "09:00",
    timeTo: "17:00",
    overNineHours: { justification: "" },
    nightWork: { answers: {} },
    checklist: [],
    signatures: { contractor: { signed: false }, execution: { signed: false } },
    fireWatch: {},
    ppe: { items: [], special: "" },
  });
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState<WorkPermit | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [otpChallengeId, setOtpChallengeId] = useState<string | null>(null);
  const [editingOpenPermit, setEditingOpenPermit] = useState(false);
  const [contractorOtp, setContractorOtp] = useState("");
  const [contractorOtpSent, setContractorOtpSent] = useState(false);
  const [contractorOtpVerified, setContractorOtpVerified] = useState(false);
  const [contractorOtpBusy, setContractorOtpBusy] = useState(false);
  const setField = (key: string, value: unknown) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const permitType = String(form["permitType"] ?? "HOT_WORK");
  const openPermit = permits.find(
    (permit) => !["CLOSED", "REJECTED"].includes(permit.status) && permit.raisedById === user?.id,
  );
  const typedCatalog = catalog as WorkPermitCatalog | undefined;
  const checklistItems = typedCatalog?.checklists?.[permitType] ?? [];
  const checklist = Array.isArray(form["checklist"]) ? form["checklist"] : [];
  const timeFrom = String(form["timeFrom"] ?? "");
  const timeTo = String(form["timeTo"] ?? "");
  const scheduleDuration = timeMinutes(timeTo) - timeMinutes(timeFrom);
  const hasScheduleDuration =
    /^\d{2}:\d{2}$/.test(timeFrom) && /^\d{2}:\d{2}$/.test(timeTo) && scheduleDuration > 0;
  const exceedsNineHours = hasScheduleDuration && scheduleDuration > 540;
  const specializedOptions =
    typedCatalog?.specializedTypes.filter(
      (item) => !item.permitTypes?.length || item.permitTypes.includes(permitType),
    ) ?? [];
  const workDescriptionOptions =
    typedCatalog?.workDescriptions.filter(
      (item) => !item.permitTypes?.length || item.permitTypes.includes(permitType),
    ) ?? [];

  const setNested = (key: string, field: string, value: unknown) => {
    setForm((previous) => ({
      ...previous,
      [key]: { ...objectValue(previous[key]), [field]: value },
    }));
  };

  const updateContractorEmail = (email: string) => {
    setForm((previous) => ({
      ...previous,
      contractorEmail: email,
      signatures: {
        ...objectValue(previous["signatures"]),
        contractor: { signed: false },
      },
    }));
    setContractorOtp("");
    setContractorOtpSent(false);
    setContractorOtpVerified(false);
  };

  const requestContractorOtp = async () => {
    if (contractorOtpBusy || saving) return;
    setContractorOtpBusy(true);
    try {
      const challengeId = draftId ?? otpChallengeId ?? crypto.randomUUID();
      const result = await sendContractorOtp(
        challengeId,
        String(form["contractorEmail"] ?? "").trim(),
      );
      if (!draftId) setOtpChallengeId(challengeId);
      setContractorOtp("");
      setContractorOtpSent(true);
      setContractorOtpVerified(false);
      toast.success(`Contractor OTP sent to ${result.destination}. It expires in 10 minutes.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send contractor OTP.");
    } finally {
      setContractorOtpBusy(false);
    }
  };

  const verifyContractorSignature = async () => {
    const challengeId = draftId ?? otpChallengeId;
    if (!challengeId || contractorOtpBusy || saving) return;
    setContractorOtpBusy(true);
    try {
      const result = await verifyContractorOtp(
        challengeId,
        contractorOtp.trim(),
        String(form["contractorEmail"] ?? "").trim(),
      );
      setContractorOtpVerified(true);
      setNested("signatures", "contractor", {
        signed: true,
        method: "OTP",
        at: result.verifiedAt,
        by: String(form["supervisorName"] || "Contractor representative"),
      });
      toast.success("Contractor verified by email OTP.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to verify contractor OTP.");
    } finally {
      setContractorOtpBusy(false);
    }
  };

  const setChecklistAnswer = (item: string, answer: string) => {
    setForm((previous) => {
      const current = Array.isArray(previous["checklist"])
        ? (previous["checklist"] as { item: string; answer: string }[])
        : [];
      return {
        ...previous,
        checklist: checklistItems.map((checklistItem) => {
          const existing = current.find((row) => row.item === checklistItem);
          return {
            item: checklistItem,
            answer: checklistItem === item ? answer : (existing?.answer ?? ""),
          };
        }),
      };
    });
  };

  const saveDraft = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const saved = await saveWorkPermit({
        ...form,
        ...((draftId ?? otpChallengeId) ? { id: draftId ?? otpChallengeId } : {}),
      });
      setDraftId(saved.id);
      setOtpChallengeId(null);
      setEditingOpenPermit(true);
      toast.success("Draft saved.");
      await queryClient.invalidateQueries({ queryKey: ["ewp-work-permits"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save the permit draft.");
    } finally {
      setSaving(false);
    }
  };

  const validateStep = () => {
    const required = (keys: string[]) => keys.filter((key) => !String(form[key] ?? "").trim());
    if (step === 0) {
      const missing = required([
        "specializedType",
        "building",
        "floor",
        "wing",
        "area",
        "branchId",
        "descriptionOfWork",
        "jsaRef",
        "contractor",
        "contractorEmail",
        "supervisorMobile",
        "supervisorName",
      ]);
      if (
        !form["nature"] ||
        (form["nature"] === "OTHER" && !String(form["natureOther"] ?? "").trim())
      ) {
        missing.push("nature");
      }
      if (!Number(form["workmenCount"]) || Number(form["workmenCount"]) < 1) {
        missing.push("workmenCount");
      }
      if (missing.length) {
        toast.error(
          "Complete the required permit classification and contractor fields before continuing.",
        );
        return false;
      }
    }
    if (step === 1) {
      if (
        !form["workDate"] ||
        !form["timeFrom"] ||
        !form["timeTo"] ||
        String(form["timeTo"]) <= String(form["timeFrom"])
      ) {
        toast.error("Select a work date and a valid start and end time.");
        return false;
      }
      const duration = timeMinutes(String(form["timeTo"])) - timeMinutes(String(form["timeFrom"]));
      if (
        duration > 540 &&
        !String(objectValue(form["overNineHours"])["justification"] ?? "").trim()
      ) {
        toast.error("Add a justification for a work window longer than nine hours.");
        return false;
      }
      const nightWorkAnswers = objectValue(objectValue(form["nightWork"])["answers"]);
      if (
        timeMinutes(String(form["timeTo"])) > 19 * 60 &&
        typedCatalog?.nightWorkItems.some(
          (item) =>
            !["Y", "N", ...(item.allowNa ? ["NA"] : [])].includes(
              String(nightWorkAnswers[item.key] ?? ""),
            ),
        )
      ) {
        toast.error("Complete every night work safety check.");
        return false;
      }
    }
    if (step === 2) {
      if (!checklist.length || checklist.some((item) => !item.answer)) {
        toast.error("Complete every required safety checklist item.");
        return false;
      }
      if (!stringArray(objectValue(form["ppe"])["items"]).length) {
        toast.error("Select at least one required PPE item.");
        return false;
      }
      if (
        objectValue(form["signatures"])["contractor"] === undefined ||
        !contractorOtpVerified ||
        !objectValue(objectValue(form["signatures"])["execution"])["signed"]
      ) {
        toast.error("Verify the contractor by email OTP and confirm the execution signature.");
        return false;
      }
      if (
        permitType === "HOT_WORK" &&
        (!String(objectValue(form["fireWatch"])["nominee"] ?? "").trim() ||
          !String(objectValue(form["fireWatch"])["validTill"] ?? "").trim())
      ) {
        toast.error("Add the Fire Watch nominee and valid-until time.");
        return false;
      }
      if (
        permitType === "HEIGHT" &&
        (Number(form["fallHeightMeters"]) < 2.5 ||
          !Array.isArray(form["workingAtHeightChecklist"]) ||
          form["workingAtHeightChecklist"].length < 2 ||
          form["workingAtHeightChecklist"].some((item) => !item.answer))
      ) {
        toast.error("Complete the fall-height details and supplemental checklist.");
        return false;
      }
      if (
        permitType === "CONFINED" &&
        (!String(objectValue(form["atmosphericTest"])["oxygen"] ?? "").trim() ||
          !String(objectValue(form["atmosphericTest"])["flammableGas"] ?? "").trim() ||
          !String(objectValue(form["atmosphericTest"])["dust"] ?? "").trim() ||
          !String(form["attendantName"] ?? "").trim())
      ) {
        toast.error("Complete the confined-space atmosphere readings and attendant.");
        return false;
      }
      if (
        permitType === "EXCAVATION" &&
        (["length", "width", "depth"].some(
          (key) => !String(objectValue(form["excavationDimensions"])[key] ?? "").trim(),
        ) ||
          !String(objectValue(form["utilityClearance"])["fire"] ?? "").trim() ||
          !String(objectValue(form["utilityClearance"])["technical"] ?? "").trim())
      ) {
        toast.error("Complete excavation dimensions and both utility clearances.");
        return false;
      }
    }
    return true;
  };

  const continueStep = () => {
    if (!validateStep()) return;
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const submitPermit = async () => {
    if (!validateStep() || !user || saving) return;
    setSaving(true);
    try {
      const saved = await saveWorkPermit({
        ...form,
        ...((draftId ?? otpChallengeId) ? { id: draftId ?? otpChallengeId } : {}),
      });
      setDraftId(saved.id);
      setOtpChallengeId(null);
      const result = await submitWorkPermit(saved.id);
      setSubmitted(result);
      await queryClient.invalidateQueries({ queryKey: ["ewp-work-permits"] });
      await queryClient.invalidateQueries({ queryKey: ["permits"] });
      toast.success("Permit submitted to HSE for review.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit the permit.");
    } finally {
      setSaving(false);
    }
  };

  const closeOpenPermit = async () => {
    if (!openPermit || saving) return;
    setSaving(true);
    try {
      await closeWorkPermit(openPermit.id, { action: "CANCEL_OPEN_PERMIT" });
      await queryClient.invalidateQueries({ queryKey: ["ewp-work-permits"] });
      toast.success("Existing permit closed. You can now create a new permit.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to close the existing permit.");
    } finally {
      setSaving(false);
    }
  };

  const editOpenDraft = async () => {
    if (!openPermit || saving) return;
    setSaving(true);
    try {
      const permit = await getWorkPermit(openPermit.id);
      setForm({ ...permit });
      setDraftId(permit.id);
      setOtpChallengeId(null);
      const contractorSignature = objectValue(objectValue(permit.signatures).contractor);
      setContractorOtpVerified(
        contractorSignature.signed === true && contractorSignature.method === "OTP",
      );
      setContractorOtpSent(false);
      setContractorOtp("");
      setStep(0);
      setEditingOpenPermit(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open the permit draft.");
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) {
    return (
      <p className="text-muted-foreground">
        You don&apos;t have permission to raise a work permit.
      </p>
    );
  }

  if (submitted) {
    return (
      <section className="surface-card mx-auto max-w-xl space-y-4 p-6 text-center">
        <h2 className="font-display text-xl font-bold">Permit submitted</h2>
        <p>{submitted.permitNo || submitted.id}</p>
        <StatusPill status={submitted.status} />
        <div>
          <Button asChild>
            <Link to="/ework-permit/$id" params={{ id: submitted.id }}>
              View permit
            </Link>
          </Button>
        </div>
      </section>
    );
  }

  if (openPermit && !editingOpenPermit) {
    const canCloseBeforeEntry = ["DRAFT", "PENDING_HSE", "SENT_BACK", "APPROVED"].includes(
      openPermit.status,
    );
    return (
      <section className="surface-card space-y-3 p-5">
        <h2 className="font-display text-base font-bold">Open permit already exists</h2>
        <p className="text-sm text-muted-foreground">
          You can have only one open permit at a time. {openPermit.permitNo || openPermit.id} is{" "}
          {openPermit.status.replaceAll("_", " ").toLowerCase()}.
        </p>
        <div className="flex flex-wrap gap-2">
          {["DRAFT", "SENT_BACK"].includes(openPermit.status) ? (
            <Button disabled={saving} onClick={() => void editOpenDraft()}>
              {saving ? "Opening…" : "Edit draft"}
            </Button>
          ) : null}
          <Button asChild>
            <Link to="/ework-permit/$id" params={{ id: openPermit.id }}>
              Open {openPermit.permitNo || openPermit.id}
            </Link>
          </Button>
          {canCloseBeforeEntry ? (
            <Button variant="outline" disabled={saving} onClick={() => void closeOpenPermit()}>
              {saving ? "Closing…" : "Close this permit"}
            </Button>
          ) : null}
        </div>
        {openPermit.status === "ACTIVE" ? (
          <p className="text-xs text-muted-foreground">
            Use the permit details page to request closure or extend the active permit.
          </p>
        ) : null}
        {permitsError ? (
          <p role="alert" className="text-sm text-danger">
            {permitsError.message}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="FCM E-WORK PERMIT"
        title="New permit"
        subtitle="Dropdowns replace free text. Type selection loads the matching checklist."
      />
      {[catalogError, branchError, vendorError, permitsError]
        .filter(Boolean)
        .map((error, index) => (
          <p key={index} role="alert" className="text-sm text-danger">
            {error?.message}
          </p>
        ))}
      {catalogLoading ? (
        <p className="text-sm text-muted-foreground">
          Loading permit classifications and safety checklists…
        </p>
      ) : null}

      <nav aria-label="Permit form steps" className="grid grid-cols-4 gap-2">
        {STEPS.map((title, index) => {
          const active = index === step;
          const complete = index < step;
          return (
            <button
              key={title}
              type="button"
              disabled={index > step}
              onClick={() => setStep(index)}
              className={`flex min-w-0 items-center gap-2 rounded-lg border px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide transition-colors sm:px-3 sm:text-xs ${
                active
                  ? "border-primary bg-primary-soft text-primary"
                  : complete
                    ? "border-success/30 bg-success-soft text-success"
                    : "border-border bg-background text-muted-foreground"
              }`}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full border border-current text-[10px]">
                {complete ? <Check className="size-3" /> : index + 1}
              </span>
              <span className="truncate">{title}</span>
            </button>
          );
        })}
      </nav>

      <form
        className="surface-card space-y-5 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (step < STEPS.length - 1) continueStep();
          else void submitPermit();
        }}
      >
        {step === 0 ? (
          <section className="space-y-4">
            <Field label="Work permit type">
              <NativeSelect
                value={permitType}
                onChange={(value) => {
                  const nextSpecialized =
                    typedCatalog?.specializedTypes.find((item) => item.permitTypes?.includes(value))
                      ?.key ?? "";
                  const items = typedCatalog?.checklists?.[value] ?? [];
                  setForm((previous) => ({
                    ...previous,
                    permitType: value,
                    specializedType: nextSpecialized,
                    checklist: items.map((item) => ({ item, answer: "" })),
                    descriptionOfWork: "",
                    workDescription: "",
                    ...(value !== "HOT_WORK" ? { fireWatch: {} } : {}),
                  }));
                }}
                options={TYPES.map(([value, label]) => ({ value, label }))}
              />
            </Field>

            <Field label="Specialized work type">
              <NativeSelect
                value={String(form["specializedType"] ?? "")}
                onChange={(value) => setField("specializedType", value)}
                placeholder="Select specialized work type"
                options={specializedOptions.map((item) => ({ value: item.key, label: item.name }))}
              />
            </Field>

            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-foreground">Nature of activity</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {NATURES.map(([value, label]) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="nature"
                      value={value}
                      checked={form["nature"] === value}
                      onChange={() => setField("nature", value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {form["nature"] === "OTHER" ? (
                <Input
                  aria-label="Specify other activity"
                  value={String(form["natureOther"] ?? "")}
                  onChange={(event) => setField("natureOther", event.target.value)}
                  placeholder="Specify nature of activity"
                />
              ) : null}
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Building">
                <NativeSelect
                  value={String(form["building"] ?? "")}
                  onChange={(value) => setField("building", value)}
                  options={
                    typedCatalog?.buildings.map((item) => ({
                      value: item.key,
                      label: item.name,
                    })) ?? []
                  }
                />
              </Field>
              <Field label="Floor">
                <NativeSelect
                  value={String(form["floor"] ?? "")}
                  onChange={(value) => setField("floor", value)}
                  options={
                    typedCatalog?.floors.map((item) => ({ value: item.key, label: item.name })) ??
                    []
                  }
                />
              </Field>
              <Field label="Wing / block">
                <NativeSelect
                  value={String(form["wing"] ?? "")}
                  onChange={(value) => setField("wing", value)}
                  options={
                    typedCatalog?.wings.map((item) => ({ value: item.key, label: item.name })) ?? []
                  }
                />
              </Field>
              <Field label="Specific area">
                <NativeSelect
                  value={String(form["area"] ?? "")}
                  onChange={(value) => setField("area", value)}
                  options={
                    typedCatalog?.areas.map((item) => ({ value: item.key, label: item.name })) ?? []
                  }
                />
              </Field>
            </div>

            <Field label="Room / workstation / asset no.">
              <Input
                value={String(form["roomAssetNo"] ?? "")}
                onChange={(event) => setField("roomAssetNo", event.target.value)}
                placeholder={
                  typedCatalog?.roomWorkstationHint ?? "Enter room, workstation or asset number"
                }
              />
            </Field>

            <Field label="Branch">
              <NativeSelect
                value={
                  user?.role === "ADMIN" ? String(form["branchId"] ?? "") : (user?.branchId ?? "")
                }
                onChange={(value) => {
                  if (user?.role === "ADMIN") setField("branchId", value);
                }}
                placeholder={user?.branchId ? "Your assigned branch" : "No branch assigned"}
                disabled={user?.role !== "ADMIN"}
                options={selectableBranches.map((branch) => ({
                  value: branch.id,
                  label: branch.name,
                }))}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Description of work">
                <NativeSelect
                  value={String(form["descriptionOfWork"] ?? "")}
                  onChange={(value) => {
                    setField("descriptionOfWork", value);
                    setField("workDescription", value === "OTHER" ? "" : value);
                  }}
                  placeholder="Select work description"
                  options={workDescriptionOptions.map((item) => ({
                    value: item.name,
                    label: item.name,
                  }))}
                />
              </Field>
              <Field label="JSA / SWMS ref">
                <NativeSelect
                  value={String(form["jsaRef"] ?? "")}
                  onChange={(value) => setField("jsaRef", value)}
                  placeholder="Select JSA / SWMS"
                  options={
                    typedCatalog?.jsaRefs.map((item) => ({ value: item.name, label: item.name })) ??
                    []
                  }
                />
              </Field>
              <Field label="No. of workmen">
                <Input
                  type="number"
                  min={1}
                  value={String(form["workmenCount"] ?? 1)}
                  onChange={(event) => setField("workmenCount", Number(event.target.value))}
                />
              </Field>
              <Field label="Contractor">
                <NativeSelect
                  value={String(form["contractor"] ?? "")}
                  onChange={(value) => {
                    const contractor = vendors.find((vendor) => vendor.name === value);
                    setField("contractor", value);
                    updateContractorEmail(contractor?.email ?? "");
                  }}
                  placeholder="Select contractor"
                  options={vendors.map((vendor) => ({ value: vendor.name, label: vendor.name }))}
                />
              </Field>
              <Field label="Vendor email (permit pack)">
                <Input
                  type="email"
                  value={String(form["contractorEmail"] ?? "")}
                  onChange={(event) => updateContractorEmail(event.target.value)}
                  placeholder="vendor@company.com"
                />
              </Field>
              <Field label="Supervisor mobile">
                <Input
                  type="tel"
                  value={String(form["supervisorMobile"] ?? "")}
                  onChange={(event) => setField("supervisorMobile", event.target.value)}
                  placeholder="+91"
                />
              </Field>
            </div>

            <Field label="Supervisor name">
              <Input
                value={String(form["supervisorName"] ?? "")}
                onChange={(event) => setField("supervisorName", event.target.value)}
              />
            </Field>

            {String(form["descriptionOfWork"] ?? "")
              .toLowerCase()
              .includes("other") ? (
              <Field label="Specify work description">
                <Textarea
                  value={String(form["workDescription"] ?? "")}
                  onChange={(event) => setField("workDescription", event.target.value)}
                  rows={2}
                />
              </Field>
            ) : null}
          </section>
        ) : null}

        {step === 1 ? (
          <section className="space-y-4">
            <h2 className="font-display text-sm font-bold">Work schedule</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Work date">
                <Input
                  type="date"
                  min={new Date().toLocaleDateString("en-CA")}
                  value={String(form["workDate"] ?? "")}
                  onChange={(event) => setField("workDate", event.target.value)}
                />
              </Field>
              <div className="hidden sm:block" />
              <Field label="Time from">
                <Input
                  type="time"
                  value={String(form["timeFrom"] ?? "")}
                  onChange={(event) => setField("timeFrom", event.target.value)}
                />
              </Field>
              <Field label="Time to">
                <Input
                  type="time"
                  value={String(form["timeTo"] ?? "")}
                  onChange={(event) => setField("timeTo", event.target.value)}
                />
              </Field>
            </div>
            {hasScheduleDuration ? (
              <div className="text-xs">
                <span className="font-medium text-muted-foreground">Calculated duration </span>
                <span className="font-semibold">
                  {Math.floor(scheduleDuration / 60)} h{" "}
                  {String(scheduleDuration % 60).padStart(2, "0")} m
                </span>
                {exceedsNineHours ? (
                  <span className="ml-2 font-semibold text-warning">
                    Triggered &gt; 9 h — justification required
                  </span>
                ) : null}
              </div>
            ) : null}
            {exceedsNineHours ? (
              <div className="space-y-3 rounded-xl border border-warning/40 bg-warning-soft/30 p-4">
                <Field label="Why does this activity need more than 9 hours?">
                  <Textarea
                    value={String(objectValue(form["overNineHours"])["justification"] ?? "")}
                    onChange={(event) =>
                      setNested("overNineHours", "justification", event.target.value)
                    }
                    rows={3}
                  />
                </Field>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={Boolean(objectValue(form["overNineHours"])["hrAligned"])}
                    onChange={(event) =>
                      setNested("overNineHours", "hrAligned", event.target.checked)
                    }
                  />
                  Aligned with HR working-hours requirement
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={Boolean(objectValue(form["overNineHours"])["managementNote"])}
                    onChange={(event) =>
                      setNested("overNineHours", "managementNote", event.target.checked)
                    }
                  />
                  Management approval note attached
                </label>
              </div>
            ) : null}
            {timeMinutes(String(form["timeTo"] ?? "")) > 19 * 60 &&
            typedCatalog?.nightWorkItems.length ? (
              <div className="space-y-2">
                <h3 className="font-display text-sm font-bold">Night work — activity past 19:00</h3>
                {typedCatalog.nightWorkItems.map((item) => {
                  const answers = objectValue(objectValue(form["nightWork"])["answers"]);
                  const answer = String(answers[item.key] ?? "");
                  return (
                    <div
                      key={item.key}
                      className="grid gap-2 border-b border-border py-2 sm:grid-cols-[1fr_auto] sm:items-center"
                    >
                      <span className="text-xs">{item.name}</span>
                      <AnswerButtons
                        label={item.name}
                        value={answer}
                        allowNa={item.allowNa}
                        onChange={(value) =>
                          setNested("nightWork", "answers", { ...answers, [item.key]: value })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-5">
            <h2 className="font-display text-sm font-bold">Checklist & PPE</h2>
            <div className="space-y-2">
              <p className="text-xs font-medium">Safety checklist</p>
              {checklistItems.map((item) => {
                const answer = checklist.find((row) => row.item === item)?.answer ?? "";
                return (
                  <div
                    key={item}
                    className="grid gap-2 border-b border-border py-2 sm:grid-cols-[1fr_190px] sm:items-center"
                  >
                    <span className="text-xs">{item}</span>
                    <AnswerButtons
                      label={item}
                      value={answer}
                      onChange={(value) => setChecklistAnswer(item, value)}
                    />
                  </div>
                );
              })}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium">Required PPE</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {typedCatalog?.ppe.map((item) => {
                  const items = stringArray(objectValue(form["ppe"])["items"]);
                  return (
                    <label
                      key={item.key}
                      className="flex items-center gap-2 rounded-md border border-border p-2.5 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={items.includes(item.key)}
                        onChange={(event) =>
                          setNested(
                            "ppe",
                            "items",
                            event.target.checked
                              ? [...items, item.key]
                              : items.filter((key) => key !== item.key),
                          )
                        }
                      />
                      {item.name}
                    </label>
                  );
                })}
              </div>
              <Input
                value={String(objectValue(form["ppe"])["special"] ?? "")}
                onChange={(event) => setNested("ppe", "special", event.target.value)}
                placeholder="Other / special PPE"
              />
            </div>
            {permitType === "HOT_WORK" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Fire Watch nominee">
                  <Input
                    value={String(objectValue(form["fireWatch"])["nominee"] ?? "")}
                    onChange={(event) => setNested("fireWatch", "nominee", event.target.value)}
                  />
                </Field>
                <Field label="Fire Watch valid until">
                  <Input
                    type="time"
                    value={String(objectValue(form["fireWatch"])["validTill"] ?? "")}
                    onChange={(event) => setNested("fireWatch", "validTill", event.target.value)}
                  />
                </Field>
              </div>
            ) : null}
            {permitType === "HEIGHT" ? (
              <div className="space-y-3">
                <Field label="Fall height (metres)">
                  <Input
                    type="number"
                    min="2.5"
                    step="0.1"
                    value={String(form["fallHeightMeters"] ?? "")}
                    onChange={(event) => setField("fallHeightMeters", Number(event.target.value))}
                  />
                </Field>
                {["Fall protection equipment inspected", "Safe access and anchorage verified"].map(
                  (item) => {
                    const checks = Array.isArray(form["workingAtHeightChecklist"])
                      ? form["workingAtHeightChecklist"]
                      : [];
                    const answer = checks.find((row) => row.item === item)?.answer ?? "";
                    return (
                      <div
                        key={item}
                        className="grid gap-2 sm:grid-cols-[1fr_190px] sm:items-center"
                      >
                        <span className="text-xs">{item}</span>
                        <AnswerButtons
                          label={item}
                          value={answer}
                          onChange={(value) =>
                            setField("workingAtHeightChecklist", [
                              ...checks.filter((row) => row.item !== item),
                              { item, answer: value },
                            ])
                          }
                        />
                      </div>
                    );
                  },
                )}
              </div>
            ) : null}
            {permitType === "CONFINED" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Oxygen reading">
                  <Input
                    type="number"
                    value={String(objectValue(form["atmosphericTest"])["oxygen"] ?? "")}
                    onChange={(event) => setNested("atmosphericTest", "oxygen", event.target.value)}
                  />
                </Field>
                <Field label="Flammable gas reading">
                  <Input
                    type="number"
                    value={String(objectValue(form["atmosphericTest"])["flammableGas"] ?? "")}
                    onChange={(event) =>
                      setNested("atmosphericTest", "flammableGas", event.target.value)
                    }
                  />
                </Field>
                <Field label="Dust reading">
                  <Input
                    value={String(objectValue(form["atmosphericTest"])["dust"] ?? "")}
                    onChange={(event) => setNested("atmosphericTest", "dust", event.target.value)}
                  />
                </Field>
                <Field label="Attendant name">
                  <Input
                    value={String(form["attendantName"] ?? "")}
                    onChange={(event) => setField("attendantName", event.target.value)}
                  />
                </Field>
              </div>
            ) : null}
            {permitType === "EXCAVATION" ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(["length", "width", "depth"] as const).map((dimension) => (
                  <Field key={dimension} label={`Excavation ${dimension} (metres)`}>
                    <Input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={String(objectValue(form["excavationDimensions"])[dimension] ?? "")}
                      onChange={(event) =>
                        setNested("excavationDimensions", dimension, event.target.value)
                      }
                    />
                  </Field>
                ))}
                <Field label="Fire utility clearance">
                  <Input
                    value={String(objectValue(form["utilityClearance"])["fire"] ?? "")}
                    onChange={(event) => setNested("utilityClearance", "fire", event.target.value)}
                  />
                </Field>
                <Field label="FCM technical utility clearance">
                  <Input
                    value={String(objectValue(form["utilityClearance"])["technical"] ?? "")}
                    onChange={(event) =>
                      setNested("utilityClearance", "technical", event.target.value)
                    }
                  />
                </Field>
              </div>
            ) : null}
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold">Contractor email verification</p>
                <p className="text-xs text-muted-foreground">
                  Send a one-time code to{" "}
                  {String(form["contractorEmail"] || "the contractor email")}. The code expires
                  after 10 minutes.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    contractorOtpBusy ||
                    saving ||
                    !String(form["contractorEmail"] || "").includes("@") ||
                    contractorOtpVerified
                  }
                  onClick={() => void requestContractorOtp()}
                >
                  {contractorOtpBusy && !contractorOtpSent ? "Sending…" : "Send contractor OTP"}
                </Button>
                {contractorOtpSent && !contractorOtpVerified ? (
                  <>
                    <Input
                      className="w-36"
                      aria-label="Contractor email OTP"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      maxLength={6}
                      value={contractorOtp}
                      onChange={(event) =>
                        setContractorOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      placeholder="6-digit code"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={contractorOtpBusy || contractorOtp.length !== 6}
                      onClick={() => void verifyContractorSignature()}
                    >
                      {contractorOtpBusy ? "Verifying…" : "Verify OTP"}
                    </Button>
                  </>
                ) : null}
                {contractorOtpVerified ? (
                  <span role="status" className="text-xs font-semibold text-success">
                    Contractor verified by email OTP
                  </span>
                ) : null}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <SignatureCheck
                label="Execution signature confirmed"
                checked={Boolean(
                  objectValue(objectValue(form["signatures"])["execution"])["signed"],
                )}
                onChange={(checked) =>
                  setNested("signatures", "execution", {
                    ...objectValue(objectValue(form["signatures"])["execution"]),
                    signed: checked,
                  })
                }
              />
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-4">
            <h2 className="font-display text-sm font-bold">Review permit details</h2>
            <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <Summary
                label="Permit type"
                value={TYPES.find(([key]) => key === permitType)?.[1] ?? permitType}
              />
              <Summary
                label="Specialized work type"
                value={
                  specializedOptions.find((item) => item.key === form["specializedType"])?.name ??
                  displayValue(form["specializedType"])
                }
              />
              <Summary
                label="Nature of activity"
                value={
                  form["nature"] === "OTHER"
                    ? displayValue(form["natureOther"])
                    : (NATURES.find(([key]) => key === form["nature"])?.[1] ?? "—")
                }
              />
              <Summary
                label="Building / floor"
                value={`${displayValue(form["building"])} · ${displayValue(form["floor"])}`}
              />
              <Summary
                label="Wing / area"
                value={`${displayValue(form["wing"])} · ${displayValue(form["area"])}`}
              />
              <Summary label="Room / asset no." value={displayValue(form["roomAssetNo"])} />
              <Summary
                label="Branch"
                value={
                  branches.find((branch) => branch.id === form["branchId"])?.name ??
                  displayValue(form["branchId"])
                }
              />
              <Summary
                label="Work description"
                value={displayValue(form["workDescription"] || form["descriptionOfWork"])}
              />
              <Summary label="JSA / SWMS ref" value={displayValue(form["jsaRef"])} />
              <Summary label="Contractor" value={displayValue(form["contractor"])} />
              <Summary label="Vendor email" value={displayValue(form["contractorEmail"])} />
              <Summary
                label="Supervisor"
                value={`${displayValue(form["supervisorName"])} · ${displayValue(form["supervisorMobile"])}`}
              />
              <Summary label="No. of workmen" value={displayValue(form["workmenCount"])} />
              <Summary
                label="Date / time"
                value={`${displayValue(form["workDate"])} · ${displayValue(form["timeFrom"])}–${displayValue(form["timeTo"])}`}
              />
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 text-xs font-semibold">Checklist</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {checklist.map((item) => (
                  <li key={item.item}>
                    {item.item}: <strong>{item.answer}</strong>
                  </li>
                ))}
              </ul>
            </div>
            {timeMinutes(String(form["timeTo"] ?? "")) > 19 * 60 ? (
              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-xs font-semibold">Night work safety checks</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {typedCatalog?.nightWorkItems.map((item) => (
                    <li key={item.key}>
                      {item.name}:{" "}
                      <strong>
                        {String(
                          objectValue(objectValue(form["nightWork"])["answers"])[item.key] ?? "—",
                        )}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Submitting routes this permit to HSE review. Security can only verify the approved
              permit QR at the gate.
            </p>
          </section>
        ) : null}

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => void saveDraft()}
          >
            <Save className="size-4" /> {saving ? "Saving…" : "Save draft"}
          </Button>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setStep((current) => Math.max(0, current - 1))}
              >
                <ChevronLeft className="size-4" /> Back
              </Button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button type="submit" disabled={saving || catalogLoading}>
                Continue <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={saving}>
                {saving ? "Submitting…" : "Submit permit"}
              </Button>
            )}
          </div>
        </footer>
      </form>
    </div>
  );
}

function timeMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium">{label}</Label>
      {children}
    </div>
  );
}

function AnswerButtons({
  label,
  value,
  onChange,
  allowNa = true,
}: {
  label: string;
  value: string;
  onChange: (answer: "Y" | "N" | "NA") => void;
  allowNa?: boolean;
}) {
  const options: ("Y" | "N" | "NA")[] = allowNa ? ["Y", "N", "NA"] : ["Y", "N"];
  return (
    <div role="group" aria-label={`${label} response`} className="flex gap-1">
      {options.map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={value === option ? "default" : "outline"}
          aria-pressed={value === option}
          aria-label={option === "Y" ? "Yes" : option === "N" ? "No" : "Not applicable"}
          className="min-w-9 px-2"
          onClick={() => onChange(option)}
        >
          {option}
        </Button>
      ))}
    </div>
  );
}

function NativeSelect({
  value,
  onChange,
  options,
  placeholder = "Select an option",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function SignatureCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-border p-3 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="break-words text-xs font-medium">{value}</p>
    </div>
  );
}
