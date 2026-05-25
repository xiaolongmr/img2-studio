import type { ImageConversation, StoredImage, StoredSourceImage } from "@/store/image-conversations";
import webConfig from "@/constants/common-env";

function normalizeImageURL(url?: string) {
  const trimmed = String(url || "").trim();
  if (!trimmed) {
    return "";
  }
  if (/^(data:|https?:\/\/)/i.test(trimmed)) {
    return trimmed;
  }
  const base = webConfig.apiUrl.replace(/\/$/, "");
  return `${base}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
}

export function buildImageDataUrl(image: StoredImage) {
  const cached = imageDataUrlCache.get(image);
  if (typeof cached === "string") {
    return cached;
  }
  let nextValue = "";
  if (image.url) {
    nextValue = normalizeImageURL(image.url);
  } else if (image.b64_json) {
    nextValue = `data:${image.mime_type || "image/png"};base64,${image.b64_json}`;
  }
  imageDataUrlCache.set(image, nextValue);
  return nextValue;
}

export function buildSourceImageUrl(source: StoredSourceImage) {
  return normalizeImageURL(source.dataUrl || source.url);
}

export function buildConversationSourceLabel(source: StoredSourceImage) {
  return source.role === "mask" ? "选区 / 遮罩" : "源图";
}

export function buildConversationPreviewSource(conversation: ImageConversation) {
  const cached = conversationPreviewSourceCache.get(conversation);
  if (typeof cached === "string") {
    return cached;
  }
  const latestSuccessfulImage = conversation.images.find(
    (image) => image.status === "success" && (image.b64_json || image.url),
  );
  if (latestSuccessfulImage) {
    const nextValue = buildImageDataUrl(latestSuccessfulImage);
    conversationPreviewSourceCache.set(conversation, nextValue);
    return nextValue;
  }

  const firstSourceImage = conversation.sourceImages?.find((item) => item.role === "image");
  const nextValue = firstSourceImage ? buildSourceImageUrl(firstSourceImage) : "";
  conversationPreviewSourceCache.set(conversation, nextValue);
  return nextValue;
}

const imageDataUrlCache = new WeakMap<StoredImage, string>();
const conversationPreviewSourceCache = new WeakMap<ImageConversation, string>();
