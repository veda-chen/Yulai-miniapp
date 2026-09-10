import { AppError } from "../errors.js";

export type ParticipationState = {
  capacity: number;
  confirmedUserIds: string[];
  waitlistUserIds: string[];
  nextQueueNo: number;
};

export type JoinResult = {
  state: ParticipationState;
  status: "CONFIRMED" | "WAITLISTED";
  queueNo: number;
  changed: boolean;
};

export type LeaveResult = {
  state: ParticipationState;
  previousStatus: "CONFIRMED" | "WAITLISTED";
  promotedUserId: string | null;
};

export function normalizeParticipationState(
  value: Partial<ParticipationState>,
): ParticipationState {
  return {
    capacity: value.capacity ?? 0,
    confirmedUserIds: Array.isArray(value.confirmedUserIds) ? [...value.confirmedUserIds] : [],
    waitlistUserIds: Array.isArray(value.waitlistUserIds) ? [...value.waitlistUserIds] : [],
    nextQueueNo:
      Number.isInteger(value.nextQueueNo) && Number(value.nextQueueNo) > 0
        ? Number(value.nextQueueNo)
        : 1,
  };
}

export function joinParticipation(stateInput: ParticipationState, userId: string): JoinResult {
  const state = normalizeParticipationState(stateInput);
  if (state.confirmedUserIds.includes(userId)) {
    return { state, status: "CONFIRMED", queueNo: 0, changed: false };
  }
  if (state.waitlistUserIds.includes(userId)) {
    return { state, status: "WAITLISTED", queueNo: 0, changed: false };
  }

  const queueNo = state.nextQueueNo;
  const confirmed = state.confirmedUserIds.length < state.capacity;
  return {
    status: confirmed ? "CONFIRMED" : "WAITLISTED",
    queueNo,
    changed: true,
    state: {
      ...state,
      confirmedUserIds: confirmed ? [...state.confirmedUserIds, userId] : state.confirmedUserIds,
      waitlistUserIds: confirmed ? state.waitlistUserIds : [...state.waitlistUserIds, userId],
      nextQueueNo: queueNo + 1,
    },
  };
}

export function leaveParticipation(
  stateInput: ParticipationState,
  userId: string,
  allowPromotion: boolean,
): LeaveResult {
  const state = normalizeParticipationState(stateInput);
  if (state.confirmedUserIds.includes(userId)) {
    const confirmedUserIds = state.confirmedUserIds.filter((id) => id !== userId);
    const [promotedUserId = null, ...remainingWaitlist] = allowPromotion
      ? state.waitlistUserIds
      : [];
    return {
      previousStatus: "CONFIRMED",
      promotedUserId,
      state: {
        ...state,
        confirmedUserIds: promotedUserId ? [...confirmedUserIds, promotedUserId] : confirmedUserIds,
        waitlistUserIds: promotedUserId ? remainingWaitlist : state.waitlistUserIds,
      },
    };
  }
  if (state.waitlistUserIds.includes(userId)) {
    return {
      previousStatus: "WAITLISTED",
      promotedUserId: null,
      state: {
        ...state,
        waitlistUserIds: state.waitlistUserIds.filter((id) => id !== userId),
      },
    };
  }
  throw new AppError("REGISTRATION_NOT_ACTIVE", "当前没有可退出的报名");
}
