"use client";

export const IMAGE_ASYNC_RELAY_FORCE_ENABLE_KEY =
  "studio.image-async-relay.force-enable.v1";

export function getImageAsyncRelayForceEnabled() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(IMAGE_ASYNC_RELAY_FORCE_ENABLE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setImageAsyncRelayForceEnabled(value: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (value) {
      window.localStorage.setItem(IMAGE_ASYNC_RELAY_FORCE_ENABLE_KEY, "1");
    } else {
      window.localStorage.removeItem(IMAGE_ASYNC_RELAY_FORCE_ENABLE_KEY);
    }
  } catch {
    // ignore localStorage failures
  }
}
