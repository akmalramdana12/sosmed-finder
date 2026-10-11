// Entry point "murni" (tanpa Prisma): aman dipakai di test.
export {
  EARTH_RADIUS_KM,
  GRID_KM,
  InvalidCoordinateError,
  KM_PER_DEGREE,
  MAX_ABS_LATITUDE,
  haversineKm,
  roundDistanceKm,
  snapToGrid,
  withinDiscoverableRadius,
} from "./geo";
export type { GeoPoint } from "./geo";
export { projectLocation } from "./projection";
export type { LocationLabels, PublicLocation } from "./projection";
export {
  DEFAULT_RADIUS_KM,
  LOCATION_LIMITS,
  LocationService,
  toLocationDto,
} from "./location-service";
export type {
  LocationDeps,
  SetLocationCommand,
  UpdateLocationSettingsCommand,
} from "./location-service";
export type {
  LocationRepository,
  LocationSettingsUpdate,
  LocationWrite,
  StoredLocation,
} from "./types";
