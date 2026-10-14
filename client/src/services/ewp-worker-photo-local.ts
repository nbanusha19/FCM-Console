import { getData, KEYS, saveData } from "@/services/storage";

function readPhotos() {
  const value = getData<unknown>(KEYS.ewpWorkerPhotos, {});
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export function getEwpWorkerPhoto(workerId: string) {
  return readPhotos()[workerId] ?? null;
}

export function saveEwpWorkerPhoto(workerId: string, photo: string) {
  const photos = readPhotos();
  photos[workerId] = photo;
  saveData(KEYS.ewpWorkerPhotos, photos);
}
