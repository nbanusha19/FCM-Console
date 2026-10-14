import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { MessageSquareText, Star } from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/components/layout/AppPage";
import { PageHeader } from "@/components/common/PageHeader";
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
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const paged = usePaged(
    feedback.filter((item) =>
      [
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
        title="Building feedback"
        subtitle="Feedback submitted from geofenced building QR codes."
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.rows.length === 0 ? (
              <EmptyRow cols={5}>
                <MessageSquareText className="mx-auto mb-2 size-8" />
                {loading ? "Loading feedback…" : "No feedback has been submitted yet."}
              </EmptyRow>
            ) : (
              paged.rows.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <p className="font-semibold">{item.building_name}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {[item.floor_name, item.area_name].filter(Boolean).join(" · ") ||
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}
