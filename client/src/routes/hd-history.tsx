import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TableCard, usePaged } from "@/components/common/TableCard";
import { TicketTable } from "@/components/helpdesk/TicketTable";
import { useApp } from "@/context/app-context";
import { feedbackService, ticketService, type HdTicket } from "@/services/helpdesk-api";

export const Route = createFileRoute("/hd-history")({
  head: () => ({
    meta: [
      { title: "Ticket history — FCM Helpdesk" },
      { name: "description", content: "Historical helpdesk tickets." },
      { property: "og:title", content: "Ticket history" },
      { property: "og:description", content: "Historical helpdesk tickets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppPage roles={["ADMIN", "SERVICE_PROVIDER", "EMPLOYEE", "BRANCH_MANAGER"]}>
      <HistoryPage />
    </AppPage>
  ),
});

function HistoryPage() {
  const { user } = useApp();
  const [tickets, setTickets] = useState<HdTicket[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedbackTicket, setFeedbackTicket] = useState<HdTicket | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [submittedFeedbackIds, setSubmittedFeedbackIds] = useState<Set<string>>(new Set());

  const scope =
    user?.role === "SERVICE_PROVIDER"
      ? "assigned"
      : user?.role === "EMPLOYEE" || user?.role === "BRANCH_MANAGER"
        ? "mine"
        : "all";

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    ticketService
      .list(scope, user)
      .then(async (rows) => {
        setTickets(rows);
        const ownedTickets = rows.filter(
          (ticket) =>
            ticket.raiser_id === user.id ||
            (!!ticket.raiser_email &&
              ticket.raiser_email.trim().toLowerCase() === user.email.trim().toLowerCase()),
        );
        const buildingIds = [
          ...new Set(
            ownedTickets
              .map((ticket) => ticket.building_id)
              .filter((buildingId): buildingId is string => Boolean(buildingId)),
          ),
        ];
        try {
          const feedbackOptions = await Promise.all(
            buildingIds.map((buildingId) => feedbackService.ticketOptions(buildingId)),
          );
          setSubmittedFeedbackIds(
            new Set(
              feedbackOptions
                .flat()
                .filter((ticket) => ticket.feedback_submitted)
                .map((ticket) => ticket.id),
            ),
          );
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Unable to load submitted ticket feedback.",
          );
        }
      })
      .catch((error: unknown) => {
        setTickets([]);
        toast.error(error instanceof Error ? error.message : "Unable to load ticket history.");
      })
      .finally(() => setLoading(false));
  }, [user, scope]);

  const closed = useMemo(
    () =>
      tickets
        .filter((t) => t.status === "CLOSED")
        .filter(
          (t) =>
            !q.trim() ||
            [t.ticket_no, t.category_name, t.subcategory_name, t.raiser_name, t.provider_name]
              .join(" ")
              .toLowerCase()
              .includes(q.trim().toLowerCase()),
        ),
    [tickets, q],
  );
  const paged = usePaged(closed);
  const submitFeedback = async () => {
    if (!feedbackTicket || feedbackText.trim().length < 3 || feedbackRating < 1) {
      toast.error("Select a rating and enter at least 3 characters of feedback.");
      return;
    }
    setFeedbackSaving(true);
    try {
      await feedbackService.submitTicket(feedbackTicket.id, {
        feedback: feedbackText.trim(),
        rating: feedbackRating,
      });
      setSubmittedFeedbackIds((current) => new Set(current).add(feedbackTicket.id));
      setFeedbackTicket(null);
      setFeedbackText("");
      setFeedbackRating(0);
      toast.success("Ticket feedback submitted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit ticket feedback.");
    } finally {
      setFeedbackSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="FCM Helpdesk"
        title="Ticket history"
        subtitle="Completed and closed tickets."
      />
      <TableCard
        search={q}
        onSearch={(v) => {
          setQ(v);
          paged.reset();
        }}
        placeholder="Search ticket, category, provider"
        footer={paged.footer}
      >
        {loading ? (
          <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            Loading history…
          </p>
        ) : (
          <TicketTable
            tickets={paged.rows}
            empty="No closed tickets yet."
            canFeedback={(ticket) =>
              !submittedFeedbackIds.has(ticket.id) &&
              !!user &&
              (ticket.raiser_id === user.id ||
                (!!ticket.raiser_email &&
                  ticket.raiser_email.trim().toLowerCase() === user.email.trim().toLowerCase()))
            }
            onFeedback={setFeedbackTicket}
          />
        )}
      </TableCard>
      <Dialog
        open={feedbackTicket !== null}
        onOpenChange={(open) => {
          if (!open) setFeedbackTicket(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ticket feedback</DialogTitle>
            <DialogDescription>
              {feedbackTicket
                ? `Share your feedback for ${feedbackTicket.ticket_no}.`
                : "Rate your Helpdesk experience."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Rating</Label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    aria-label={`${rating} stars`}
                    aria-pressed={feedbackRating === rating}
                    onClick={() => setFeedbackRating(rating)}
                    className="rounded p-1 text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Star
                      className="size-7"
                      fill={rating <= feedbackRating ? "currentColor" : "none"}
                    />
                  </button>
                ))}
                <span className="ml-2 text-xs text-muted-foreground">
                  {feedbackRating ? `${feedbackRating} out of 5` : "Select a rating"}
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ticket-feedback">Feedback</Label>
              <Textarea
                id="ticket-feedback"
                rows={4}
                value={feedbackText}
                onChange={(event) => setFeedbackText(event.target.value)}
                placeholder="Tell us about your experience."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackTicket(null)}>
              Cancel
            </Button>
            <Button disabled={feedbackSaving} onClick={() => void submitFeedback()}>
              {feedbackSaving ? "Submitting…" : "Submit feedback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
