import { describe, expect, it, vi } from "vitest";
import { downscaleToolImages } from "./mcpImages";

describe("downscaleToolImages", () => {
  it("replaces each image with the compressed data url", async () => {
    const compress = vi.fn(async (file: File) => {
      expect(file.type).toBe("image/png");
      return "data:image/jpeg;base64,SMALL";
    });
    expect(await downscaleToolImages([{ mimeType: "image/png", data: "AAAA" }], compress)).toEqual([{ mimeType: "image/jpeg", data: "SMALL" }]);
  });

  it("keeps the original image when compression fails", async () => {
    const compress = vi.fn(async () => { throw new Error("no canvas"); });
    expect(await downscaleToolImages([{ mimeType: "image/png", data: "AAAA" }], compress)).toEqual([{ mimeType: "image/png", data: "AAAA" }]);
  });
});
