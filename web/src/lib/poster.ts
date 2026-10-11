const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1600;

// Scales the image down in the browser and re-encodes it as JPEG, so uploads stay small whatever the host picks.
export async function preparePoster(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  // JPEG has no transparency, so give see-through images the page's paper colour instead of black.
  ctx.fillStyle = "#eeeae3";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
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
