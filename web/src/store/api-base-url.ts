"use client";

import webConfig from "@/constants/common-env";

export const API_BASE_URL_STORAGE_KEY = "rivermoon_api_base_url";

function normalizeApiBaseUrl(value: string) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/v1$/i, "");
}

export function getDefaultApiBaseUrl() {
  return normalizeApiBaseUrl(webConfig.apiUrl);
}

export function getStoredApiBaseUrl() {
  if (typeof window === "undefined") {
    return getDefaultApiBaseUrl();
  }
  try {
    return (
      normalizeApiBaseUrl(
        window.localStorage.getItem(API_BASE_URL_STORAGE_KEY) || "",
      ) || getDefaultApiBaseUrl()
    );
  } catch {
    return getDefaultApiBaseUrl();
  }
}

export function setStoredApiBaseUrl(value: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const normalized = normalizeApiBaseUrl(value);
    if (normalized) {
      window.localStorage.setItem(API_BASE_URL_STORAGE_KEY, normalized);
    } else {
      window.localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
    }
  } catch {
    // ignore localStorage errors
  }
}
