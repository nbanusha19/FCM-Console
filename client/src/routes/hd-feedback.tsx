import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Eye, MessageSquareText, Star } from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyRow, TableCard, usePaged } from "@/components/common/TableCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { feedbackService, type HdFeedback } from "@/services/helpdesk-api";

export const Route = createFileRoute("/hd-feedback")({
  head: () => ({ meta: [{ title: "Building feedback — FCM Helpdesk" }] }),
  component: () => (
    <AppPage roles={["ADMIN"]}>
      <FeedbackPage />
    </AppPage>
  ),
});

function FeedbackPage() {
  const [feedback, setFeedback] = useState<HdFeedback[]>([]);
  const [selectedFeedback, setSelectedFeedback] = useState<HdFeedback | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const paged = usePaged(
    feedback.filter((item) =>
      [
        item.ticket_no,
        item.building_name,
        item.branch_name,
        item.floor_name,
        item.area_name,
        item.submitted_by_name,
        item.feedback,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    ),
  );
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setFeedback(await feedbackService.list());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load building feedback.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="FCM Helpdesk"
        title="Helpdesk feedback"
        subtitle="Building and ticket feedback submitted through Helpdesk."
      />
      <TableCard
        search={query}
        onSearch={(value) => {
          setQuery(value);
          paged.reset();
        }}
        placeholder="Search building, area, requester or feedback"
        footer={paged.footer}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Building / area</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead>Feedback</TableHead>
              <TableHead>Submitted by</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.rows.length === 0 ? (
              <EmptyRow cols={6}>
                <MessageSquareText className="mx-auto mb-2 size-8" />
                {loading ? "Loading feedback…" : "No feedback has been submitted yet."}
              </EmptyRow>
            ) : (
              paged.rows.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <p className="font-semibold">
                      {item.ticket_no ? `Ticket ${item.ticket_no}` : item.building_name}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {item.ticket_no
                        ? item.building_name
                        : [item.floor_name, item.area_name].filter(Boolean).join(" · ") ||
                          "Building-wide"}
                    </p>
                  </TableCell>
                  <TableCell>
                    {item.rating ? (
                      <div
                        className="flex items-center gap-1"
                        aria-label={`${item.rating} out of 5 stars`}
                      >
                        <Star className="size-4 fill-amber-500 text-amber-500" />
                        <span className="text-sm font-semibold">{item.rating}</span>
                        <span className="text-[12px] text-muted-foreground">/ 5</span>
                      </div>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">Not rated</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xl whitespace-pre-wrap text-[13px]">
                    {item.feedback}
                  </TableCell>
                  <TableCell>
                    <p>{item.submitted_by_name}</p>
                    <p className="text-[12px] text-muted-foreground">{item.branch_name}</p>
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="View feedback"
                      aria-label={`View feedback from ${item.submitted_by_name}`}
                      onClick={() => setSelectedFeedback(item)}
                    >
                      <Eye className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>
      <Dialog
        open={selectedFeedback !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedFeedback(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedFeedback?.ticket_no
                ? `Feedback for ticket ${selectedFeedback.ticket_no}`
                : "Building feedback"}
            </DialogTitle>
            <DialogDescription>
              {selectedFeedback
                ? `${selectedFeedback.building_name} · ${
                    selectedFeedback.ticket_no
                      ? "Ticket feedback"
                      : [selectedFeedback.floor_name, selectedFeedback.area_name]
                          .filter(Boolean)
                          .join(" · ") || "Building-wide"
                  }`
                : "Feedback details"}
            </DialogDescription>
          </DialogHeader>
          {selectedFeedback ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-lg bg-muted/40 p-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Submitted by</p>
                  <p>{selectedFeedback.submitted_by_name}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Branch</p>
                  <p>{selectedFeedback.branch_name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Rating</p>
                  <p>{selectedFeedback.rating ? `${selectedFeedback.rating} / 5` : "Not rated"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Submitted</p>
                  <p>{new Date(selectedFeedback.created_at).toLocaleString()}</p>
                </div>
              </div>
              <section className="space-y-1">
                <h3 className="text-sm font-semibold">Feedback</h3>
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {selectedFeedback.feedback}
                </p>
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
