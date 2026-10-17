import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, Loader2, MessageSquareText, Send, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/common/StatusBadge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/context/app-context";
import {
  feedbackService,
  publicHelpdeskService,
  ticketService,
  type HdFeedbackTicketOption,
  type HdPublicTicketHistory,
  type HdTicket,
  type PublicHelpdeskBootstrap,
} from "@/services/helpdesk-api";

export function PublicBuildingHelpdesk({
  buildingId,
  ticketId = "",
}: {
  buildingId: string;
  ticketId?: string;
}) {
  const { user } = useApp();
  const [catalog, setCatalog] = useState<PublicHelpdeskBootstrap | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [token, setToken] = useState("");
  const [tickets, setTickets] = useState<HdFeedbackTicketOption[]>([]);
  const [mode, setMode] = useState<"ticket" | "myTickets" | "feedback" | null>(null);
  const [floor, setFloor] = useState("");
  const [areaId, setAreaId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [priority, setPriority] = useState<HdTicket["priority"]>("MEDIUM");
  const [description, setDescription] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [historyTarget, setHistoryTarget] = useState<HdFeedbackTicketOption | null>(null);
  const [history, setHistory] = useState<HdPublicTicketHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    publicHelpdeskService
      .bootstrap(buildingId)
      .then((result) => {
        if (active) setCatalog(result);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message =
          error instanceof Error ? error.message : "Unable to load this building's Helpdesk.";
        setLoadError(message);
      });
    return () => {
      active = false;
    };
  }, [buildingId]);

  const floors = useMemo(() => {
    const configured = catalog?.floors.filter((item) => item.active).map((item) => item.name) ?? [];
    const areaFloors = catalog?.areas.filter((item) => item.active).map((item) => item.floor) ?? [];
    return [...new Set(configured.length ? configured : areaFloors)];
  }, [catalog]);
  const floorAreas = useMemo(
    () => catalog?.areas.filter((item) => item.active && item.floor === floor) ?? [],
    [catalog, floor],
  );
  const subcategories = useMemo(
    () =>
      catalog?.subcategories.filter((item) => item.active && item.category_id === categoryId) ?? [],
    [catalog, categoryId],
  );
  const signedInRequester =
    !ticketId && user && ["ADMIN", "BRANCH_MANAGER", "EMPLOYEE"].includes(user.role) ? user : null;
  const identityEmail = signedInRequester?.email ?? email;
  const verified = Boolean(signedInRequester || token);

  useEffect(() => {
    if (!signedInRequester || !catalog) return;
    Promise.all([
      ticketService.list("mine", signedInRequester),
      feedbackService.ticketOptions(buildingId),
    ])
      .then(([rows, options]) => {
        const feedbackSubmitted = new Set(
          options.filter((ticket) => ticket.feedback_submitted).map((ticket) => ticket.id),
        );
        setTickets(
          rows
            .filter((ticket) => ticket.building_id === buildingId)
            .map((ticket) => ({
              id: ticket.id,
              ticket_no: ticket.ticket_no,
              category_name: ticket.category_name,
              description: ticket.description,
              status: ticket.status,
              created_at: ticket.created_at,
              feedback_submitted: feedbackSubmitted.has(ticket.id),
            })),
        );
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Unable to load Helpdesk tickets.");
      });
  }, [buildingId, catalog, signedInRequester]);

  const openTicketHistory = async (ticket: HdFeedbackTicketOption, publicToken = token) => {
    setHistoryTarget(ticket);
    setHistory(null);
    setHistoryLoading(true);
    try {
      if (signedInRequester) {
        const fullTicket = await ticketService.get(ticket.id);
        if (!fullTicket) throw new Error("This Helpdesk ticket was not found.");
        const events = await ticketService.events(ticket.id);
        setHistory({
          ticket: {
            id: fullTicket.id,
            ticket_no: fullTicket.ticket_no,
            category_name: fullTicket.category_name,
            subcategory_name: fullTicket.subcategory_name,
            description: fullTicket.description,
            location: fullTicket.location,
            priority: fullTicket.priority,
            status: fullTicket.status,
            created_at: fullTicket.created_at,
            updated_at: fullTicket.updated_at,
            closed_at: fullTicket.closed_at ?? "",
          },
          events: events.map((event) => ({
            action: event.action,
            remarks: event.remarks,
            performed_by_name: event.performed_by_name,
            created_at: event.created_at,
          })),
        });
      } else {
        setHistory(await publicHelpdeskService.ticketHistory(buildingId, ticket.id, publicToken));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load ticket history.");
      setHistoryTarget(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const requestOtp = async () => {
    if (name.trim().length < 2) {
      toast.error("Enter your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await publicHelpdeskService.sendOtp(buildingId, email.trim());
      setOtpSent(true);
      toast.success("Verification code sent to your email.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send the verification code.");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(code)) {
      toast.error("Enter the six-digit verification code.");
      return;
    }
    setBusy(true);
    try {
      const verifiedToken = await publicHelpdeskService.verifyOtp(buildingId, email.trim(), code);
      const ownTickets = await publicHelpdeskService.tickets(buildingId, verifiedToken);
      setToken(verifiedToken);
      setTickets(ownTickets);
      toast.success("Email verified.");
      if (ticketId) {
        setMode("myTickets");
        const linkedTicket = ownTickets.find((ticket) => ticket.id === ticketId);
        if (linkedTicket?.status === "CLOSED" && !linkedTicket.feedback_submitted) {
          setSelectedTicketId(linkedTicket.id);
          setMode("feedback");
        } else if (linkedTicket?.feedback_submitted) {
          toast.info("Feedback has already been submitted for this ticket.");
        } else {
          toast.error("This closed ticket was not found for the verified email address.");
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to verify your email.");
    } finally {
      setBusy(false);
    }
  };

  const submitTicket = async () => {
    if (!catalog || (!signedInRequester && !token) || !areaId || !categoryId) {
      toast.error("Select a floor, area, and service category.");
      return;
    }
    if (subcategories.length && !subcategoryId) {
      toast.error("Select a sub-category.");
      return;
    }
    if (description.trim().length < 10) {
      toast.error("Describe the issue in at least 10 characters.");
      return;
    }
    const category = catalog.categories.find((item) => item.id === categoryId);
    if (!category) {
      toast.error("Select a valid service category.");
      return;
    }
    setBusy(true);
    try {
      const position = await getDeviceLocation();
      const subcategory = catalog.subcategories.find((item) => item.id === subcategoryId) ?? null;
      const service =
        catalog.services.find((item) => item.subcategory_id === subcategoryId) ??
        catalog.services.find((item) => item.category_id === categoryId && !item.subcategory_id) ??
        null;
      const area = floorAreas.find((item) => item.id === areaId);
      const ticket = signedInRequester
        ? await ticketService.create(
            {
              category,
              subcategory,
              service,
              description: description.trim(),
              location: `${catalog.building.name} · ${floor} · ${area?.name ?? ""}`,
              priority,
              buildingContext: { buildingId, areaId, ...position },
            },
            signedInRequester,
          )
        : await publicHelpdeskService.createTicket(buildingId, {
            token,
            name: name.trim(),
            areaId,
            categoryId,
            ...(subcategoryId ? { subcategoryId } : {}),
            priority,
            description: description.trim(),
            ...position,
          });
      setTickets((current) => [
        {
          id: ticket.id,
          ticket_no: ticket.ticket_no,
          category_name: ticket.category_name,
          description: ticket.description,
          status: ticket.status,
          created_at: ticket.created_at,
          feedback_submitted: false,
        },
        ...current,
      ]);
      setDescription("");
      setMode(null);
      setSuccess(`Ticket ${ticket.ticket_no} was raised successfully.`);
      if (ticket.provider_notification_status === "NO_RECIPIENT") {
        toast.warning("Ticket was raised, but no active service-provider email address was found.");
      } else if (
        ticket.provider_notification_status === "FAILED" ||
        ticket.provider_notification_status === "PARTIAL"
      ) {
        toast.warning("Ticket was raised, but a service-provider email could not be delivered.");
      }
      if (
        ticket.provider_in_app_notification_status === "FAILED" ||
        ticket.provider_in_app_notification_status === "NO_RECIPIENT"
      ) {
        toast.warning(
          "Ticket was raised, but no service-provider in-app notification was delivered.",
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to raise the ticket.");
    } finally {
      setBusy(false);
    }
  };

  const submitFeedback = async () => {
    if (
      (!signedInRequester && !token) ||
      !selectedTicketId ||
      rating < 1 ||
      feedback.trim().length < 3
    ) {
      toast.error("Select a ticket, rating, and enter feedback.");
      return;
    }
    setBusy(true);
    try {
      const selected = tickets.find((ticket) => ticket.id === selectedTicketId);
      if (signedInRequester) {
        await feedbackService.submitTicket(selectedTicketId, {
          feedback: feedback.trim(),
          rating,
        });
      } else {
        await publicHelpdeskService.submitFeedback(buildingId, {
          token,
          name: name.trim(),
          ticketId: selectedTicketId,
          feedback: feedback.trim(),
          rating,
        });
      }
      setTickets((current) =>
        current.map((ticket) =>
          ticket.id === selectedTicketId ? { ...ticket, feedback_submitted: true } : ticket,
        ),
      );
      setSelectedTicketId("");
      setFeedback("");
      setRating(0);
      setMode("myTickets");
      setSuccess(`Feedback for ${selected?.ticket_no ?? "your ticket"} was submitted.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit ticket feedback.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-2 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            H
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            FCM Helpdesk
          </p>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            {catalog?.building.name ?? "Welcome to Helpdesk"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {verified
              ? `Continue as ${identityEmail}. Raise a request or track your tickets.`
              : "Verify your email to raise a request or track your tickets."}
          </p>
        </header>

        {loadError ? (
          <section className="surface-card p-6 text-center text-sm text-danger">
            {loadError}
          </section>
        ) : !catalog ? (
          <section className="surface-card p-8 text-center text-sm text-muted-foreground">
            Loading building Helpdesk…
          </section>
        ) : !verified ? (
          <section className="surface-card space-y-4 p-5 sm:p-7">
            <div className="space-y-1.5">
              <Label htmlFor="helpdesk-name">Your name</Label>
              <Input
                id="helpdesk-name"
                type="text"
                autoComplete="name"
                maxLength={200}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter your name"
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="helpdesk-email">Email address</Label>
              <Input
                id="helpdesk-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                disabled={otpSent || busy}
              />
            </div>
            {otpSent ? (
              <div className="space-y-1.5">
                <Label htmlFor="helpdesk-code">Email verification code</Label>
                <Input
                  id="helpdesk-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                />
                <button
                  type="button"
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    setOtpSent(false);
                    setCode("");
                  }}
                >
                  Use a different email
                </button>
              </div>
            ) : null}
            <Button
              className="w-full"
              size="lg"
              disabled={busy}
              onClick={() => void (otpSent ? verifyOtp() : requestOtp())}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {otpSent ? "Verify and continue" : "Send verification code"}
            </Button>
          </section>
        ) : (
          <>
            {success ? (
              <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
                <CheckCircle2 className="size-5 shrink-0" />
                {success}
              </div>
            ) : null}
            {mode === null ? (
              <section className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setSuccess("");
                    setMode("ticket");
                  }}
                  className="surface-card rounded-xl p-5 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
                >
                  <span className="mb-3 grid size-10 place-items-center rounded-lg bg-primary-soft text-primary">
                    <Send className="size-5" />
                  </span>
                  <span className="block font-display text-base font-bold">Raise a ticket</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Report an issue or request a service.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSuccess("");
                    setMode("myTickets");
                  }}
                  className="surface-card rounded-xl p-5 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
                >
                  <span className="mb-3 grid size-10 place-items-center rounded-lg bg-primary-soft text-primary">
                    <MessageSquareText className="size-5" />
                  </span>
                  <span className="block font-display text-base font-bold">My Ticket</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Track your requests, view their history, and give feedback when closed.
                  </span>
                </button>
              </section>
            ) : null}

            {mode === "ticket" ? (
              <section className="surface-card space-y-4 p-5 sm:p-7">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-lg font-bold">Raise a ticket</h2>
                  <button
                    type="button"
                    className="text-sm text-primary"
                    onClick={() => setMode(null)}
                  >
                    Back
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Floor</Label>
                    <Select
                      value={floor}
                      onValueChange={(value) => {
                        setFloor(value);
                        setAreaId("");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a floor" />
                      </SelectTrigger>
                      <SelectContent>
                        {floors.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Area</Label>
                    <Select value={areaId} onValueChange={setAreaId} disabled={!floor}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={floor ? "Select an area" : "Select a floor first"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {floorAreas.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Service category</Label>
                    <Select
                      value={categoryId}
                      onValueChange={(value) => {
                        setCategoryId(value);
                        setSubcategoryId("");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {catalog.categories.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
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
                      disabled={!categoryId || !subcategories.length}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            subcategories.length ? "Select a sub-category" : "No sub-categories"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {subcategories.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select
                    value={priority}
                    onValueChange={(value) => {
                      if (value === "HIGH" || value === "MEDIUM" || value === "LOW")
                        setPriority(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
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
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Describe the issue (at least 10 characters)."
                  />
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  disabled={busy}
                  onClick={() => void submitTicket()}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {busy ? "Submitting…" : "Raise ticket"}
                </Button>
              </section>
            ) : null}

            {mode === "myTickets" ? (
              <section className="surface-card space-y-4 p-5 sm:p-7">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-lg font-bold">My Ticket</h2>
                  <button
                    type="button"
                    className="text-sm text-primary"
                    onClick={() => setMode(null)}
                  >
                    Back
                  </button>
                </div>
                {tickets.length ? (
                  <div className="divide-y">
                    {tickets.map((ticket) => (
                      <article
                        key={ticket.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="font-semibold">
                            {ticket.ticket_no} · {ticket.category_name}
                          </p>
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {ticket.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill status={ticket.status} />
                            <span className="text-xs text-muted-foreground">
                              {new Date(ticket.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void openTicketHistory(ticket)}
                          >
                            <Eye className="size-4" />
                            View
                          </Button>
                          {ticket.status === "CLOSED" && !ticket.feedback_submitted ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title={`Give feedback for ${ticket.ticket_no}`}
                              aria-label={`Give feedback for ${ticket.ticket_no}`}
                              onClick={() => {
                                setSelectedTicketId(ticket.id);
                                setMode("feedback");
                              }}
                            >
                              <Star className="size-4 text-amber-500" />
                            </Button>
                          ) : ticket.feedback_submitted ? (
                            <span className="px-2 text-xs text-muted-foreground">
                              Feedback sent
                            </span>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No tickets were raised from this building using your verified email.
                  </p>
                )}
              </section>
            ) : null}

            {mode === "feedback" ? (
              <section className="surface-card space-y-4 p-5 sm:p-7">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-lg font-bold">Give ticket feedback</h2>
                  <button
                    type="button"
                    className="text-sm text-primary"
                    onClick={() => setMode("myTickets")}
                  >
                    Back
                  </button>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  {tickets.find((ticket) => ticket.id === selectedTicketId)?.ticket_no ??
                    "Selected ticket"}
                </div>
                <div className="space-y-1.5">
                  <Label>Rating</Label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-label={`${value} stars`}
                        aria-pressed={rating === value}
                        onClick={() => setRating(value)}
                        className="rounded p-1 text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Star className="size-7" fill={value <= rating ? "currentColor" : "none"} />
                      </button>
                    ))}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {rating ? `${rating} out of 5` : "Select a rating"}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Feedback</Label>
                  <Textarea
                    rows={4}
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder="Tell us about your experience with this ticket."
                  />
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  disabled={busy || !tickets.length}
                  onClick={() => void submitFeedback()}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <MessageSquareText className="size-4" />
                  )}
                  {busy ? "Submitting…" : "Submit feedback"}
                </Button>
              </section>
            ) : null}
          </>
        )}
        <p className="text-center text-xs text-muted-foreground">
          Your email is used to verify your identity and prevent duplicate feedback submissions.
        </p>
      </div>
      <Dialog
        open={historyTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryTarget(null);
            setHistory(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {history?.ticket.ticket_no ?? historyTarget?.ticket_no ?? "Ticket history"}
            </DialogTitle>
            <DialogDescription>
              {history?.ticket.category_name ?? historyTarget?.category_name ?? "Loading ticket…"}
            </DialogDescription>
          </DialogHeader>
          {historyLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading ticket history…
            </p>
          ) : history ? (
            <div className="space-y-5">
              <div className="grid gap-3 rounded-lg bg-muted/40 p-4 text-sm sm:grid-cols-2">
                <p>
                  <span className="font-semibold">Status:</span> {history.ticket.status}
                </p>
                <p>
                  <span className="font-semibold">Priority:</span> {history.ticket.priority}
                </p>
                <p>
                  <span className="font-semibold">Location:</span> {history.ticket.location || "—"}
                </p>
                <p>
                  <span className="font-semibold">Raised:</span>{" "}
                  {new Date(history.ticket.created_at).toLocaleString()}
                </p>
                <p className="sm:col-span-2">
                  <span className="font-semibold">Description:</span> {history.ticket.description}
                </p>
              </div>
              <section className="space-y-3">
                <h3 className="font-semibold">Ticket history</h3>
                {history.events.length ? (
                  <ol className="space-y-3 border-l pl-4">
                    {history.events.map((event, index) => (
                      <li
                        key={`${event.action}-${event.created_at}-${index}`}
                        className="space-y-1"
                      >
                        <p className="text-sm font-medium">{event.action}</p>
                        <p className="text-xs text-muted-foreground">
                          {[event.performed_by_name, new Date(event.created_at).toLocaleString()]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {event.remarks ? <p className="text-sm">{event.remarks}</p> : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">No ticket activity is recorded.</p>
                )}
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function getDeviceLocation(): Promise<{ latitude: number; longitude: number }> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("This browser does not support location services."));
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
