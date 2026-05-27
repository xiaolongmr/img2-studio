"use client";

export const IMAGE_ASYNC_RELAY_FORCE_ENABLE_KEY =
  "studio.image-async-relay.force-enable.v1";
const DEFAULT_FORCE_ASYNC_RELAY_ENABLED = true;

export function getImageAsyncRelayForceEnabled() {
  if (typeof window === "undefined") {
    return DEFAULT_FORCE_ASYNC_RELAY_ENABLED;
  }
  try {
    const raw = window.localStorage.getItem(IMAGE_ASYNC_RELAY_FORCE_ENABLE_KEY);
    if (raw == null) {
      return DEFAULT_FORCE_ASYNC_RELAY_ENABLED;
    }
    return raw === "1";
  } catch {
    return DEFAULT_FORCE_ASYNC_RELAY_ENABLED;
  }
}

export function setImageAsyncRelayForceEnabled(value: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      IMAGE_ASYNC_RELAY_FORCE_ENABLE_KEY,
      value ? "1" : "0",
    );
  } catch {
    // ignore localStorage failures
  }
}
