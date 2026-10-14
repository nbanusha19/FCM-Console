import { qrDataUrl } from "@/lib/qr";

type PassData = {
  visitor_name: string;
  company: string;
  visitor_code: string;
  qr_value: string;
  request_no?: string;
  visit_date: string;
  expected_arrival: string;
  expected_departure: string;
  host_name: string;
  requested_by_name?: string;
  status: string;
  photo?: string | null;
};

/** Draws the pass onto a canvas and downloads it as a PNG the visitor can keep in their photos. */
export async function downloadPass(v: PassData) {
  const W = 720,
    H = 1080;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#0f3d5e";
  g.fillRect(0, 0, W, 200);
  g.fillStyle = "#ffffff";
  g.font = "600 22px sans-serif";
  g.fillText("FCM CONSOLE · VISITOR PASS", 48, 60);
  g.font = "800 44px sans-serif";
  g.fillText(v.visitor_name.slice(0, 18), 48, 125);
  g.font = "400 26px sans-serif";
  g.fillText((v.company || "").slice(0, 24), 48, 168);
  if (v.photo) {
    const photoBlob = await (await fetch(v.photo)).blob();
    const photo = await createImageBitmap(photoBlob);
    g.save();
    g.beginPath();
    g.roundRect(552, 36, 120, 120, 18);
    g.clip();
    g.drawImage(photo, 552, 36, 120, 120);
    g.restore();
    photo.close();
  }
  const qrData = await qrDataUrl(v.qr_value, 440);
  const blob = await (await fetch(qrData)).blob();
  const img = await createImageBitmap(blob);
  g.drawImage(img, (W - 440) / 2, 240, 440, 440);
  g.fillStyle = "#111111";
  g.textAlign = "center";
  g.font = "600 52px monospace";
  g.fillText(v.visitor_code, W / 2, 750);
  g.font = "600 24px sans-serif";
  g.fillStyle = "#0f3d5e";
  g.fillText(v.status === "CHECKED_IN" ? "CHECKED IN" : "APPROVED", W / 2, 795);
  g.textAlign = "left";
  g.fillStyle = "#111111";
  g.font = "400 26px sans-serif";
  g.fillText(`Date: ${v.visit_date}`, 48, 870);
  g.fillText(`Time: ${v.expected_arrival}–${v.expected_departure}`, 48, 912);
  g.fillText(`Host: ${v.host_name || v.requested_by_name}`, 48, 954);
  g.fillStyle = "#666666";
  g.font = "400 20px sans-serif";
  g.fillText("Show this pass and a photo ID at the gate.", 48, 1030);
  const a = document.createElement("a");
  a.href = c.toDataURL("image/png");
  a.download = `visitor-pass-${v.visitor_code}.png`;
  a.click();
}
