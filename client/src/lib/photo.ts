export function fileToPhotoDataUrl(file: File, maxSize = 360): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        resolve(elementToPhotoDataUrl(image, maxSize));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Could not read the photo."));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the photo."));
    };
    image.src = url;
  });
}

export function elementToPhotoDataUrl(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  maxSize = 360,
): string {
  const width =
    source instanceof HTMLVideoElement
      ? source.videoWidth
      : source instanceof HTMLImageElement
        ? source.naturalWidth || source.width
        : source.width;
  const height =
    source instanceof HTMLVideoElement
      ? source.videoHeight
      : source instanceof HTMLImageElement
        ? source.naturalHeight || source.height
        : source.height;
  if (!width || !height) throw new Error("Could not read the photo.");

  const canvas = document.createElement("canvas");
  const scale = Math.min(1, maxSize / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read the photo.");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

