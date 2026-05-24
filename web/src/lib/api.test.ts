import { beforeEach, describe, expect, it, vi } from "vitest";

const httpRequestMock = vi.hoisted(() => vi.fn());
const getStoredApiBaseUrlMock = vi.hoisted(() => vi.fn(() => ""));
const getImageAsyncRelayForceEnabledMock = vi.hoisted(() => vi.fn(() => false));
const getImageStreamPartialImagesMock = vi.hoisted(() => vi.fn(() => 1));
const getStoredAuthKeyMock = vi.hoisted(() => vi.fn(async () => ""));
const originalWindow = globalThis.window;

vi.mock("@/lib/request", () => ({
  httpRequest: httpRequestMock,
}));

vi.mock("@/constants/common-env", () => ({
  default: {
    apiUrl: "",
  },
}));

vi.mock("@/store/auth", () => ({
  getStoredAuthKey: getStoredAuthKeyMock,
  clearStoredAuthKey: vi.fn(),
}));

vi.mock("@/store/api-base-url", () => ({
  getStoredApiBaseUrl: getStoredApiBaseUrlMock,
}));

vi.mock("@/store/image-async-relay", () => ({
  getImageAsyncRelayForceEnabled: getImageAsyncRelayForceEnabledMock,
}));

vi.mock("@/store/image-stream-preview", () => ({
  getImageStreamPartialImages: getImageStreamPartialImagesMock,
}));

import {
  editImage,
  getImageModelForSize,
  generateImageWithOptions,
  PUBLIC_4K_IMAGE_MODEL,
  PUBLIC_IMAGE_MODEL,
  resolveImageRequestModel,
} from "./api";

function mockFetchTextResponse(
  body: string,
  contentType = "text/event-stream",
  status = 200,
) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": contentType }),
    text: vi.fn(async () => body),
    body: undefined,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("image API requests", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    httpRequestMock.mockReset();
    httpRequestMock.mockResolvedValue({ created: 0, data: [] });
    getStoredApiBaseUrlMock.mockReset();
    getStoredApiBaseUrlMock.mockReturnValue("");
    getImageAsyncRelayForceEnabledMock.mockReset();
    getImageAsyncRelayForceEnabledMock.mockReturnValue(false);
    getImageStreamPartialImagesMock.mockReset();
    getImageStreamPartialImagesMock.mockReturnValue(1);
    getStoredAuthKeyMock.mockReset();
    getStoredAuthKeyMock.mockResolvedValue("");
    if (typeof originalWindow === "undefined") {
      // @ts-expect-error test-only override
      delete globalThis.window;
    } else {
      // @ts-expect-error test-only override
      globalThis.window = originalWindow;
    }
  });

  it("marks image generation requests as async relay jobs", async () => {
    await generateImageWithOptions("draw a moon", { count: 1 });

    expect(httpRequestMock).toHaveBeenCalledWith(
      "/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: { "X-Rivermoon-Async": "1" },
        body: expect.objectContaining({
          model: "gpt-image-2",
          n: 1,
        }),
      }),
    );
  });

  it("does not attach async relay header for cross-origin API base URLs", async () => {
    // @ts-expect-error test-only window shim
    globalThis.window = { location: { origin: "http://localhost:5176" } };
    getStoredApiBaseUrlMock.mockReturnValue("https://api.denxio.top");

    await generateImageWithOptions("draw a moon", { count: 1 });

    expect(httpRequestMock).toHaveBeenCalledWith(
      "/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: {},
      }),
    );
  });

  it("keeps async relay header for same-origin API base URLs", async () => {
    // @ts-expect-error test-only window shim
    globalThis.window = { location: { origin: "http://localhost:5176" } };
    getStoredApiBaseUrlMock.mockReturnValue("http://localhost:5176");

    await generateImageWithOptions("draw a moon", { count: 1 });

    expect(httpRequestMock).toHaveBeenCalledWith(
      "/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: { "X-Rivermoon-Async": "1" },
      }),
    );
  });

  it("attaches async relay header when force-enabled on cross-origin API base URLs", async () => {
    // @ts-expect-error test-only window shim
    globalThis.window = { location: { origin: "http://localhost:5176" } };
    getStoredApiBaseUrlMock.mockReturnValue("https://api.denxio.top");
    getImageAsyncRelayForceEnabledMock.mockReturnValue(true);
    const fetchMock = mockFetchTextResponse(
      'data: {"type":"image_generation.completed","b64_json":"force-enabled"}',
    );

    await generateImageWithOptions("draw a moon", { count: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(requestInit.headers as HeadersInit);
    const body = JSON.parse(String(requestInit.body)) as Record<string, unknown>;
    expect(headers.get("x-rivermoon-async")).toBeNull();
    expect(body.stream).toBe(true);
    expect(body.partial_images).toBe(1);
  });

  it("uses configured partial_images count in stream mode", async () => {
    getImageAsyncRelayForceEnabledMock.mockReturnValue(true);
    getImageStreamPartialImagesMock.mockReturnValue(3);
    const fetchMock = mockFetchTextResponse(
      'data: {"type":"image_generation.completed","b64_json":"partial-count"}',
    );

    await generateImageWithOptions("draw a moon", { count: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body)) as Record<string, unknown>;
    expect(body.stream).toBe(true);
    expect(body.partial_images).toBe(3);
  });

  it("parses SSE stream chunks into an image response", async () => {
    getImageAsyncRelayForceEnabledMock.mockReturnValue(true);
    mockFetchTextResponse(
      [
        'data: {"type":"image_generation.started"}',
        'data: {"type":"image_generation.completed","b64_json":"abc123"}',
        "data: [DONE]",
      ].join("\n"),
    );

    const result = await generateImageWithOptions("draw a moon", { count: 1 });

    expect(result.data).toEqual([{ b64_json: "abc123" }]);
  });

  it("parses stream responses with partial_image_b64 payloads", async () => {
    getImageAsyncRelayForceEnabledMock.mockReturnValue(true);
    mockFetchTextResponse(
      [
        'data: {"type":"image_generation.partial_image","partial_image_b64":"preview1","partial_image_index":0}',
        'data: {"type":"image_generation.completed","b64_json":"final456"}',
        "data: [DONE]",
      ].join("\n\n"),
    );

    const result = await generateImageWithOptions("draw a moon", { count: 1 });

    expect(result.data).toEqual([{ b64_json: "final456" }]);
  });

  it("parses stream responses that end without [DONE]", async () => {
    getImageAsyncRelayForceEnabledMock.mockReturnValue(true);
    mockFetchTextResponse(
      [
        'data: {"type":"image_generation.partial_image","b64_json":"preview-no-done"}',
        'data: {"type":"image_generation.completed","b64_json":"final-no-done"}',
      ].join("\n"),
    );

    const result = await generateImageWithOptions("draw a moon", { count: 1 });

    expect(result.data).toEqual([{ b64_json: "final-no-done" }]);
  });

  it("parses stream responses when preview callback is not provided", async () => {
    getImageAsyncRelayForceEnabledMock.mockReturnValue(true);
    mockFetchTextResponse(
      [
        'data: {"type":"image_generation.partial_image","b64_json":"preview-no-callback"}',
        'data: {"type":"image_generation.completed","b64_json":"final-no-callback"}',
      ].join("\n"),
    );

    const result = await generateImageWithOptions("draw a moon", { count: 1 });

    expect(result.data).toEqual([{ b64_json: "final-no-callback" }]);
  });

  it("parses plain JSON stream fallback responses with UTF-8 BOM", async () => {
    getImageAsyncRelayForceEnabledMock.mockReturnValue(true);
    mockFetchTextResponse(
      `\uFEFF${JSON.stringify({
        type: "image_generation.completed",
        b64_json: "bom-json-final",
      })}`,
      "application/json",
    );

    const result = await generateImageWithOptions("draw a moon", { count: 1 });

    expect(result.data).toEqual([{ b64_json: "bom-json-final" }]);
  });

  it("treats image_edit.completed events as final stream responses", async () => {
    getImageAsyncRelayForceEnabledMock.mockReturnValue(true);
    mockFetchTextResponse(
      [
        'data: {"type":"image_generation.partial_image","b64_json":"preview-edit"}',
        'data: {"type":"image_edit.completed","b64_json":"final-edit"}',
      ].join("\n"),
    );

    const result = await generateImageWithOptions("draw a moon", { count: 1 });

    expect(result.data).toEqual([{ b64_json: "final-edit" }]);
  });

  it("parses plain JSON stream fallback responses with top-level b64_json", async () => {
    getImageAsyncRelayForceEnabledMock.mockReturnValue(true);
    mockFetchTextResponse(
      JSON.stringify({
        type: "image_generation.completed",
        b64_json: "plain-json-final",
      }),
      "application/json",
    );

    const result = await generateImageWithOptions("draw a moon", { count: 1 });

    expect(result.data).toEqual([{ b64_json: "plain-json-final" }]);
  });

  it("sends PNG image generation requests without compression", async () => {
    await generateImageWithOptions("draw a moon", {
      count: 1,
      outputFormat: "png",
      outputCompression: 85,
    });

    expect(httpRequestMock).toHaveBeenCalledWith(
      "/v1/images/generations",
      expect.objectContaining({
        body: expect.objectContaining({
          n: 1,
          output_format: "png",
        }),
      }),
    );
    const [, options] = httpRequestMock.mock.calls[0];
    expect(options.body).not.toHaveProperty("output_compression");
  });

  it("sends JPEG image generation requests with compression", async () => {
    await generateImageWithOptions("draw a moon", {
      count: 1,
      outputFormat: "jpeg",
      outputCompression: 85,
    });

    expect(httpRequestMock).toHaveBeenCalledWith(
      "/v1/images/generations",
      expect.objectContaining({
        body: expect.objectContaining({
          n: 1,
          output_format: "jpeg",
          output_compression: 85,
        }),
      }),
    );
  });

  it("uses the 4K image model for true 4K generation sizes", async () => {
    await generateImageWithOptions("draw a moon", {
      count: 1,
      size: "3840x2160",
    });

    expect(httpRequestMock).toHaveBeenCalledWith(
      "/v1/images/generations",
      expect.objectContaining({
        body: expect.objectContaining({
          model: "gpt-image-2",
          n: 1,
          size: "3840x2160",
        }),
      }),
    );
  });

  it("does not let the legacy default model override true 4K generation sizes", async () => {
    await generateImageWithOptions("draw a moon", {
      model: PUBLIC_IMAGE_MODEL,
      count: 1,
      size: "2160x3840",
    });

    expect(httpRequestMock).toHaveBeenCalledWith(
      "/v1/images/generations",
      expect.objectContaining({
        body: expect.objectContaining({
          model: "gpt-image-2",
          n: 1,
          size: "2160x3840",
        }),
      }),
    );
  });

  it("keeps 2K generation sizes on the standard image model", async () => {
    await generateImageWithOptions("draw a moon", {
      count: 1,
      size: "2048x2048",
    });

    expect(httpRequestMock).toHaveBeenCalledWith(
      "/v1/images/generations",
      expect.objectContaining({
        body: expect.objectContaining({
          model: "gpt-image-2",
          n: 1,
          size: "2048x2048",
        }),
      }),
    );
  });

  it("marks image edit requests as async relay jobs", async () => {
    await editImage({
      prompt: "change the color",
      images: [new File(["image"], "source.png", { type: "image/png" })],
      count: 1,
    });

    const [, options] = httpRequestMock.mock.calls[0];
    expect(options).toMatchObject({
      method: "POST",
      headers: { "X-Rivermoon-Async": "1" },
    });
    expect(options.body.get("model")).toBe("gpt-image-2");
    expect(options.body.get("n")).toBe("1");
    expect(options.body.getAll("image")).toHaveLength(1);
  });

  it("sends WebP image edit requests through multipart fields", async () => {
    await editImage({
      prompt: "change the color",
      images: [new File(["image"], "source.png", { type: "image/png" })],
      count: 1,
      outputFormat: "webp",
      outputCompression: 85,
    });

    const [, options] = httpRequestMock.mock.calls[0];
    expect(options.body.get("output_format")).toBe("webp");
    expect(options.body.get("output_compression")).toBe("85");
    expect(options.body.get("n")).toBe("1");
  });

  it("uses the 4K image model for true 4K edit sizes", async () => {
    await editImage({
      prompt: "change the color",
      images: [new File(["image"], "source.png", { type: "image/png" })],
      count: 1,
      size: "2160x3840",
    });

    const [, options] = httpRequestMock.mock.calls[0];
    expect(options.body.get("model")).toBe("gpt-image-2");
    expect(options.body.get("size")).toBe("2160x3840");
  });

  it("does not let the legacy default model override true 4K edit sizes", async () => {
    await editImage({
      prompt: "change the color",
      images: [new File(["image"], "source.png", { type: "image/png" })],
      model: PUBLIC_IMAGE_MODEL,
      count: 1,
      size: "2160x3840",
    });

    const [, options] = httpRequestMock.mock.calls[0];
    expect(options.body.get("model")).toBe("gpt-image-2");
  });

  it("classifies only true 4K and larger sizes as gpt-image-2", () => {
    expect(getImageModelForSize("1024x1024")).toBe(PUBLIC_IMAGE_MODEL);
    expect(getImageModelForSize("2048x2048")).toBe(PUBLIC_IMAGE_MODEL);
    expect(getImageModelForSize("2048x1152")).toBe(PUBLIC_IMAGE_MODEL);
    expect(getImageModelForSize("3840x2160")).toBe(PUBLIC_4K_IMAGE_MODEL);
    expect(getImageModelForSize("2160x3840")).toBe(PUBLIC_4K_IMAGE_MODEL);
    expect(getImageModelForSize("4096x4096")).toBe(PUBLIC_4K_IMAGE_MODEL);
    expect(getImageModelForSize("auto")).toBe(PUBLIC_IMAGE_MODEL);
  });

  it("resolves the stored/display model from the requested size", () => {
    expect(resolveImageRequestModel("1024x1024", PUBLIC_IMAGE_MODEL)).toBe(
      PUBLIC_IMAGE_MODEL,
    );
    expect(resolveImageRequestModel("2160x3840", PUBLIC_IMAGE_MODEL)).toBe(
      PUBLIC_4K_IMAGE_MODEL,
    );
  });

  it("polls async image edit jobs until the final image response is available", async () => {
    httpRequestMock
      .mockResolvedValueOnce({
        object: "rivermoon_image_job",
        id: "job-1",
        status: "queued",
        poll_after_ms: 1,
      })
      .mockResolvedValueOnce({
        object: "rivermoon_image_job",
        id: "job-1",
        status: "running",
        poll_after_ms: 1,
      })
      .mockResolvedValueOnce({
        object: "rivermoon_image_job",
        id: "job-1",
        status: "succeeded",
        response_status: 200,
        content_type: "application/json",
        body: {
          created: 1,
          data: [{ b64_json: "final-image" }],
        },
      });

    const result = await editImage({
      prompt: "change the color",
      images: [new File(["image"], "source.png", { type: "image/png" })],
      count: 1,
    });

    expect(result.data).toEqual([{ b64_json: "final-image" }]);
    expect(httpRequestMock.mock.calls.map(([path]) => path)).toEqual([
      "/v1/images/edits",
      "/v1/images/edits?job_id=job-1",
      "/v1/images/edits?job_id=job-1",
    ]);
  });
});
