import { getData, KEYS, saveData } from "@/services/storage";

function readMap(key: typeof KEYS.visitorCardPhotos | typeof KEYS.issuedVisitorCards): Record<string, string> {
  const value = getData<unknown>(key, {});
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export function getVisitorCardPhoto(visitId: string) {
  return readMap(KEYS.visitorCardPhotos)[visitId] ?? null;
}

export function saveVisitorCardPhoto(visitId: string, photo: string) {
  const photos = readMap(KEYS.visitorCardPhotos);
  photos[visitId] = photo;
  saveData(KEYS.visitorCardPhotos, photos);
}

export function hasIssuedVisitorCard(visitId: string) {
  return readMap(KEYS.issuedVisitorCards)[visitId] === "true";
}

export function listIssuedVisitorCardIds() {
  return Object.entries(readMap(KEYS.issuedVisitorCards))
    .filter(([, issued]) => issued === "true")
    .map(([visitId]) => visitId);
}

export function markVisitorCardIssued(visitId: string) {
  if (!getVisitorCardPhoto(visitId)) throw new Error("Capture or upload a visitor photo before issuing the card.");
  if (hasIssuedVisitorCard(visitId)) throw new Error("A visitor card has already been issued for this visit.");
  const issued = readMap(KEYS.issuedVisitorCards);
  issued[visitId] = "true";
  saveData(KEYS.issuedVisitorCards, issued);
}
