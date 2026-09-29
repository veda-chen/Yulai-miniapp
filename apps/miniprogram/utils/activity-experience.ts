export type ActivityStatusInput = {
  status: string;
  registrationDeadline: string;
  capacity: number;
  registeredCount: number;
};

export function activityStatusView(
  activity: ActivityStatusInput,
  currentRegistrationStatus: string | null,
  now = Date.now(),
) {
  const registrationClosed =
    activity.status !== "OPEN" || Date.parse(activity.registrationDeadline) <= now;
  const isActive = ["CONFIRMED", "WAITLISTED"].includes(currentRegistrationStatus ?? "");
  let capacityHint = `剩余 ${Math.max(0, activity.capacity - activity.registeredCount)} 个名额`;
  if (activity.status === "CANCELLED") capacityHint = "球局已取消";
  else if (activity.status === "IN_PROGRESS") capacityHint = "球局进行中";
  else if (activity.status === "ENDED") capacityHint = "球局已结束";
  else if (registrationClosed) capacityHint = "报名已截止";
  else if (activity.registeredCount >= activity.capacity) capacityHint = "已满员，可加入候补";
  return {
    capacityHint,
    registrationClosed,
    registrationActionAvailable: activity.status === "OPEN" && (isActive || !registrationClosed),
  };
}

export type ActivityFormValidationInput = {
  venueId: string;
  venueUnavailable: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  deadlineDate: string;
  deadlineTime: string;
  capacity: string;
};

export type ActivityFormErrors = Partial<
  Record<"venue" | "startAt" | "endAt" | "deadline" | "capacity", string>
>;

function chinaIso(date: string, time: string): string | null {
  const timestamp = Date.parse(`${date}T${time}:00+08:00`);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function validateActivityForm(input: ActivityFormValidationInput, now = Date.now()) {
  const errors: ActivityFormErrors = {};
  if (!input.venueId || input.venueUnavailable) errors.venue = "请选择当前可用的场馆";

  const startAt = chinaIso(input.startDate, input.startTime);
  const endAt = chinaIso(input.endDate, input.endTime);
  const registrationDeadline = chinaIso(input.deadlineDate, input.deadlineTime);
  const startTime = startAt ? Date.parse(startAt) : Number.NaN;
  const endTime = endAt ? Date.parse(endAt) : Number.NaN;
  const deadlineTime = registrationDeadline ? Date.parse(registrationDeadline) : Number.NaN;

  if (!startAt) errors.startAt = "开始时间格式不正确";
  else if (startTime <= now) errors.startAt = "开始时间必须晚于当前时间";
  if (!endAt) errors.endAt = "结束时间格式不正确";
  else if (startAt && endTime <= startTime) errors.endAt = "结束时间必须晚于开始时间";
  if (!registrationDeadline) errors.deadline = "报名截止时间格式不正确";
  else if (deadlineTime <= now) errors.deadline = "报名截止时间必须晚于当前时间";
  else if (startAt && deadlineTime > startTime) errors.deadline = "报名截止时间不能晚于开始时间";

  const capacity = Number(input.capacity);
  if (!Number.isInteger(capacity) || capacity < 4 || capacity > 40) {
    errors.capacity = "人数上限需为4至40人";
  }

  return {
    errors,
    values:
      Object.keys(errors).length === 0 && startAt && endAt && registrationDeadline
        ? { startAt, endAt, registrationDeadline, capacity }
        : null,
  };
}
