const WIDTH = 1500;
const HEIGHT = 2000;

// Crops the image to a centred 3:4 portrait and re-encodes it as JPEG, so every poster fills its frame and
// uploads stay small whatever the host picks. Small images are kept at their own size rather than stretched.
export async function preparePoster(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await createImageBitmap(file);

  const ratio = WIDTH / HEIGHT;
  const cropWidth = Math.min(bitmap.width, bitmap.height * ratio);
  const cropHeight = cropWidth / ratio;
  const scale = Math.min(1, WIDTH / cropWidth);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cropWidth * scale);
  canvas.height = Math.round(cropHeight * scale);
  const ctx = canvas.getContext("2d")!;
  // JPEG has no transparency, so give see-through images the page's paper colour instead of black.
  ctx.fillStyle = "#eeeae3";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - cropWidth) / 2, (bitmap.height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("Couldn't read that image.");
  return blob;
}

export async function uploadPoster(poster: Blob): Promise<string> {
  const body = new FormData();
  body.append("file", new File([poster], "poster.jpg", { type: "image/jpeg" }));
  const res = await fetch("/api/poster", { method: "POST", body });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Poster upload failed");
  return json.url as string;
}
