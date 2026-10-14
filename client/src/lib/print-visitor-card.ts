import type { Visit } from "@/lib/types";
import { APP_NAME } from "@/constants/brand";
import { formatDate, formatTime } from "@/lib/format";
import { branchName, employeeName, visitorOrigin } from "@/services/vms";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function printVisitorCard(visit: Visit, options?: { showPhoto?: boolean }) {
  const showPhoto = options?.showPhoto !== false;
  const visitorId = visit.visitorId ?? visit.requestId;
  const initial = escapeHtml((visit.name.trim()[0] || "V").toUpperCase());
  const photo =
    showPhoto && visit.photoUrl
      ? `<img class="photo" src="${escapeHtml(visit.photoUrl)}" alt="" />`
      : `<div class="photo fallback">${initial}<span>PHOTO</span></div>`;
  const company = [visitorOrigin(visit), visit.designation].filter(Boolean).join(" · ");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title></title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body {
      margin: 0;
      padding: 0;
      width: 210mm;
      height: 297mm;
      background: #fff;
      font-family: Manrope, Inter, Segoe UI, sans-serif;
    }
    body {
      display: flex;
      align-items: stretch;
      justify-content: center;
      padding: 6mm;
    }
    .card {
      width: 100%;
      height: 100%;
      padding: 16mm 14mm;
      border-radius: 10mm;
      overflow: hidden;
      color: #fff;
      background: linear-gradient(160deg, #2563eb 0%, #1d4ed8 48%, #1e3a8a 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .top {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand {
      font-size: 13pt;
      font-weight: 800;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      opacity: 0.9;
    }
    .id {
      font-family: ui-monospace, Consolas, monospace;
      font-size: 12pt;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .photo, img.photo {
      width: 58mm;
      height: 58mm;
      margin-top: 14mm;
      border-radius: 6mm;
      object-fit: cover;
      background: rgba(255,255,255,0.2);
      border: 1mm solid rgba(255,255,255,0.35);
    }
    .fallback {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 28pt;
      font-weight: 800;
    }
    .fallback span {
      margin-top: 2mm;
      font-size: 9pt;
      letter-spacing: 0.18em;
      opacity: 0.85;
    }
    h1 {
      margin: 8mm 0 0;
      font-size: 32pt;
      line-height: 1.1;
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    .meta {
      margin: 3mm 0 0;
      font-size: 14pt;
      font-weight: 600;
      opacity: 0.9;
    }
    .details {
      width: 100%;
      max-width: 130mm;
      margin-top: 12mm;
      padding-top: 6mm;
      border-top: 0.4mm solid rgba(255,255,255,0.28);
    }
    .line {
      display: flex;
      justify-content: space-between;
      gap: 8mm;
      margin: 3.2mm 0;
      font-size: 13pt;
    }
    .label { opacity: 0.75; font-weight: 600; }
    .value { font-weight: 800; text-align: right; }
    .foot {
      margin-top: auto;
      padding-top: 8mm;
      width: 100%;
      display: flex;
      justify-content: center;
      border-top: 0.4mm solid rgba(255,255,255,0.28);
    }
    .foot .id { font-size: 14pt; }
  </style>
</head>
<body>
  <article class="card">
    <div class="top">
      <div class="brand">${escapeHtml(APP_NAME)} visitor</div>
      <div class="id">${escapeHtml(visitorId)}</div>
    </div>
    ${photo}
    <h1>${escapeHtml(visit.name)}</h1>
    <p class="meta">${escapeHtml(company)}</p>
    <div class="details">
      <div class="line"><span class="label">Host</span><span class="value">${escapeHtml(employeeName(visit.hostEmployeeId))}</span></div>
      <div class="line"><span class="label">Branch</span><span class="value">${escapeHtml(branchName(visit.branchId))}</span></div>
      <div class="line"><span class="label">Visit date</span><span class="value">${escapeHtml(formatDate(visit.visitDate))}</span></div>
      <div class="line"><span class="label">Check-in</span><span class="value">${escapeHtml(formatTime(visit.checkInAt))}</span></div>
      <div class="line"><span class="label">Valid until</span><span class="value">${escapeHtml(formatTime(visit.expectedDeparture))}</span></div>
    </div>
    <div class="foot">
      <div class="id">${escapeHtml(visit.cardNumber ?? visitorId)}</div>
    </div>
  </article>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => iframe.remove();
  const runPrint = () => {
    win.focus();
    win.print();
    setTimeout(cleanup, 1000);
  };

  win.addEventListener("afterprint", cleanup);

  const image = doc.querySelector("img");
  if (image && !image.complete) {
    image.addEventListener("load", () => setTimeout(runPrint, 50), { once: true });
    image.addEventListener("error", () => setTimeout(runPrint, 50), { once: true });
  } else {
    setTimeout(runPrint, 80);
  }
}
