import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function appUrl(path: string) {
  const configuredOrigin = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  const configuredHost = configuredOrigin ? new URL(configuredOrigin).hostname : "";
  const isPlaceholderOrigin = configuredHost
    .split(".")
    .some((label) => label.startsWith("your-") || label === "example");
  const origin = configuredOrigin && !isPlaceholderOrigin
    ? configuredOrigin
    : window.location.origin;
  return new URL(path, origin).toString();
}

export function isLoopbackUrl(value: string) {
  const hostname = new URL(value).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
