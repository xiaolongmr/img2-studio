"use client";

export const IMAGE_STREAM_PARTIAL_IMAGES_KEY =
  "studio.image-stream.partial-images.v1";

const DEFAULT_PARTIAL_IMAGES = 1;

function normalizePartialImages(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_PARTIAL_IMAGES;
  }
  return Math.min(3, Math.max(0, Math.floor(numeric)));
}

export function getImageStreamPartialImages() {
  if (typeof window === "undefined") {
    return DEFAULT_PARTIAL_IMAGES;
  }
  try {
    const raw = window.localStorage.getItem(IMAGE_STREAM_PARTIAL_IMAGES_KEY);
    if (raw == null) {
      return DEFAULT_PARTIAL_IMAGES;
    }
    return normalizePartialImages(raw);
  } catch {
    return DEFAULT_PARTIAL_IMAGES;
  }
}

export function setImageStreamPartialImages(value: number) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      IMAGE_STREAM_PARTIAL_IMAGES_KEY,
      String(normalizePartialImages(value)),
    );
  } catch {
    // ignore localStorage failures
  }
}
