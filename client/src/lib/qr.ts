import QRCode from "qrcode";

export function qrDataUrl(value: string, size = 240): Promise<string> {
  return QRCode.toDataURL(value, {
    width: size,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}
