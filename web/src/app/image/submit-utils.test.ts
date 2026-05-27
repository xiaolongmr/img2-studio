import { describe, expect, it } from "vitest";

import {
  buildReferencedImagePrompt,
  buildSourceImageReferenceLabel,
  hasSelectedMentionToken,
  normalizeSourceImageMention,
  stripSelectedMentionMarkers,
  wrapSelectedMentionToken,
} from "./submit-utils";

describe("submit-utils", () => {
  it("normalizes source image mentions", () => {
    expect(normalizeSourceImageMention("图1")).toBe("@图1");
    expect(normalizeSourceImageMention("@图2")).toBe("@图2");
    expect(normalizeSourceImageMention("")).toBe("");
  });

  it("builds source reference labels", () => {
    expect(
      buildSourceImageReferenceLabel(
        { id: "1", role: "image", referenceLabel: "@主图" } as any,
        0,
      ),
    ).toBe("@主图");
    expect(
      buildSourceImageReferenceLabel(
        { id: "2", role: "image" } as any,
        1,
      ),
    ).toBe("@图2");
  });

  it("builds referenced prompt without primary/secondary semantics", () => {
    const prompt = buildReferencedImagePrompt("让@图1穿上@衣服", [
      {
        id: "source-1",
        role: "image",
        name: "person.png",
        referenceLabel: "@图1",
      },
      {
        id: "source-2",
        role: "image",
        name: "coat.png",
        referenceLabel: "@图2",
        referenceAlias: "@衣服",
      },
    ] as any);

    expect(prompt).toContain("参考图说明：");
    expect(prompt).toContain("- @图1：第 1 张参考图，文件名 person.png");
    expect(prompt).toContain("- @图2 / @衣服：第 2 张参考图，文件名 coat.png");
    expect(prompt).toContain("用户要求：\n让@图1穿上@衣服");
    expect(prompt).not.toContain("主参考");
    expect(prompt).not.toContain("辅参考");
  });

  it("wraps and strips selected mention markers", () => {
    const mention = wrapSelectedMentionToken("@图1");
    expect(mention).toContain("@图1");
    expect(hasSelectedMentionToken(mention)).toBe(true);
    expect(stripSelectedMentionMarkers(mention)).toBe("@图1");
  });

  it("strips mention markers when building referenced prompt", () => {
    const prompt = buildReferencedImagePrompt(
      `请参考${wrapSelectedMentionToken("@图1")}生成`,
      [
        {
          id: "source-1",
          role: "image",
          referenceLabel: "@图1",
        },
      ] as any,
    );
    expect(prompt).toContain("用户要求：\n请参考@图1生成");
    expect(prompt).not.toContain("\u2063");
    expect(prompt).not.toContain("\u2064");
  });
});
