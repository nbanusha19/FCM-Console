import { useEffect, useState } from "react";
import { qrDataUrl } from "@/lib/qr";

export function QrImage({
  value,
  label,
  size = 220,
}: {
  value: string;
  label?: string;
  size?: number;
}) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let active = true;
    setSrc("");
    void qrDataUrl(value, size)
      .then((dataUrl) => {
        if (active) setSrc(dataUrl);
      })
      .catch(() => {
        if (active) setSrc("");
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  return (
    <figure className="flex flex-col items-center gap-2">
      <img
        src={src || undefined}
        alt={label ?? "QR code"}
        width={size}
        height={size}
        className="rounded-xl border border-border bg-white p-2"
      />
      {label ? (
        <figcaption className="text-center text-[12px] text-muted-foreground">{label}</figcaption>
      ) : null}
    </figure>
  );
}
