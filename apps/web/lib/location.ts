import { prismaAuditWriter } from "@social-finder/api/auth/node";
import { LocationService } from "@social-finder/api/location";
import { PrismaLocationRepository } from "@social-finder/api/location/node";
import { getRateLimiter } from "./auth";
import { getEnv } from "./env";

let service: LocationService | undefined;

export function getLocationService(): LocationService {
  if (!service) {
    service = new LocationService({
      repository: new PrismaLocationRepository(),
      limiter: getRateLimiter(),
      audit: prismaAuditWriter,
      hmacSecret: getEnv().sessionSecret,
    });
  }
  return service;
}
