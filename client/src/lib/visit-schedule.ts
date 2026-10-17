function businessDateTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${value["year"]}-${value["month"]}-${value["day"]}`,
    time: `${value["hour"]}:${value["minute"]}`,
  };
}

export function todayBusinessISO() {
  return businessDateTime().date;
}

export function businessTimeAfter(minutes: number, now = new Date()) {
  return businessDateTime(new Date(now.getTime() + minutes * 60_000)).time;
}

export function isPastVisitStart(visitDate: string, arrival: string, now = new Date()) {
  if (!/^\d{2}:\d{2}$/.test(arrival)) return false;
  const current = businessDateTime(now);
  if (visitDate < current.date) return true;
  return visitDate === current.date && arrival <= current.time;
}
