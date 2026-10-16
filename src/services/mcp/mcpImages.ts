/**
 * 工具回傳的圖片送給模型前先縮到長邊 1024px，減少 token 與傳輸量。
 */
import type { ToolImage } from "@/services/toolCalling/types";
import { compressImage, compressionPresets, type ImageCompressionOptions } from "@/utils/imageCompression";

type Compress = (file: File, options: ImageCompressionOptions) => Promise<string>;

function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** 縮不了（例如格式不支援）就用原圖 */
export async function downscaleToolImages(images: ToolImage[], compress: Compress = compressImage): Promise<ToolImage[]> {
  const result: ToolImage[] = [];
  for (const image of images) {
    try {
      const file = new File([base64ToBytes(image.data)], "tool-image", { type: image.mimeType });
      const dataUrl = await compress(file, { ...compressionPresets.vision, preserveGif: false });
      const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
      result.push(match ? { mimeType: match[1], data: match[2] } : image);
    } catch {
      result.push(image);
    }
  }
  return result;
}
