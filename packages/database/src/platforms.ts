export interface PlatformSeed {
  key: string;
  name: string;
  /** Harus berisi tepat satu "{username}". */
  urlTemplate: string;
}

/**
 * Platform awal. Daftar ini bisa diubah; keputusan platform final ada di roadmap
 * (keputusan terbuka #2). profileUrl dibangun dari template ini, bukan input pengguna.
 */
export const PLATFORM_SEEDS: readonly PlatformSeed[] = [
  { key: "instagram", name: "Instagram", urlTemplate: "https://www.instagram.com/{username}" },
  { key: "x", name: "X", urlTemplate: "https://x.com/{username}" },
  { key: "tiktok", name: "TikTok", urlTemplate: "https://www.tiktok.com/@{username}" },
  { key: "youtube", name: "YouTube", urlTemplate: "https://www.youtube.com/@{username}" },
  { key: "facebook", name: "Facebook", urlTemplate: "https://www.facebook.com/{username}" },
  { key: "github", name: "GitHub", urlTemplate: "https://github.com/{username}" },
];
