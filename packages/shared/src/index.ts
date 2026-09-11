export const USER_LEVELS = ["UNKNOWN", "CASUAL", "BEGINNER", "IMPROVING", "COMPETITIVE"] as const;
export type UserLevel = (typeof USER_LEVELS)[number];

export const ACTIVITY_VISIBILITIES = ["PUBLIC", "LINK_ONLY"] as const;
export type ActivityVisibility = (typeof ACTIVITY_VISIBILITIES)[number];

export type ApiError = {
  code: string;
  message: string;
  requestId: string;
};

export type CloudFunctionRequest = {
  action: string;
  requestId?: string;
  payload?: unknown;
};

export type CloudFunctionSuccess<T> = {
  ok: true;
  requestId: string;
  data: T;
};

export type CloudFunctionFailure = {
  ok: false;
  requestId: string;
  error: ApiError;
};

export type HealthResponse = {
  status: "ok";
  service: "yulai-cloud-api";
  timestamp: string;
};

export type SessionResponse = {
  user: {
    id: string;
    isNew: boolean;
  };
};

export type SchoolSummary = {
  id: string;
  name: string;
};

export type UserProfile = {
  id: string;
  nickname: string | null;
  avatarFileId: string | null;
  school: SchoolSummary | null;
  level: UserLevel;
  status: string;
  needsProfile: boolean;
};

export type VenueSummary = {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
  entranceGuide: string | null;
  openingHours: string | null;
  accessPolicy: string | null;
  bookingInstructions: string | null;
  contactPhone: string | null;
  facilities: string[];
  coverFileId: string | null;
  floorPlanFileId: string | null;
  verifiedAt: string | null;
  verificationSource: string | null;
  verificationStatus: "ACTIVE" | "PENDING_VERIFICATION";
  updatedAt: unknown;
};

export type CourtSummary = {
  id: string;
  name: string;
  locationHint: string | null;
  floorName: string | null;
  surface: string | null;
  lighting: string | null;
};

export type ActivitySummary = {
  id: string;
  title: string;
  venue: { id: string; name: string };
  organizer: { id: string; nickname: string };
  startAt: string;
  endAt: string;
  registrationDeadline: string;
  capacity: number;
  registeredCount: number;
  level: "ANY" | Exclude<UserLevel, "UNKNOWN">;
  locationHint: string | null;
  visibility: ActivityVisibility;
  groupingEnabled: boolean;
  scoringEnabled: boolean;
  status: "OPEN";
  version: number;
};
