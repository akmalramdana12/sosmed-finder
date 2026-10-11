import type { LocationVisibility } from "@social-finder/types";

export interface LocationLabels {
  areaLabel: string | null;
  cityLabel: string | null;
}

/** Apa yang boleh dilihat PENGGUNA LAIN tentang lokasi seseorang. Tidak pernah ada koordinat. */
export interface PublicLocation {
  area?: string;
  city?: string;
  /** true hanya bila target boleh ikut pencarian radius dan jaraknya boleh ditampilkan. */
  distanceAllowed: boolean;
}

/**
 * Satu-satunya tempat yang memutuskan data lokasi apa yang keluar ke orang lain.
 * Tiap level membuka tepat satu lapis lebih banyak:
 *
 *   PRIVATE              tidak ada apa pun
 *   CITY_ONLY            label kota
 *   AREA_ONLY            label area (+ label kota)
 *   DISCOVERABLE_RADIUS  label area (+ kota) + ikut pencarian radius dengan jarak dibulatkan
 *
 * Nilai tak dikenal (data rusak) diperlakukan sebagai PRIVATE: gagal tertutup.
 */
export function projectLocation(
  visibility: LocationVisibility,
  labels: LocationLabels,
): PublicLocation {
  const city = labels.cityLabel ? { city: labels.cityLabel } : {};
  const area = labels.areaLabel ? { area: labels.areaLabel } : {};

  switch (visibility) {
    case "PRIVATE":
      return { distanceAllowed: false };
    case "CITY_ONLY":
      return { ...city, distanceAllowed: false };
    case "AREA_ONLY":
      return { ...area, ...city, distanceAllowed: false };
    case "DISCOVERABLE_RADIUS":
      return { ...area, ...city, distanceAllowed: true };
    default: {
      const unreachable: never = visibility;
      void unreachable;
      return { distanceAllowed: false };
    }
  }
}
