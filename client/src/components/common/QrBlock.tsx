import { QrImage } from "@/components/common/QrImage";

export function QrBlock({
  value,
  size = 48,
}: {
  value: string;
  size?: number;
  tone?: "light" | "dark";
}) {
  return <QrImage value={value} size={size} />;
}
