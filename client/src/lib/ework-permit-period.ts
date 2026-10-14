import { fmtDate } from "@/constants/permit-status";

export type PermitPeriod = "daily" | "weekly" | "monthly";

export function getPermitPeriodRange(period: PermitPeriod, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start: Date;
  let end: Date;
  let label: string;

  if (period === "daily") {
    start = today;
    end = today;
    label = "Today";
  } else if (period === "weekly") {
    const daysSinceMonday = (today.getDay() + 6) % 7;
    start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysSinceMonday);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    label = "This week";
  } else {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    label = "This month";
  }

  const toDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")}`;
  const startDate = toDateKey(start);
  const endDate = toDateKey(end);
  const dateRange =
    startDate === endDate ? fmtDate(startDate) : `${fmtDate(startDate)} – ${fmtDate(endDate)}`;

  return { startDate, endDate, label, dateRange };
}

export function filterPermitsByPeriod<T extends { workDate: string }>(
  permits: T[],
  period: PermitPeriod,
  now = new Date(),
) {
  const { startDate, endDate } = getPermitPeriodRange(period, now);
  return permits.filter((permit) => {
    const workDate = permit.workDate.slice(0, 10);
    return workDate >= startDate && workDate <= endDate;
  });
}
