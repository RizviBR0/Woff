// Adaptive client-side image compression utility for Woff
// Decides whether to compress based on file size, then applies dimension capping
// and iterative quality reduction to reach a target byte size.

export interface CompressionResult {
  dataUrl: string;
  originalBytes: number;
  finalBytes: number;
  wasCompressed: boolean;
  qualityUsed: number;
  width: number;
  height: number;
}

export interface CompressionOptions {
  sizeThresholdBytes?: number; // Compress only if larger than this
  targetMaxBytes?: number; // Desired upper bound after compression
  desktopMaxDimension?: number; // Max width/height on desktop
  mobileMaxDimension?: number; // Max width/height on mobile
  extremeSizeBytes?: number; // If original > this, use more aggressive dimensions
  extremeDesktopMaxDimension?: number;
  extremeMobileMaxDimension?: number;
  initialQuality?: number;
  minQuality?: number;
  qualityStep?: number;
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  sizeThresholdBytes: 600 * 1024, // 600 KB threshold to trigger compression
  targetMaxBytes: 450 * 1024, // Aim for <= 450 KB after compression
  desktopMaxDimension: 1600,
  mobileMaxDimension: 1200,
  extremeSizeBytes: 5 * 1024 * 1024, // >5MB gets tighter dimension cap
  extremeDesktopMaxDimension: 1400,
  extremeMobileMaxDimension: 1000,
  initialQuality: 0.85,
  minQuality: 0.55,
  qualityStep: 0.1,
};

export function shouldCompress(
  file: File,
  sizeThresholdBytes: number = DEFAULT_OPTIONS.sizeThresholdBytes
): boolean {
  return file.size > sizeThresholdBytes;
}

function estimateBytesFromDataUrl(dataUrl: string): number {
  const base64Index = dataUrl.indexOf("base64,");
  if (base64Index === -1) return dataUrl.length; // Fallback
  const base64 = dataUrl.substring(base64Index + 7);
  // Base64 to byte estimate
  return Math.round((base64.length * 3) / 4); // ignore padding for estimate
}

export async function compressImageAdaptive(
  file: File,
  opts: CompressionOptions = {}
): Promise<CompressionResult> {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const should = shouldCompress(file, options.sizeThresholdBytes);
  const originalBytes = file.size;

  // If we should not compress, just return original as Data URL
  if (!should) {
    const dataUrl = await fileToDataUrl(file);
    return {
      dataUrl,
      originalBytes,
      finalBytes: originalBytes,
      wasCompressed: false,
      qualityUsed: 1,
      width: 0,
      height: 0,
    };
  }

  // Load image
  const img = await loadImage(file);
  const isMobile = isMobileDevice();
  const extreme = originalBytes > options.extremeSizeBytes;
  const maxDim = extreme
    ? isMobile
      ? options.extremeMobileMaxDimension
      : options.extremeDesktopMaxDimension
    : isMobile
    ? options.mobileMaxDimension
    : options.desktopMaxDimension;

  let targetW = img.width;
  let targetH = img.height;
  if (targetW > maxDim || targetH > maxDim) {
    const scale = Math.min(maxDim / targetW, maxDim / targetH);
    targetW = Math.round(targetW * scale);
    targetH = Math.round(targetH * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Fallback: return original data URL if canvas unsupported
    const dataUrl = await fileToDataUrl(file);
    return {
      dataUrl,
      originalBytes,
      finalBytes: originalBytes,
      wasCompressed: false,
      qualityUsed: 1,
      width: img.width,
      height: img.height,
    };
  }
  ctx.drawImage(img, 0, 0, targetW, targetH);

  let quality = options.initialQuality;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  let finalBytes = estimateBytesFromDataUrl(dataUrl);

  while (
    finalBytes > options.targetMaxBytes &&
    quality > options.minQuality + 1e-6
  ) {
    quality = Math.max(options.minQuality, quality - options.qualityStep);
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    finalBytes = estimateBytesFromDataUrl(dataUrl);
  }

  return {
    dataUrl,
    originalBytes,
    finalBytes,
    wasCompressed: true,
    qualityUsed: quality,
    width: targetW,
    height: targetH,
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error("File read error"));
    reader.readAsDataURL(file);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load error"));
    img.src = URL.createObjectURL(file);
  });
}

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
