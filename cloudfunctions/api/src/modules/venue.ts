import { db } from "../db.js";
import { AppError } from "../errors.js";
import type { Handler } from "../types.js";

const PUBLIC_STATUSES = ["ACTIVE", "PENDING_VERIFICATION"];

type VenueDocument = {
  _id: string;
  name: string;
  address?: string | null;
  description?: string | null;
  status: string;
  updatedAt?: unknown;
};

type CourtDocument = {
  _id: string;
  name: string;
  locationHint?: string | null;
  status: string;
};

function mapVenue(venue: VenueDocument) {
  return {
    id: venue._id,
    name: venue.name,
    address: venue.address ?? null,
    description: venue.description ?? null,
    verificationStatus: venue.status,
    updatedAt: venue.updatedAt ?? null,
  };
}

export const listVenues: Handler = async () => {
  const result = (await db
    .collection("venues")
    .where({ status: db.command.in(PUBLIC_STATUSES) })
    .orderBy("name", "asc")
    .limit(100)
    .get()) as unknown as { data: VenueDocument[] };
  return { venues: result.data.map(mapVenue) };
};

export const getVenue: Handler = async (payload) => {
  const id =
    typeof payload === "object" && payload !== null && "id" in payload
      ? Reflect.get(payload, "id")
      : null;
  if (typeof id !== "string" || id.length < 1 || id.length > 64) {
    throw new AppError("INVALID_ARGUMENT", "场馆编号无效");
  }

  const venueResult = (await db
    .collection("venues")
    .where({ _id: id, status: db.command.in(PUBLIC_STATUSES) })
    .limit(1)
    .get()) as unknown as { data: VenueDocument[] };
  const venue = venueResult.data[0];
  if (!venue) {
    throw new AppError("VENUE_NOT_FOUND", "场馆不存在或暂不可见");
  }

  const courtResult = (await db
    .collection("courts")
    .where({ venueId: id })
    .orderBy("name", "asc")
    .limit(100)
    .get()) as unknown as { data: CourtDocument[] };

  return {
    venue: mapVenue(venue),
    courts: courtResult.data
      .filter((court) => court.status === "ACTIVE")
      .map((court) => ({
        id: court._id,
        name: court.name,
        locationHint: court.locationHint ?? null,
      })),
  };
};
