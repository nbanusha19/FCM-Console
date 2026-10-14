const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const match = ISO_DATE.exec(value);
    if (match) {
      const year = match[1];
      const month = match[2];
      const day = match[3];
      if (!year || !month || !day) return value;
      const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
      if (
        date.getUTCFullYear() === Number(year) &&
        date.getUTCMonth() === Number(month) - 1 &&
        date.getUTCDate() === Number(day)
      ) {
        const readableDate = `${day}-${MONTHS[Number(month) - 1]}-${year.slice(-2)}`;
        return `="${readableDate}"`;
      }
    }
  }
  return String(value);
}

function escapeCsvValue(value: unknown): string {
  return `"${displayValue(value).replace(/"/g, '""')}"`;
}

export function createCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  return [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => headers.map((_, index) => escapeCsvValue(row[index])).join(",")),
  ].join("\r\n");
}

export function downloadCsv(
  filename: string,
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): void {
  const blob = new Blob([`\uFEFF${createCsv(headers, rows)}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
