const COMPRESSIBLE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);
const MAX_COMPRESSED_IMAGE_EDGE = 2560;
const IMAGE_COMPRESSION_QUALITY = 0.82;

export type MobileImageUploadAsset = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
};

type ImageManipulationAction = { resize: { width?: number; height?: number } };
type ImageManipulationOptions = { compress: number; format: "jpeg" | "webp" };
type ImageManipulationResult = { uri: string; width: number; height: number };
type ImageManipulator = (
  uri: string,
  actions: ImageManipulationAction[],
  options: ImageManipulationOptions
) => Promise<ImageManipulationResult>;

export const prepareUploadAsset = async (
  asset: MobileImageUploadAsset,
  imageCompressionEnabled: boolean,
  manipulateImage?: ImageManipulator
): Promise<{ uri: string; name: string; type: string }> => {
  const mimeType = asset.mimeType || "application/octet-stream";
  const filename = asset.name || "upload";

  if (!imageCompressionEnabled || !COMPRESSIBLE_IMAGE_TYPES.has(mimeType)) {
    return {
      uri: asset.uri,
      name: filename,
      type: mimeType,
    };
  }

  try {
    const manipulate = manipulateImage ?? createExpoImageManipulator();
    const measured = await manipulate(asset.uri, [], { compress: 1, format: "jpeg" });
    const maxEdge = Math.max(measured.width, measured.height);
    const resizeAction = maxEdge > MAX_COMPRESSED_IMAGE_EDGE
      ? [{ resize: getCompressedImageSize(measured.width, measured.height) }]
      : [];
    const compressed = await manipulate(asset.uri, resizeAction, {
      compress: IMAGE_COMPRESSION_QUALITY,
      format: "webp",
    });

    return {
      uri: compressed.uri,
      name: toCompressedImageFilename(filename),
      type: "image/webp",
    };
  } catch {
    return {
      uri: asset.uri,
      name: filename,
      type: mimeType,
    };
  }
};

const createExpoImageManipulator = (): ImageManipulator => async (uri, actions, options) => {
  const { manipulateAsync, SaveFormat } = await import("expo-image-manipulator");
  return manipulateAsync(uri, actions, {
    compress: options.compress,
    format: options.format === "webp" ? SaveFormat.WEBP : SaveFormat.JPEG,
  });
};

const getCompressedImageSize = (width: number, height: number) => {
  if (width >= height) {
    return { width: MAX_COMPRESSED_IMAGE_EDGE };
  }

  return { height: MAX_COMPRESSED_IMAGE_EDGE };
};

const toCompressedImageFilename = (filename: string) => {
  const trimmed = filename.trim();

  if (!trimmed) {
    return "image.webp";
  }

  return trimmed.replace(/\.[^.]+$/, "") + ".webp";
};
