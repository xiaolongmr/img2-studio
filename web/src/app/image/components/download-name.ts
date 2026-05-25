"use client";

import type { ImageOutputFormat } from "@/lib/api";
import type { StoredImage } from "@/store/image-conversations";

function mimeTypeToExtension(mimeType: string | undefined) {
  const normalized = String(mimeType || "").trim().toLowerCase();
  if (normalized === "image/jpeg" || normalized === "image/jpg") {
    return "jpg";
  }
  if (normalized === "image/png") {
    return "png";
  }
  if (normalized === "image/webp") {
    return "webp";
  }
  return "";
}

function outputFormatToExtension(outputFormat: ImageOutputFormat | undefined) {
  if (outputFormat === "jpeg") {
    return "jpg";
  }
  if (outputFormat === "png" || outputFormat === "webp") {
    return outputFormat;
  }
  return "";
}

function extractDataUrlMimeType(raw: string | undefined) {
  const match = String(raw || "").match(/^data:([^;,]+)[;,]/i);
  return match?.[1] || "";
}

export function buildDownloadName(
  createdAt: string,
  turnId: string,
  index: number,
  image?: Pick<StoredImage, "mime_type" | "url">,
  outputFormat?: ImageOutputFormat,
) {
  const extension =
    mimeTypeToExtension(image?.mime_type) ||
    mimeTypeToExtension(extractDataUrlMimeType(image?.url)) ||
    outputFormatToExtension(outputFormat) ||
    "jpg";
  const date = new Date(createdAt);
  const safeIndex = String(index + 1).padStart(2, "0");
  if (Number.isNaN(date.getTime())) {
    return `chatgpt-image-${turnId.slice(0, 8)}-${safeIndex}.${extension}`;
  }

  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const sec = String(date.getSeconds()).padStart(2, "0");
  return `chatgpt-image-${yyyy}${mm}${dd}-${hh}${min}${sec}-${safeIndex}.${extension}`;
}
