export async function printVisitorPass() {
  const pass = document.querySelector<HTMLElement>(".visitor-pass-print-area");
  if (!pass) throw new Error("Visitor pass is not available for printing.");

  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("Allow pop-ups to print the visitor pass.");

  const stylesheets = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
    .map((link) => `<link rel="stylesheet" href="${link.href}">`)
    .join("");
  const inlineStyles = [...document.querySelectorAll<HTMLStyleElement>("style")]
    .map((style) => `<style>${style.textContent ?? ""}</style>`)
    .join("");

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Visitor pass</title>
        ${stylesheets}
        ${inlineStyles}
        <style>
          @page { size: A4 portrait; margin: 0; }
          @media print {
            html, body { width: 210mm !important; height: 297mm !important; margin: 0 !important; overflow: hidden !important; }
            body { display: grid !important; place-items: center !important; }
            body * { visibility: visible !important; }
            .visitor-pass-print-area {
              position: relative !important; inset: auto !important; transform: none !important;
              width: 86mm !important; max-width: 86mm !important; height: auto !important;
              max-height: 277mm !important; margin: 0 !important; overflow: visible !important;
              color: #1f2937 !important; background: #fff !important;
              -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
              break-inside: avoid !important; page-break-inside: avoid !important;
            }
            .visitor-pass-print-area button, .visitor-pass-print-area .print\\:hidden {
              display: none !important; visibility: hidden !important;
            }
          }
        </style>
      </head>
      <body>${pass.outerHTML}</body>
    </html>`);
  printWindow.document.close();

  await Promise.all(
    [...printWindow.document.querySelectorAll("link[rel='stylesheet']")].map(
      (link) =>
        new Promise<void>((resolve) => {
          if ((link as HTMLLinkElement).sheet) {
            resolve();
            return;
          }
          link.addEventListener("load", () => resolve(), { once: true });
          link.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );

  await Promise.all(
    [...printWindow.document.images].map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );

  printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
  printWindow.focus();
  printWindow.print();
}
