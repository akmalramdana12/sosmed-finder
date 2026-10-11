/**
 * Hanya tautan http(s) yang boleh dirender sebagai <a href>. profileUrl dibangun server dari template
 * platform, tetapi klien tetap menolak skema lain (javascript:, data:, ...) sebagai lapis kedua.
 */
export function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
