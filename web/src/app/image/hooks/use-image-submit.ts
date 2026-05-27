"use client";

import { useCallback, useRef, type RefObject } from "react";
import { toast } from "sonner";

import {
  editImage,
  generateImageWithOptions,
  resolveImageRequestModel,
  type ImageStreamPreviewEvent,
  type ImageModel,
  type ImageOutputFormat,
  type ImageQuality,
  type ImageResolutionAccess,
} from "@/lib/api";
import { getImageAsyncRelayForceEnabled } from "@/store/image-async-relay";
import { getImageStreamPartialImages } from "@/store/image-stream-preview";
import type {
  ImageConversation,
  ImageConversationTurn,
  ImageMode,
  StoredImage,
  StoredSourceImage,
} from "@/store/image-conversations";

import type { EditorTarget } from "./use-image-source-inputs";
import {
  buildConversationTitle,
  buildReferencedImagePrompt,
  createConversationTurn,
  createLoadingImages,
  dataUrlToFile,
  formatImageError,
  mergeResultImages,
  mergeSingleResultImage,
  runImageFanOutRequests,
} from "../submit-utils";
import { buildSourceImageUrl } from "../view-utils";

type ActiveRequestPayload = {
  conversationId: string;
  turnId: string;
  mode: ImageMode;
  count: number;
  variant: "standard" | "selection-edit";
};

type UseImageSubmitOptions = {
  mode: ImageMode;
  imagePrompt: string;
  imageModel: ImageModel;
  imageSources: StoredSourceImage[];
  maskSource: StoredSourceImage | null;
  sourceImages: StoredSourceImage[];
  parsedCount: number;
  imageSize: string;
  imageResolutionAccess: ImageResolutionAccess;
  imageQuality: ImageQuality;
  imageOutputFormat: ImageOutputFormat;
  outputCompression?: number;
  selectedConversationId: string | null;
  draftSelectionRef: RefObject<boolean>;
  editorTarget: EditorTarget | null;
  makeId: () => string;
  focusConversation: (conversationId: string) => void;
  closeSelectionEditor: () => void;
  setImagePrompt: (value: string) => void;
  setSourceImages: (value: StoredSourceImage[]) => void;
  setSubmitElapsedSeconds: (value: number) => void;
  onRequestStart: (payload: ActiveRequestPayload) => void;
  onRequestFinish: (turnId: string, status: "success" | "error") => void;
  persistConversation: (conversation: ImageConversation) => Promise<void>;
  updateConversation: (
    conversationId: string,
    updater: (current: ImageConversation | null) => ImageConversation,
  ) => Promise<void>;
  resetComposer: (nextMode?: ImageMode) => void;
};

const OUTPUT_COMPRESSION = 85;
const IMAGE_FAN_OUT_CONCURRENCY = 2;
const IMAGE_EDIT_FAN_OUT_CONCURRENCY = 1;

function buildConversationBase(
  conversationId: string,
  draftTurn: ImageConversationTurn,
): ImageConversation {
  return {
    id: conversationId,
    title: draftTurn.title,
    mode: draftTurn.mode,
    prompt: draftTurn.prompt,
    model: draftTurn.model,
    count: draftTurn.count,
    size: draftTurn.size,
    resolutionAccess: draftTurn.resolutionAccess,
    quality: draftTurn.quality,
    outputFormat: draftTurn.outputFormat,
    scale: draftTurn.scale,
    sourceImages: draftTurn.sourceImages,
    images: draftTurn.images,
    createdAt: draftTurn.createdAt,
    status: draftTurn.status,
    error: draftTurn.error,
    turns: [draftTurn],
  };
}

function buildSourceReference(payload: {
  id: string;
  role: "image" | "mask";
  name: string;
  url: string;
  isPrimary?: boolean;
  referenceLabel?: string;
  referenceAlias?: string;
}): StoredSourceImage {
  if (payload.url.startsWith("data:")) {
    return {
      id: payload.id,
      role: payload.role,
      name: payload.name,
      isPrimary: payload.isPrimary,
      referenceLabel: payload.referenceLabel,
      referenceAlias: payload.referenceAlias,
      dataUrl: payload.url,
    };
  }
  return {
    id: payload.id,
    role: payload.role,
    name: payload.name,
    isPrimary: payload.isPrimary,
    referenceLabel: payload.referenceLabel,
    referenceAlias: payload.referenceAlias,
    url: payload.url,
  };
}

function normalizeImageQuality(value: string | undefined, fallback: ImageQuality) {
  const trimmed = String(value || "").trim();
  if (
    trimmed === "low" ||
    trimmed === "medium" ||
    trimmed === "high" ||
    trimmed === "auto"
  ) {
    return trimmed;
  }
  return fallback;
}

async function sourceImageToFile(source: StoredSourceImage, fallbackName: string) {
  const fileName = source.name?.trim() || fallbackName;
  if (source.dataUrl) {
    return dataUrlToFile(source.dataUrl, fileName);
  }

  const url = buildSourceImageUrl(source);
  if (!url) {
    throw new Error(`源图 ${fileName} 缺少图片数据`);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`读取源图失败 (${response.status})`);
  }
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || "image/png" });
}

async function sourceImagesToFiles(sources: StoredSourceImage[]) {
  const imageSources = sources.filter((item) => item.role === "image");
  return Promise.all(
    imageSources.map((source, index) =>
      sourceImageToFile(source, source.name || `source-${index + 1}.png`),
    ),
  );
}

async function sourceMaskToFile(source: StoredSourceImage | null) {
  if (!source) {
    return null;
  }
  return sourceImageToFile(source, source.name || "mask.png");
}

function mergeRetryImageResult(
  currentImages: StoredImage[],
  resultImages: StoredImage[],
  retryImageIndex: number,
) {
  if (retryImageIndex < 0) {
    return currentImages;
  }
  return currentImages.map((image, index) =>
    index === retryImageIndex
      ? {
          ...(resultImages[0] ?? image),
          streamPreview: false,
        }
      : image,
  );
}

function getTurnStatusFromImages(images: StoredImage[]) {
  return images.some((image) => image.status === "error") ? "error" : "success";
}

function getTurnErrorFromImages(images: StoredImage[]) {
  return images.find((image) => image.status === "error")?.error;
}

function asFinalImage(image: StoredImage): StoredImage {
  return image.streamPreview ? { ...image, streamPreview: false } : image;
}

function normalizeStreamPartialImagesCount(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.min(3, Math.max(0, Math.floor(numeric)));
}

export function useImageSubmit({
  mode,
  imagePrompt,
  imageModel,
  imageSources,
  maskSource,
  sourceImages,
  parsedCount,
  imageSize,
  imageResolutionAccess,
  imageQuality,
  imageOutputFormat,
  outputCompression = OUTPUT_COMPRESSION,
  selectedConversationId,
  draftSelectionRef,
  editorTarget,
  makeId,
  focusConversation,
  closeSelectionEditor,
  setImagePrompt,
  setSourceImages,
  setSubmitElapsedSeconds,
  onRequestStart,
  onRequestFinish,
  persistConversation,
  updateConversation,
  resetComposer,
}: UseImageSubmitOptions) {
  const isSelectionEditDispatchingRef = useRef(false);
  const isSubmitDispatchingRef = useRef(false);
  const retryingTurnIdsRef = useRef<Set<string>>(new Set());

  const finalizeTurn = useCallback(
    async (
      conversationId: string,
      turnId: string,
      draftTurn: ImageConversationTurn,
      images: StoredImage[],
    ) => {
      const status = getTurnStatusFromImages(images);
      const error = getTurnErrorFromImages(images);
      const finalImages = images.map(asFinalImage);
      await updateConversation(conversationId, (current) => ({
        ...(current ?? buildConversationBase(conversationId, draftTurn)),
        status,
        error,
        images: finalImages,
        turns: (current?.turns ?? [draftTurn]).map((turn) =>
          turn.id === turnId
            ? {
                ...turn,
                status,
                error,
                images: finalImages,
                finishedAt: new Date().toISOString(),
              }
            : turn,
        ),
      }));
      return status;
    },
    [updateConversation],
  );

  const markTurnError = useCallback(
    async (
      conversationId: string,
      turnId: string,
      draftTurn: ImageConversationTurn,
      message: string,
    ) => {
      await updateConversation(conversationId, (current) => ({
        ...(current ?? buildConversationBase(conversationId, draftTurn)),
        status: "error",
        error: message,
        turns: (current?.turns ?? [draftTurn]).map((turn) =>
          turn.id === turnId
            ? {
                ...turn,
                status: "error",
                error: message,
                finishedAt: new Date().toISOString(),
                images: turn.images.map((image) => ({
                  ...image,
                  status: "error" as const,
                  error: message,
                })),
              }
            : turn,
        ),
      }));
    },
    [updateConversation],
  );

  const replaceTurnImage = useCallback(
    async (
      conversationId: string,
      turnId: string,
      draftTurn: ImageConversationTurn,
      imageIndex: number,
      image: StoredImage,
    ) => {
      await updateConversation(conversationId, (current) => {
        const base = current ?? buildConversationBase(conversationId, draftTurn);
        const turns = (base.turns ?? [draftTurn]).map((turn) => {
          if (turn.id !== turnId) {
            return turn;
          }
          const images = [...turn.images];
            images[imageIndex] = image;
          return {
            ...turn,
            images,
          };
        });
        const latestTurn = turns[turns.length - 1] ?? draftTurn;
        return {
          ...base,
          images: latestTurn.id === turnId ? latestTurn.images : base.images,
          turns,
        };
      });
    },
    [updateConversation],
  );

  const previewTurnImage = useCallback(
    async (
      conversationId: string,
      turnId: string,
      draftTurn: ImageConversationTurn,
      imageIndex: number,
      preview: ImageStreamPreviewEvent,
      outputFormat: ImageOutputFormat,
    ) => {
      if (!preview?.b64_json) {
        return;
      }
      await replaceTurnImage(conversationId, turnId, draftTurn, imageIndex, {
        id: `${turnId}-${imageIndex}`,
        status: "success",
        streamPreview: true,
        b64_json: preview.b64_json,
        mime_type:
          outputFormat === "jpeg"
            ? "image/jpeg"
            : outputFormat === "webp"
              ? "image/webp"
              : "image/png",
      });
      await updateConversation(conversationId, (current) => {
        const base = current ?? buildConversationBase(conversationId, draftTurn);
        const turns = (base.turns ?? [draftTurn]).map((turn) => {
          if (turn.id !== turnId) {
            return turn;
          }
          const progress = Array.isArray(turn.streamPreviewProgress)
            ? [...turn.streamPreviewProgress]
            : [];
          const previewTarget =
            typeof turn.streamPartialImages === "number" &&
            Number.isFinite(turn.streamPartialImages)
              ? Math.max(0, Math.floor(turn.streamPartialImages))
              : 0;
          const incomingIndex =
            typeof preview.partial_image_index === "number" &&
            Number.isFinite(preview.partial_image_index)
              ? Math.max(0, Math.floor(preview.partial_image_index)) + 1
              : 1;
          const normalizedIndex =
            previewTarget > 0
              ? Math.min(previewTarget, incomingIndex)
              : incomingIndex;
          if (!progress.includes(normalizedIndex)) {
            progress.push(normalizedIndex);
          }
          progress.sort((left, right) => left - right);
          const nextPreviewFrames = progress.length;
          const currentImages = Array.isArray(turn.images) ? turn.images : [];
          const nextPreviewImages = currentImages.filter((candidate) =>
            candidate.streamPreview,
          ).length;
          return {
            ...turn,
            streamPreviewFrames: nextPreviewFrames,
            streamPreviewImages: nextPreviewImages > 0 ? nextPreviewImages : undefined,
            streamPreviewProgress: progress.length > 0 ? progress : undefined,
          };
        });
        const latestTurn = turns[turns.length - 1] ?? draftTurn;
        return {
          ...base,
          images: latestTurn.id === turnId ? latestTurn.images : base.images,
          turns,
        };
      });
    },
    [replaceTurnImage, updateConversation],
  );

  const handleSelectionEditSubmit = useCallback(
    async ({
      prompt,
      mask,
      aspectRatio: _aspectRatio,
      resolutionTier: _resolutionTier,
      quality: overrideQuality,
    }: {
      prompt: string;
      mask: {
        file: File;
        previewDataUrl: string;
      };
      aspectRatio?: string;
      resolutionTier?: string;
      quality?: string;
    }) => {
      if (isSelectionEditDispatchingRef.current || !editorTarget) {
        return;
      }
      isSelectionEditDispatchingRef.current = true;

      const shouldCreateNewConversation =
        draftSelectionRef.current === true || !selectedConversationId;
      const targetConversationId =
        editorTarget.conversationId ??
        (shouldCreateNewConversation ? null : selectedConversationId);
      const conversationId = targetConversationId ?? makeId();
      const nextQuality = normalizeImageQuality(overrideQuality, imageQuality);
      const turnId = makeId();
      const now = new Date().toISOString();
      const streamEnabled = getImageAsyncRelayForceEnabled();
      const streamPartialImages = streamEnabled
        ? normalizeStreamPartialImagesCount(getImageStreamPartialImages())
        : 0;
      const selectionSourceImage = buildSourceReference({
        id: makeId(),
        role: "image",
        name: editorTarget.imageName,
        isPrimary: true,
        referenceLabel: "@图1",
        url: editorTarget.sourceDataUrl,
      });
      const draftTurn = createConversationTurn({
        turnId,
        title: buildConversationTitle("edit", prompt),
        mode: "edit",
        prompt,
        model: resolveImageRequestModel(imageSize, imageModel),
        count: 1,
        size: imageSize,
        resolutionAccess: imageResolutionAccess,
        quality: nextQuality,
        outputFormat: imageOutputFormat,
        sourceImages: [
          selectionSourceImage,
          {
            id: makeId(),
            role: "mask",
            name: "mask.png",
            dataUrl: mask.previewDataUrl,
          },
        ],
        images: createLoadingImages(1, turnId),
        createdAt: now,
        startedAt: now,
        streamEnabled,
        streamPartialImages,
        status: "running",
      });

      setSubmitElapsedSeconds(0);
      if (!shouldCreateNewConversation) {
        focusConversation(conversationId);
      }
      setImagePrompt("");
      setSourceImages([]);
      closeSelectionEditor();

      try {
        if (targetConversationId) {
          await updateConversation(conversationId, (current) => {
            if (!current) {
              return buildConversationBase(conversationId, draftTurn);
            }
            return {
              ...current,
              turns: [...(current.turns ?? []), draftTurn],
            };
          });
        } else {
          await persistConversation(
            buildConversationBase(conversationId, draftTurn),
          );
        }
        focusConversation(conversationId);

        onRequestStart({
          conversationId,
          turnId,
          mode: "edit",
          count: 1,
          variant: "selection-edit",
        });

        const sourceFile = await dataUrlToFile(
          editorTarget.sourceDataUrl,
          editorTarget.imageName || "source.png",
        );
        const result = await editImage({
          prompt: buildReferencedImagePrompt(prompt, [selectionSourceImage]),
          images: [sourceFile],
          mask: mask.file,
          size: imageSize,
          quality: nextQuality,
          model: imageModel,
          outputFormat: imageOutputFormat,
          outputCompression,
        });
        const resultImages = mergeResultImages(
          turnId,
          result.data || [],
          1,
          imageOutputFormat,
        );
        const status = await finalizeTurn(
          conversationId,
          turnId,
          draftTurn,
          resultImages,
        );
        onRequestFinish(turnId, status === "success" ? "success" : "error");
        toast[status === "success" ? "success" : "error"](
          status === "success" ? "图片编辑完成" : "图片编辑返回异常",
        );
      } catch (error) {
        const message = formatImageError(error);
        await markTurnError(conversationId, turnId, draftTurn, message);
        onRequestFinish(turnId, "error");
        toast.error(message);
      } finally {
        isSelectionEditDispatchingRef.current = false;
      }
    },
    [
      closeSelectionEditor,
      editorTarget,
      finalizeTurn,
      focusConversation,
      imageModel,
      imageQuality,
      imageOutputFormat,
      imageResolutionAccess,
      imageSize,
      makeId,
      markTurnError,
      onRequestFinish,
      onRequestStart,
      outputCompression,
      persistConversation,
      draftSelectionRef,
      selectedConversationId,
      setImagePrompt,
      setSourceImages,
      setSubmitElapsedSeconds,
      updateConversation,
    ],
  );

  const handleRetryTurn = useCallback(
    async (
      conversationId: string,
      turn: ImageConversationTurn,
      imageIndex?: number,
    ) => {
      if (retryingTurnIdsRef.current.has(turn.id)) {
        return;
      }

      const prompt = turn.prompt?.trim() ?? "";
      const turnMode = turn.mode || "generate";
      const turnSourceImages = Array.isArray(turn.sourceImages)
        ? turn.sourceImages
        : [];
      const turnImageSources = turnSourceImages.filter(
        (item) => item.role === "image" && buildSourceImageUrl(item),
      );
      const prioritizedTurnImageSources = turnImageSources;
      const turnMaskSource =
        turnSourceImages.find((item) => item.role === "mask") ?? null;
      const turnQuality = turn.quality || "low";
      const turnOutputFormat = turn.outputFormat || imageOutputFormat;
      const isSingleImageRetry =
        turnMode === "generate" &&
        typeof imageIndex === "number" &&
        imageIndex >= 0 &&
        (turn.count || 1) > 1;
      const retryImageIndex = typeof imageIndex === "number" ? imageIndex : -1;
      const displayCount = Math.max(1, turn.count || 1);
      const requestCount = isSingleImageRetry ? 1 : displayCount;
      const usesEditEndpoint = turnMode === "edit" || turnImageSources.length > 0;

      if (turnMode === "generate" && !prompt) {
        toast.error("该记录缺少提示词，无法重试");
        return;
      }
      if (usesEditEndpoint && turnImageSources.length === 0) {
        toast.error("该记录缺少源图，无法重试");
        return;
      }

      retryingTurnIdsRef.current.add(turn.id);
      const nextImages = isSingleImageRetry
        ? turn.images.map((image, index) =>
            index === imageIndex
              ? {
                  ...image,
                  status: "loading" as const,
                  error: undefined,
                }
              : image,
          )
        : createLoadingImages(requestCount, turn.id);
      const draftTurn = createConversationTurn({
        turnId: turn.id,
        title: buildConversationTitle(turnMode, prompt),
        mode: turnMode,
        prompt,
        model: resolveImageRequestModel(turn.size, turn.model || imageModel),
        count: displayCount,
        size: turn.size,
        resolutionAccess: turn.resolutionAccess,
        quality: turnQuality,
        outputFormat: turnOutputFormat,
        sourceImages: turnSourceImages,
        sourceReference: turn.sourceReference,
        images: nextImages,
        createdAt: new Date().toISOString(),
        startedAt: turn.startedAt || new Date().toISOString(),
        streamEnabled:
          typeof turn.streamEnabled === "boolean"
            ? turn.streamEnabled
            : getImageAsyncRelayForceEnabled(),
        streamPartialImages:
          typeof turn.streamPartialImages === "number"
            ? turn.streamPartialImages
            : normalizeStreamPartialImagesCount(getImageStreamPartialImages()),
        streamPreviewImages: 0,
        streamPreviewFrames: 0,
        streamPreviewProgress: [],
        status: "running",
      });

      setSubmitElapsedSeconds(0);
      focusConversation(conversationId);

      try {
        await updateConversation(conversationId, (current) => ({
          ...(current ?? buildConversationBase(conversationId, draftTurn)),
          turns:
            current?.turns?.map((item) =>
              item.id === turn.id ? draftTurn : item,
            ) ?? [draftTurn],
        }));

        onRequestStart({
          conversationId,
          turnId: turn.id,
          mode: turnMode,
          count: requestCount,
          variant: "standard",
        });

        const editFiles = usesEditEndpoint
          ? await sourceImagesToFiles(prioritizedTurnImageSources)
          : [];
        const editMask = usesEditEndpoint
          ? await sourceMaskToFile(turnMaskSource)
          : null;
      const requestPrompt = buildReferencedImagePrompt(prompt, prioritizedTurnImageSources);
      const requestOneImage = (requestIndex: number) =>
          usesEditEndpoint
            ? editImage({
                prompt: requestPrompt,
                images: editFiles,
                mask: editMask,
                size: turn.size,
                quality: turnQuality,
                model: turn.model || imageModel,
                count: 1,
                outputFormat: turnOutputFormat,
                outputCompression,
                onPartialImage: (preview) =>
                  void previewTurnImage(
                    conversationId,
                    turn.id,
                    draftTurn,
                    retryImageIndex >= 0 ? retryImageIndex : requestIndex,
                    preview,
                    turnOutputFormat,
                  ),
              })
            : generateImageWithOptions(requestPrompt, {
                model: turn.model || imageModel,
                count: 1,
                size: turn.size,
                quality: turnQuality,
                outputFormat: turnOutputFormat,
                outputCompression,
                onPartialImage: (preview) =>
                  void previewTurnImage(
                    conversationId,
                    turn.id,
                    draftTurn,
                    retryImageIndex >= 0 ? retryImageIndex : requestIndex,
                    preview,
                    turnOutputFormat,
                  ),
              });
        const finalImages = isSingleImageRetry
          ? mergeRetryImageResult(
              turn.images,
              [
                mergeSingleResultImage(
                  turn.id,
                  retryImageIndex,
                  (await requestOneImage(retryImageIndex)).data || [],
                  turnOutputFormat,
                ),
              ],
              retryImageIndex,
            )
          : await runImageFanOutRequests({
              turnId: turn.id,
              count: requestCount,
              concurrency: usesEditEndpoint
                ? IMAGE_EDIT_FAN_OUT_CONCURRENCY
                : IMAGE_FAN_OUT_CONCURRENCY,
              outputFormat: turnOutputFormat,
              requestImage: (index) => requestOneImage(index),
              onImageSettled: (image, index) =>
                replaceTurnImage(conversationId, turn.id, draftTurn, index, image),
            });
        const status = await finalizeTurn(
          conversationId,
          turn.id,
          draftTurn,
          finalImages,
        );
        onRequestFinish(turn.id, status === "success" ? "success" : "error");
        toast[status === "success" ? "success" : "error"](
          status === "success" ? "重试完成" : "重试返回异常",
        );
      } catch (error) {
        const message = formatImageError(error);
        if (isSingleImageRetry) {
          const finalImages = mergeRetryImageResult(
            turn.images,
            [
              {
                id: `${turn.id}-${imageIndex}`,
                status: "error",
                error: message,
              },
            ],
            retryImageIndex,
          );
          const status = await finalizeTurn(
            conversationId,
            turn.id,
            draftTurn,
            finalImages,
          );
          onRequestFinish(turn.id, status === "success" ? "success" : "error");
          toast.error(message);
          return;
        }
        await markTurnError(conversationId, turn.id, draftTurn, message);
        onRequestFinish(turn.id, "error");
        toast.error(message);
      } finally {
        retryingTurnIdsRef.current.delete(turn.id);
      }
    },
    [
      finalizeTurn,
      focusConversation,
      imageModel,
      imageOutputFormat,
      markTurnError,
      onRequestFinish,
      onRequestStart,
      outputCompression,
      previewTurnImage,
      replaceTurnImage,
      setSubmitElapsedSeconds,
      updateConversation,
    ],
  );

  const handleSubmit = useCallback(async () => {
    if (isSubmitDispatchingRef.current) {
      return;
    }
    const prompt = imagePrompt.trim();
    const usesEditEndpoint = mode === "edit" || imageSources.length > 0;
    if (!prompt) {
      toast.error(mode === "edit" ? "编辑模式需要提示词" : "请输入提示词");
      return;
    }
    if (mode === "edit" && imageSources.length === 0) {
      toast.error("编辑模式至少需要一张源图");
      return;
    }
    isSubmitDispatchingRef.current = true;

    const shouldCreateNewConversation =
      draftSelectionRef.current === true || !selectedConversationId;
    const conversationId = shouldCreateNewConversation
      ? makeId()
      : selectedConversationId;
    const turnId = makeId();
    const now = new Date().toISOString();
    const streamEnabled = getImageAsyncRelayForceEnabled();
    const streamPartialImages = streamEnabled
      ? normalizeStreamPartialImagesCount(getImageStreamPartialImages())
      : 0;
    const expectedCount = mode === "generate" ? parsedCount : 1;
    const prioritizedImageSources = imageSources;
    const requestPrompt = buildReferencedImagePrompt(prompt, prioritizedImageSources);
    const draftTurn = createConversationTurn({
      turnId,
      title: buildConversationTitle(mode, prompt),
      mode,
      prompt,
      model: resolveImageRequestModel(imageSize, imageModel),
      count: expectedCount,
      size: imageSize,
      resolutionAccess: imageResolutionAccess,
      quality: imageQuality,
      outputFormat: imageOutputFormat,
      sourceImages: prioritizedImageSources,
      images: createLoadingImages(expectedCount, turnId),
      createdAt: now,
      startedAt: now,
      streamEnabled,
      streamPartialImages,
      streamPreviewImages: 0,
      streamPreviewFrames: 0,
      streamPreviewProgress: [],
      status: "running",
    });

    setSubmitElapsedSeconds(0);
    if (!shouldCreateNewConversation) {
      focusConversation(conversationId);
    }
    setImagePrompt("");
    setSourceImages([]);

    try {
      if (!shouldCreateNewConversation) {
        await updateConversation(conversationId, (current) => ({
          ...(current ?? buildConversationBase(conversationId, draftTurn)),
          turns: [...(current?.turns ?? []), draftTurn],
        }));
      } else {
        await persistConversation(
          buildConversationBase(conversationId, draftTurn),
        );
      }
      focusConversation(conversationId);

      onRequestStart({
        conversationId,
        turnId,
        mode,
        count: expectedCount,
        variant: "standard",
      });
      isSubmitDispatchingRef.current = false;

      const editFiles = usesEditEndpoint
        ? await sourceImagesToFiles(prioritizedImageSources)
        : [];
      const editMask = usesEditEndpoint
        ? await sourceMaskToFile(maskSource)
        : null;
      const resultImages = await runImageFanOutRequests({
        turnId,
        count: expectedCount,
        concurrency: usesEditEndpoint
          ? IMAGE_EDIT_FAN_OUT_CONCURRENCY
          : IMAGE_FAN_OUT_CONCURRENCY,
        outputFormat: imageOutputFormat,
        requestImage: (requestIndex) =>
          usesEditEndpoint
            ? editImage({
                prompt: requestPrompt,
                images: editFiles,
                mask: editMask,
                size: imageSize,
                quality: imageQuality,
                model: imageModel,
                count: 1,
                outputFormat: imageOutputFormat,
                outputCompression,
                onPartialImage: (preview) =>
                  void previewTurnImage(
                    conversationId,
                    turnId,
                    draftTurn,
                    requestIndex,
                    preview,
                    imageOutputFormat,
                  ),
              })
            : generateImageWithOptions(requestPrompt, {
                model: imageModel,
                count: 1,
                size: imageSize,
                quality: imageQuality,
                outputFormat: imageOutputFormat,
                outputCompression,
                onPartialImage: (preview) =>
                  void previewTurnImage(
                    conversationId,
                    turnId,
                    draftTurn,
                    requestIndex,
                    preview,
                    imageOutputFormat,
                  ),
              }),
        onImageSettled: (image, index) =>
          replaceTurnImage(conversationId, turnId, draftTurn, index, image),
      });
      const status = await finalizeTurn(
        conversationId,
        turnId,
        draftTurn,
        resultImages,
      );
      onRequestFinish(turnId, status === "success" ? "success" : "error");
      resetComposer(mode === "generate" ? "generate" : "edit");
      toast[status === "success" ? "success" : "error"](
        status === "success" ? "图片生成完成" : "图片生成返回异常",
      );
    } catch (error) {
      const message = formatImageError(error);
      await markTurnError(conversationId, turnId, draftTurn, message);
      onRequestFinish(turnId, "error");
      toast.error(message);
    } finally {
      isSubmitDispatchingRef.current = false;
    }
  }, [
    finalizeTurn,
    focusConversation,
    imageModel,
    imageOutputFormat,
    imagePrompt,
    imageSources,
    makeId,
    markTurnError,
    mode,
    imageSize,
    imageResolutionAccess,
    imageQuality,
    maskSource,
    onRequestFinish,
    onRequestStart,
    outputCompression,
    parsedCount,
    persistConversation,
    previewTurnImage,
    replaceTurnImage,
    resetComposer,
    draftSelectionRef,
    selectedConversationId,
    setImagePrompt,
    setSourceImages,
    setSubmitElapsedSeconds,
    updateConversation,
  ]);

  return {
    handleSelectionEditSubmit,
    handleRetryTurn,
    handleSubmit,
  };
}
