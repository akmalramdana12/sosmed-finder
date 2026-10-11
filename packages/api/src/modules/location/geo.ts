import type { AccuracyLevel } from "@social-finder/types";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export const EARTH_RADIUS_KM = 6371.0088;
/** Panjang satu derajat lintang di permukaan bumi (km). */
export const KM_PER_DEGREE = (2 * Math.PI * EARTH_RADIUS_KM) / 360;

/** Sisi sel grid (km) per level akurasi. AREA ~ lingkungan, CITY ~ kota. */
export const GRID_KM: Record<AccuracyLevel, number> = { AREA: 2, CITY: 10 };

/** Di atas lintang ini bujur menyempit sehingga sel grid tidak bermakna; wilayah kutub tidak didukung. */
export const MAX_ABS_LATITUDE = 85;

/**
 * Pesan error SENGAJA statis: tidak boleh memuat nilai koordinat, karena error bisa masuk log.
 */
export class InvalidCoordinateError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidCoordinateError";
  }
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function assertSupportedPoint(point: GeoPoint): void {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
    throw new InvalidCoordinateError("koordinat tidak valid");
  }
  if (Math.abs(point.latitude) > MAX_ABS_LATITUDE) {
    throw new InvalidCoordinateError("lintang di luar wilayah yang didukung");
  }
  if (Math.abs(point.longitude) > 180) {
    throw new InvalidCoordinateError("bujur tidak valid");
  }
}

/**
 * Ganti titik dengan CENTROID sel grid yang memuatnya. Hanya hasil ini yang boleh disimpan.
 *
 * Grid berpatok pada kutub selatan dan bujur -180, sehingga deterministik. Tinggi sel tetap
 * (GRID_KM). Jumlah sel per pita lintang adalah bilangan bulat yang membungkus sempurna di
 * bujur +-180, jadi lebar sel tetap kira-kira GRID_KM di semua lintang dan tidak ada sel
 * yang terpotong di antimeridian.
 *
 * Konsekuensi privasi: titik asli bisa di mana saja di dalam sel, dan semua titik di sel yang
 * sama menghasilkan keluaran identik. Informasi apa pun yang bocor dari keluaran ini (jarak,
 * label) paling jauh mengungkap sel, yaitu akurasi yang memang dipilih pengguna.
 */
export function snapToGrid(point: GeoPoint, level: AccuracyLevel): GeoPoint {
  assertSupportedPoint(point);

  const latStep = GRID_KM[level] / KM_PER_DEGREE;
  const latIndex = Math.floor((point.latitude + 90) / latStep);
  const centerLatitude = -90 + (latIndex + 0.5) * latStep;

  const rawLngStep = latStep / Math.cos(toRadians(centerLatitude));
  const cells = Math.max(1, Math.round(360 / rawLngStep));
  const lngStep = 360 / cells;
  const longitude = point.longitude === 180 ? -180 : point.longitude;
  const lngIndex = Math.min(cells - 1, Math.floor((longitude + 180) / lngStep));
  const centerLongitude = -180 + (lngIndex + 0.5) * lngStep;

  return { latitude: round6(centerLatitude), longitude: round6(centerLongitude) };
}

/** Jarak lingkaran besar (km). */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Jarak untuk ditampilkan: dibulatkan ke 0,5 km terdekat dengan minimum 1 km, sehingga dua
 * pengguna di sel yang sama tidak tampak "0 km" dan selisih kecil tidak bisa dibaca.
 */
export function roundDistanceKm(distanceKm: number): number {
  return Math.max(1, Math.round(distanceKm * 2) / 2);
}

/**
 * Apakah target boleh muncul untuk pencari: jarak harus <= radius pencarian DAN <= radius yang
 * dipilih target sendiri (discoverableRadius, dalam meter). Batas terkecil yang berlaku.
 */
export function withinDiscoverableRadius(
  distanceKm: number,
  searchRadiusKm: number,
  targetRadiusMeters: number,
): boolean {
  return distanceKm <= Math.min(searchRadiusKm, targetRadiusMeters / 1000);
}
