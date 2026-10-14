import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, MessageSquareText, Send, Star } from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/common/StatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/context/app-context";
import {
  catalogService,
  feedbackService,
  ticketService,
  type HdBuilding,
  type HdBuildingArea,
  type HdBuildingFloor,
  type HdCategory,
  type HdService,
  type HdSubcategory,
  type HdTicket,
} from "@/services/helpdesk-api";

export const Route = createFileRoute("/hd-raise")({
  validateSearch: (s: Record<string, unknown>) => ({
    building: typeof s["building"] === "string" ? s["building"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Building Helpdesk — FCM Helpdesk" },
      {
        name: "description",
        content: "Scan a building Helpdesk QR code to raise a ticket or submit feedback.",
      },
      { property: "og:title", content: "Building Helpdesk" },
      {
        property: "og:description",
        content: "Raise a ticket or submit feedback from a building QR code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "BRANCH_MANAGER", "EMPLOYEE"]}>
      <RaisePage />
    </AppPage>
  ),
});

function RaisePage() {
  const { user } = useApp();
  const navigate = useNavigate();
  const { building: qrBuilding } = Route.useSearch();
  const buildingId = qrBuilding;
  const [categories, setCategories] = useState<HdCategory[]>([]);
  const [subcategories, setSubcategories] = useState<HdSubcategory[]>([]);
  const [services, setServices] = useState<HdService[]>([]);
  const [buildings, setBuildings] = useState<HdBuilding[]>([]);
  const [floors, setFloors] = useState<HdBuildingFloor[]>([]);
  const [areas, setAreas] = useState<HdBuildingArea[]>([]);
  const [mode, setMode] = useState<"ticket" | "feedback">("ticket");
  const [floorName, setFloorName] = useState("");
  const [areaId, setAreaId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<HdTicket["priority"]>("MEDIUM");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<HdTicket | null>(null);
  const canUseBuildingQr =
    user?.role === "ADMIN" || user?.role === "BRANCH_MANAGER" || user?.role === "EMPLOYEE";

  useEffect(() => {
    Promise.all([
      catalogService.listCategories(),
      catalogService.listSubcategories(),
      catalogService.listServices(),
      catalogService.listBuildings(),
    ])
      .then(([c, sc, sv, b]) => {
        setCategories(c.filter((x) => x.active));
        setSubcategories(sc.filter((x) => x.active));
        setServices(sv.filter((x) => x.active));
        setBuildings(b.filter((x) => x.active));
      })
      .catch((e) =>
        toast.error(e instanceof Error ? e.message : "Unable to load the service catalog."),
      );
  }, []);

  useEffect(() => {
    if (!buildingId) return;
    const selectedBuilding = buildings.find((item) => item.id === buildingId);
    if (!selectedBuilding) return;
    if (
      user?.role !== "ADMIN" &&
      (!user?.branchId || selectedBuilding.branch_id !== user.branchId)
    ) {
      setFloors([]);
      setAreas([]);
      return;
    }
    setFloorName("");
    setAreaId("");
    Promise.all([
      catalogService.listBuildingFloors(buildingId),
      catalogService.listBuildingAreas(buildingId),
    ])
      .then(([floorRows, areaRows]) => {
        setFloors(floorRows.filter((floor) => floor.active));
        setAreas(areaRows.filter((area) => area.active));
      })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Unable to load building floors and areas.",
        ),
      );
  }, [buildingId, buildings, user?.branchId, user?.role]);

  const building = buildings.find((item) => item.id === buildingId);
  const canAccessBuilding =
    user?.role === "ADMIN" || (!!user?.branchId && building?.branch_id === user.branchId);
  const buildingArea = areas.find((area) => area.id === areaId);
  const floorOptions = useMemo(() => {
    if (floors.length) return floors.map((floor) => floor.name);
    return [...new Set(areas.map((area) => area.floor))].sort((a, b) => a.localeCompare(b));
  }, [areas, floors]);
  const floorAreas = useMemo(
    () => areas.filter((area) => area.floor === floorName),
    [areas, floorName],
  );
  useEffect(() => {
    if (!categories.length) return;
    if (!categories.some((category) => category.id === categoryId)) setCategoryId("");
  }, [categories, categoryId]);

  const subs = useMemo(
    () => subcategories.filter((s) => s.category_id === categoryId),
    [subcategories, categoryId],
  );
  const service = useMemo(
    () =>
      services.find((s) => s.subcategory_id === subcategoryId) ??
      services.find((s) => s.category_id === categoryId && !s.subcategory_id) ??
      null,
    [services, categoryId, subcategoryId],
  );
  const submit = async () => {
    if (!user) return;
    if (!buildingId || !building) {
      toast.error("Open this form by scanning the QR code for your building.");
      return;
    }
    if (!floorName || !buildingArea) {
      toast.error("Select a floor and an area.");
      return;
    }
    const category = categories.find((c) => c.id === categoryId);
    if (!category) {
      toast.error("Select a service category.");
      return;
    }
    if (subs.length > 0 && !subcategoryId) {
      toast.error("Select a sub-category.");
      return;
    }
    if (description.trim().length < 10) {
      toast.error("Describe the issue in a few words (at least 10 characters).");
      return;
    }
    setSubmitting(true);
    try {
      const position = buildingId ? await getDeviceLocation() : null;
      const ticket = await ticketService.create(
        {
          category,
          subcategory: subcategories.find((s) => s.id === subcategoryId) ?? null,
          service,
          description: description.trim(),
          location: `${building.name} · ${floorName} · ${buildingArea.name}`,
          priority,
          ...(buildingId && position
            ? { buildingContext: { buildingId, areaId, ...position } }
            : {}),
        },
        user,
      );
      setCreated(ticket);
      toast.success(`Ticket ${ticket.ticket_no} raised`);
      if (ticket.provider_notification_status === "NO_RECIPIENT") {
        toast.warning("Ticket was raised, but no active service-provider email address was found.");
      } else if (
        ticket.provider_notification_status === "FAILED" ||
        ticket.provider_notification_status === "PARTIAL"
      ) {
        toast.warning("Ticket was raised, but the service-provider email could not be delivered.");
      }
      if (
        ticket.provider_in_app_notification_status === "FAILED" ||
        ticket.provider_in_app_notification_status === "NO_RECIPIENT"
      ) {
        toast.warning(
          "Ticket was raised, but no service-provider in-app notification was delivered.",
        );
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to raise the service request. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const submitFeedback = async () => {
    if (!user || !buildingId) return;
    if (!building || !floorName || !buildingArea) {
      toast.error("Select a floor and an area.");
      return;
    }
    if (feedback.trim().length < 3) {
      toast.error("Please enter feedback (at least 3 characters).");
      return;
    }
    if (feedbackRating < 1 || feedbackRating > 5) {
      toast.error("Please select a rating from 1 to 5 stars.");
      return;
    }
    setSubmitting(true);
    try {
      const position = await getDeviceLocation();
      await feedbackService.submit({
        buildingId,
        areaId,
        feedback: feedback.trim(),
        rating: feedbackRating,
        ...position,
      });
      setFeedbackSent(true);
      toast.success("Feedback submitted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  if (buildingId && user && !canUseBuildingQr) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-12 text-center">
        <h1 className="font-display text-xl font-bold">Building QR access unavailable</h1>
        <p className="text-sm text-muted-foreground">
          Only employees, admins, and branch managers can submit feedback or tickets from building
          QR codes.
        </p>
      </div>
    );
  }

  if (!buildingId) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-12 text-center">
        <h1 className="font-display text-xl font-bold">Scan your building QR code</h1>
        <p className="text-sm text-muted-foreground">
          Helpdesk tickets and feedback can only be submitted from the QR code displayed at your
          building.
        </p>
      </div>
    );
  }

  if (building && !canAccessBuilding) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-12 text-center">
        <h1 className="font-display text-xl font-bold">Building QR access unavailable</h1>
        <p className="text-sm text-muted-foreground">
          You can only submit Helpdesk tickets or feedback for your assigned branch.
        </p>
      </div>
    );
  }

  if (feedbackSent) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <CheckCircle2 className="mx-auto size-14 text-success" />
        <h1 className="font-display text-[26px] font-extrabold">Thank you for your feedback</h1>
        <p className="text-sm text-muted-foreground">
          {building?.name ?? "Your building"} feedback has been recorded.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setFeedbackSent(false);
            setFeedback("");
            setAreaId("");
          }}
        >
          Submit more feedback
        </Button>
      </div>
    );
  }

  if (created) {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-10 text-center">
        <CheckCircle2 className="mx-auto size-14 text-success" />
        <h1 className="font-display text-[26px] font-extrabold tracking-tight">
          Service request raised successfully
        </h1>
        <p className="text-[13px] text-muted-foreground">
          Your request is in the shared queue and will be claimed by an active service provider.
        </p>
        <div className="surface-card space-y-3 p-6 text-left">
          <Row label="Ticket ID" value={created.ticket_no} mono />
          <Row label="Category" value={created.category_name} />
          {created.subcategory_name ? (
            <Row label="Sub-category" value={created.subcategory_name} />
          ) : null}
          <Row label="Priority" value={priorityLabel(created.priority)} />
          {created.provider_name ? (
            <Row label="Service provider" value={created.provider_name} />
          ) : null}
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-muted-foreground">Status</span>
            <StatusPill status={created.status} />
          </div>
        </div>
        <div className="flex justify-center gap-2.5">
          <Button
            variant="outline"
            onClick={() => {
              setCreated(null);
              setDescription("");
              setSubcategoryId("");
            }}
          >
            Raise another
          </Button>
          <Button onClick={() => navigate({ to: "/hd-ticket/$id", params: { id: created.id } })}>
            Track ticket
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="FCM Helpdesk"
        title={building?.name ?? "Building Helpdesk"}
        subtitle="Choose a floor and area, then give feedback or raise a service ticket. Submissions are checked against this building's geofence."
      />
      <div className="surface-card space-y-5 p-6">
        <>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={mode === "ticket" ? "default" : "outline"}
              onClick={() => setMode("ticket")}
            >
              <Send className="size-4" />
              Raise a ticket
            </Button>
            <Button
              variant={mode === "feedback" ? "default" : "outline"}
              onClick={() => setMode("feedback")}
            >
              <MessageSquareText className="size-4" />
              Give feedback
            </Button>
          </div>
          {!building ? (
            <p className="text-sm text-danger">
              This building QR is not active or has not been configured. Contact the Helpdesk
              administrator.
            </p>
          ) : null}
          {building ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Floor</Label>
                <Select
                  value={floorName}
                  onValueChange={(value) => {
                    setFloorName(value);
                    setAreaId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a floor" />
                  </SelectTrigger>
                  <SelectContent>
                    {floorOptions.map((floor) => (
                      <SelectItem key={floor} value={floor}>
                        {floor}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!floorOptions.length ? (
                  <p className="text-[12px] text-warning">
                    No active floors are configured for this building.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label>Area</Label>
                <Select value={areaId} onValueChange={setAreaId} disabled={!floorName}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={floorName ? "Select an area" : "Select a floor first"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {floorAreas.map((area) => (
                      <SelectItem key={area.id} value={area.id}>
                        {area.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {floorName && !floorAreas.length ? (
                  <p className="text-[12px] text-warning">
                    No active areas are configured for this floor.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
        {buildingId && mode === "feedback" ? (
          <>
            <div className="space-y-1.5">
              <div className="space-y-1.5">
                <Label>Rating</Label>
                <div className="flex items-center gap-1" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      aria-pressed={feedbackRating === rating}
                      aria-label={`${rating} ${rating === 1 ? "star" : "stars"}`}
                      onClick={() => setFeedbackRating(rating)}
                      className="rounded p-1 text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Star
                        className="size-7"
                        fill={rating <= feedbackRating ? "currentColor" : "none"}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-[12px] text-muted-foreground">
                    {feedbackRating ? `${feedbackRating} out of 5` : "Select a rating"}
                  </span>
                </div>
              </div>
              <Label>Feedback</Label>
              <Textarea
                rows={5}
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="Share your feedback about this building or area."
              />
            </div>
            <Button
              className="w-full"
              size="lg"
              disabled={submitting || !building || !floorName || !areaId || feedbackRating === 0}
              onClick={() => void submitFeedback()}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <MessageSquareText className="size-4" />
                  Submit feedback
                </>
              )}
            </Button>
          </>
        ) : null}
        {mode === "ticket" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Service category</Label>
                <Select
                  value={categoryId}
                  onValueChange={(v) => {
                    setCategoryId(v);
                    setSubcategoryId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sub-category</Label>
                <Select
                  value={subcategoryId}
                  onValueChange={setSubcategoryId}
                  disabled={!categoryId || subs.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        categoryId
                          ? subs.length
                            ? "Select sub-category"
                            : "No sub-categories"
                          : "Select a category first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {subs.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <p className="rounded-md border border-border px-3 py-2 text-sm">
                {building?.name}
                {buildingArea ? ` · ${buildingArea.floor} · ${buildingArea.name}` : ""}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(value) => {
                  if (value === "HIGH" || value === "MEDIUM" || value === "LOW") setPriority(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. The AC in meeting room 3 is not cooling properly."
              />
            </div>
            <Button
              className="w-full"
              size="lg"
              disabled={submitting || !building || !floorName || !areaId}
              onClick={() => void submit()}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Submitting…
                </>
              ) : (
                <>
                  <Send className="size-4" /> Raise ticket
                </>
              )}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function getDeviceLocation(): Promise<{ latitude: number; longitude: number }> {
  if (!navigator.geolocation) {
    return Promise.reject(
      new Error("This browser does not support location. Enable location access to submit."),
    );
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "Location permission is required to submit from this building QR."
              : "Unable to determine your location. Try again near the building.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

function priorityLabel(priority: HdTicket["priority"]): string {
  return priority.charAt(0) + priority.slice(1).toLowerCase();
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[12px] font-semibold text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-[13px] font-bold" : "text-[13px] font-semibold"}>
        {value}
      </span>
    </div>
  );
}
