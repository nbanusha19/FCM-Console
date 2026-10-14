export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(input?: string | null) {
  if (!input) return "—";
  const d = new Date(input.length <= 10 ? `${input}T00:00:00` : input);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatTime(input?: string | null) {
  if (!input) return "—";
  if (/^\d{2}:\d{2}$/.test(input)) {
    const [h = 0, m = 0] = input.split(":").map(Number);
    return to12h(h, m);
  }
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return to12h(d.getHours(), d.getMinutes());
}

function to12h(h: number, m: number) {
  const suffix = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${String(hh).padStart(2, "0")}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatDateTime(input?: string | null) {
  if (!input) return "—";
  return `${formatDate(input)} · ${formatTime(input)}`;
}

export function relativeTime(input: string) {
  const diff = Date.now() - new Date(input).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function durationBetween(from?: string | null, to?: string | null) {
  if (!from) return "—";
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  const mins = Math.max(0, Math.round((end - start) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function timeToMinutes(t: string) {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
}

export function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
