export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://woff.space"
).replace(/\/+$/, "");

export function absoluteSocialImageUrl(imagePath?: string): string {
  if (!imagePath || /\.svg(?:[?#].*)?$/i.test(imagePath)) {
    return `${SITE_URL}/og-image.png`;
  }
  if (/^https?:\/\//i.test(imagePath)) {
    return imagePath;
  }
  return `${SITE_URL}${imagePath.startsWith("/") ? "" : "/"}${imagePath}`;
}
