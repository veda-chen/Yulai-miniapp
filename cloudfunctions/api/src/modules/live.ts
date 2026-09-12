import { createHash } from "node:crypto";
import { db } from "../db.js";
import { AppError } from "../errors.js";
import type { Handler } from "../types.js";
import { findCurrentUser } from "./user.js";
import {
  generateBalancedMatches,
  teamForUser,
  validateBadmintonScore,
  validateMatchPlayers,
  type GroupingCandidate,
  type MatchType,
} from "./live-domain.js";

type Store = Pick<typeof db, "collection">;
type ActivityDocument = {
  _id: string;
  title: string;
  organizerId: string;
  venueId: string;
  status: string;
  groupingEnabled: boolean;
  scoringEnabled: boolean;
  confirmedUserIds?: string[];
};
type MatchDocument = {
  _id: string;
  activityId: string;
  roundId: string | null;
  courtLabel: string;
  teamAUserIds: string[];
  teamBUserIds: string[];
  matchType?: MatchType;
  status: string;
  scoreA: number | null;
  scoreB: number | null;
  confirmations: string[];
  version: number;
  createdBy: string;
  idempotencyKey?: string;
};
type RoundDocument = {
  _id: string;
  activityId: string;
  roundNo: number;
  status: string;
  matchIds: string[];
  version: number;
};
type ParticipantDocument = {
  userId: string;
  status: string;
  attendanceStatus?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredId(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 80) {
    throw new AppError("INVALID_ARGUMENT", `${label}无效`);
  }
  return value;
}

function requiredVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new AppError("INVALID_ARGUMENT", "数据版本无效");
  }
  return Number(value);
}

function stableId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function documentData<T>(snapshot: unknown): T | null {
  if (!isRecord(snapshot)) return null;
  const data = snapshot.data;
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return (data as T | undefined) ?? null;
}

function queryData<T>(snapshot: unknown): T[] {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.data)) return [];
  return snapshot.data as T[];
}

async function getActivity(store: Store, id: string): Promise<ActivityDocument> {
  const activity = documentData<ActivityDocument>(
    await store.collection("activities").where({ _id: id }).limit(1).get(),
  );
  if (!activity) throw new AppError("ACTIVITY_NOT_FOUND", "球局不存在");
  return activity;
}

async function getMatch(store: Store, id: string): Promise<MatchDocument> {
  const match = documentData<MatchDocument>(
    await store.collection("matches").where({ _id: id }).limit(1).get(),
  );
  if (!match) throw new AppError("MATCH_NOT_FOUND", "对局不存在");
  return match;
}

function assertViewer(activity: ActivityDocument, userId: string): void {
  if (activity.organizerId !== userId && !(activity.confirmedUserIds ?? []).includes(userId)) {
    throw new AppError("FORBIDDEN", "只有组织者和正式成员可以进入现场");
  }
}

function assertLiveActivity(activity: ActivityDocument): void {
  if (activity.status !== "IN_PROGRESS") {
    throw new AppError("INVALID_STATE", "球局开始后才能使用现场功能");
  }
}

function parsePlayers(payload: Record<string, unknown>): {
  matchType: MatchType;
  teamAUserIds: string[];
  teamBUserIds: string[];
} {
  const teamA = Array.isArray(payload.teamAUserIds) ? payload.teamAUserIds : [];
  const teamB = Array.isArray(payload.teamBUserIds) ? payload.teamBUserIds : [];
  const matchType: MatchType = payload.matchType === "SINGLES" ? "SINGLES" : "DOUBLES";
  return validateMatchPlayers(teamA, teamB, matchType);
}

async function assertActivePlayers(activity: ActivityDocument, playerIds: string[]): Promise<void> {
  if (playerIds.some((id) => !(activity.confirmedUserIds ?? []).includes(id))) {
    throw new AppError("INVALID_PARTICIPANT", "只能选择本球局正式成员");
  }
}

async function createMatchPlayers(
  store: Store,
  match: Pick<MatchDocument, "_id" | "activityId" | "teamAUserIds" | "teamBUserIds">,
  now: unknown,
): Promise<void> {
  for (const team of ["A", "B"] as const) {
    const ids = team === "A" ? match.teamAUserIds : match.teamBUserIds;
    for (const userId of ids) {
      await store
        .collection("matchPlayers")
        .doc(stableId(`${match._id}:${userId}`))
        .set({
          data: {
            activityId: match.activityId,
            matchId: match._id,
            userId,
            team,
            result: "PENDING",
            createdAt: now,
            updatedAt: now,
          },
        });
    }
  }
}

function mapMatch(match: MatchDocument, names: Map<string, string>) {
  return {
    id: match._id,
    roundId: match.roundId,
    courtLabel: match.courtLabel,
    teamA: match.teamAUserIds.map((userId) => ({ userId, nickname: names.get(userId) ?? "球友" })),
    teamB: match.teamBUserIds.map((userId) => ({ userId, nickname: names.get(userId) ?? "球友" })),
    matchType: match.matchType ?? (match.teamAUserIds.length === 1 ? "SINGLES" : "DOUBLES"),
    status: match.status,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    confirmations: match.confirmations ?? [],
    version: match.version,
  };
}

export const getLiveCourt: Handler = async (payload, context) => {
  const activityId = requiredId(isRecord(payload) ? payload.activityId : null, "球局编号");
  const user = await findCurrentUser(context);
  const activity = await getActivity(db, activityId);
  assertViewer(activity, user._id);
  const [participantResult, roundResult, matchResult] = await Promise.all([
    db.collection("participants").where({ activityId }).limit(100).get(),
    db.collection("rounds").where({ activityId }).orderBy("roundNo", "desc").limit(30).get(),
    db.collection("matches").where({ activityId }).orderBy("createdAt", "asc").limit(100).get(),
  ]);
  const participants = queryData<ParticipantDocument>(participantResult);
  const matches = queryData<MatchDocument>(matchResult);
  const userIds = [...new Set(participants.map((item) => item.userId))];
  const users = userIds.length
    ? ((await db
        .collection("users")
        .where({ _id: db.command.in(userIds) })
        .limit(100)
        .get()) as unknown)
    : [];
  const userRows = Array.isArray(users)
    ? users
    : queryData<{ _id: string; nickname: string | null }>(users);
  const names = new Map(userRows.map((item) => [item._id, item.nickname ?? "球友"]));
  return {
    activity: {
      id: activity._id,
      title: activity.title,
      status: activity.status,
      groupingEnabled: activity.groupingEnabled,
      scoringEnabled: activity.scoringEnabled,
      canManage: activity.organizerId === user._id,
    },
    participants: participants
      .filter((item) => item.status === "ACTIVE")
      .map((item) => ({
        userId: item.userId,
        nickname: names.get(item.userId) ?? "球友",
        attendanceStatus: item.attendanceStatus ?? "PENDING",
      })),
    rounds: queryData<RoundDocument>(roundResult).map((round) => ({
      id: round._id,
      roundNo: round.roundNo,
      status: round.status,
      matchIds: round.matchIds,
      version: round.version,
    })),
    matches: matches.map((match) => mapMatch(match, names)),
    currentUserId: user._id,
  };
};

export const generateGrouping: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交分组参数");
  const activityId = requiredId(payload.activityId, "球局编号");
  const courtCount = Number(payload.courtCount);
  const user = await findCurrentUser(context);
  const activity = await getActivity(db, activityId);
  if (activity.organizerId !== user._id) throw new AppError("FORBIDDEN", "只有组织者可以生成分组");
  if (!activity.groupingEnabled) throw new AppError("FEATURE_DISABLED", "该球局未开启组队");
  assertLiveActivity(activity);
  const existingDraft = (await db
    .collection("rounds")
    .where({ activityId, status: "DRAFT" })
    .limit(1)
    .get()) as unknown as { data: RoundDocument[] };
  if (queryData<RoundDocument>(existingDraft)[0])
    throw new AppError("DRAFT_EXISTS", "请先发布当前待发布轮次");

  const [participantResult, playerResult, lastRoundResult, courtResult] = await Promise.all([
    db
      .collection("participants")
      .where({ activityId, status: "ACTIVE", attendanceStatus: "CHECKED_IN" })
      .limit(100)
      .get(),
    db.collection("matchPlayers").where({ activityId }).limit(500).get(),
    db.collection("rounds").where({ activityId }).orderBy("roundNo", "desc").limit(1).get(),
    db.collection("courts").where({ venueId: activity.venueId }).limit(20).get(),
  ]);
  const participantIds = queryData<ParticipantDocument>(participantResult).map(
    (item) => item.userId,
  );
  const userResult = participantIds.length
    ? await db
        .collection("users")
        .where({ _id: db.command.in(participantIds) })
        .limit(100)
        .get()
    : null;
  const users = queryData<{ _id: string; level: string }>(userResult);
  const playCounts = new Map<string, number>();
  for (const player of queryData<{ userId: string; result: string }>(playerResult)) {
    if (player.result !== "VOID")
      playCounts.set(player.userId, (playCounts.get(player.userId) ?? 0) + 1);
  }
  const candidates: GroupingCandidate[] = users.map((item) => ({
    userId: item._id,
    level: item.level,
    gamesPlayed: playCounts.get(item._id) ?? 0,
  }));
  const roundNo = (queryData<RoundDocument>(lastRoundResult)[0]?.roundNo ?? 0) + 1;
  const generated = generateBalancedMatches(candidates, courtCount, `${activityId}:${roundNo}`);
  const courts = queryData<{ name: string; status?: string }>(courtResult).filter(
    (court) => !court.status || court.status === "ACTIVE",
  );
  const roundId = stableId(`${activityId}:round:${roundNo}`);
  const now = db.serverDate();
  const matches: MatchDocument[] = generated.map((item, index) => ({
    _id: stableId(`${roundId}:match:${index + 1}`),
    activityId,
    roundId,
    courtLabel: courts[index]?.name ?? `场地${index + 1}`,
    ...item,
    matchType: "DOUBLES",
    status: "DRAFT",
    scoreA: null,
    scoreB: null,
    confirmations: [],
    version: 1,
    createdBy: user._id,
  }));
  await db.runTransaction(async (transaction: Store) => {
    await transaction
      .collection("rounds")
      .doc(roundId)
      .set({
        data: {
          activityId,
          roundNo,
          status: "DRAFT",
          matchIds: matches.map((item) => item._id),
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
      });
    for (const match of matches) {
      await transaction
        .collection("matches")
        .doc(match._id)
        .set({ data: { ...match, createdAt: now, updatedAt: now } });
      await createMatchPlayers(transaction, match, now);
    }
  });
  return { round: { id: roundId, roundNo, status: "DRAFT" }, matchCount: matches.length };
};

export const publishRound: Handler = async (payload, context) => {
  const roundId = requiredId(isRecord(payload) ? payload.roundId : null, "轮次编号");
  const user = await findCurrentUser(context);
  const round = documentData<RoundDocument>(
    await db.collection("rounds").where({ _id: roundId }).limit(1).get(),
  );
  if (!round) throw new AppError("ROUND_NOT_FOUND", "轮次不存在");
  const activity = await getActivity(db, round.activityId);
  if (activity.organizerId !== user._id) throw new AppError("FORBIDDEN", "只有组织者可以发布安排");
  assertLiveActivity(activity);
  if (round.status === "PUBLISHED") return { round: { id: roundId, status: "PUBLISHED" } };
  if (round.status !== "DRAFT") throw new AppError("INVALID_STATE", "当前轮次不能发布");
  const now = db.serverDate();
  await db.runTransaction(async (transaction: Store) => {
    await transaction
      .collection("rounds")
      .doc(roundId)
      .update({
        data: { status: "PUBLISHED", version: round.version + 1, publishedAt: now, updatedAt: now },
      });
    await transaction
      .collection("matches")
      .where({ roundId })
      .update({ data: { status: "SCHEDULED", updatedAt: now } });
    await transaction.collection("auditLogs").add({
      data: {
        actorId: user._id,
        action: "ROUND_PUBLISHED",
        objectType: "ROUND",
        objectId: roundId,
        metadata: { roundNo: round.roundNo },
        createdAt: now,
      },
    });
  });
  return { round: { id: roundId, status: "PUBLISHED" } };
};

export const updateDraftMatch: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交分组调整");
  const matchId = requiredId(payload.matchId, "对局编号");
  const expectedVersion = requiredVersion(payload.version);
  const players = parsePlayers(payload);
  const user = await findCurrentUser(context);
  const match = await getMatch(db, matchId);
  if (!match.roundId || match.status !== "DRAFT") {
    throw new AppError("INVALID_STATE", "只有待发布分组可以调整");
  }
  const activity = await getActivity(db, match.activityId);
  if (activity.organizerId !== user._id) throw new AppError("FORBIDDEN", "只有组织者可以调整分组");
  const selected = [...players.teamAUserIds, ...players.teamBUserIds];
  await assertActivePlayers(activity, selected);
  const attendance = await db
    .collection("participants")
    .where({
      activityId: activity._id,
      userId: db.command.in(selected),
      status: "ACTIVE",
      attendanceStatus: "CHECKED_IN",
    })
    .limit(4)
    .get();
  if (queryData<ParticipantDocument>(attendance).length !== 4)
    throw new AppError("INVALID_PARTICIPANT", "分组只能使用已到场球友");
  const roundMatches = await db
    .collection("matches")
    .where({ roundId: match.roundId })
    .limit(20)
    .get();
  const occupied = queryData<MatchDocument>(roundMatches)
    .filter((item) => item._id !== matchId)
    .flatMap((item) => [...item.teamAUserIds, ...item.teamBUserIds]);
  if (selected.some((id) => occupied.includes(id)))
    throw new AppError("PLAYER_CONFLICT", "同一轮中有球友已被安排到其他场地");
  const now = db.serverDate();
  await db.runTransaction(async (transaction: Store) => {
    const fresh = await getMatch(transaction, matchId);
    if (fresh.version !== expectedVersion)
      throw new AppError("VERSION_CONFLICT", "分组已更新，请刷新后重试");
    await transaction.collection("matchPlayers").where({ matchId }).remove();
    await transaction
      .collection("matches")
      .doc(matchId)
      .update({ data: { ...players, version: fresh.version + 1, updatedAt: now } });
    await createMatchPlayers(
      transaction,
      { _id: matchId, activityId: match.activityId, ...players },
      now,
    );
    await transaction.collection("auditLogs").add({
      data: {
        actorId: user._id,
        action: "GROUPING_ADJUSTED",
        objectType: "MATCH",
        objectId: matchId,
        metadata: {},
        createdAt: now,
      },
    });
  });
  return { match: { id: matchId, version: expectedVersion + 1 } };
};

export const createManualMatch: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交对局信息");
  const activityId = requiredId(payload.activityId, "球局编号");
  const idempotencyKey = requiredId(payload.idempotencyKey, "幂等键");
  const players = parsePlayers(payload);
  const user = await findCurrentUser(context);
  const activity = await getActivity(db, activityId);
  assertViewer(activity, user._id);
  if (!activity.scoringEnabled) throw new AppError("FEATURE_DISABLED", "该球局未开启计分");
  assertLiveActivity(activity);
  await assertActivePlayers(activity, [...players.teamAUserIds, ...players.teamBUserIds]);
  const matchId = stableId(`${activityId}:${user._id}:${idempotencyKey}`);
  const existing = await db.collection("matches").where({ _id: matchId }).limit(1).get();
  if (queryData<MatchDocument>(existing)[0]) return { match: { id: matchId } };
  const now = db.serverDate();
  const match: MatchDocument = {
    _id: matchId,
    activityId,
    roundId: null,
    courtLabel:
      typeof payload.courtLabel === "string"
        ? payload.courtLabel.trim().slice(0, 40) || "自由场"
        : "自由场",
    ...players,
    status: "SCHEDULED",
    scoreA: null,
    scoreB: null,
    confirmations: [],
    version: 1,
    createdBy: user._id,
    idempotencyKey,
  };
  await db.runTransaction(async (transaction: Store) => {
    await transaction
      .collection("matches")
      .doc(matchId)
      .set({ data: { ...match, createdAt: now, updatedAt: now } });
    await createMatchPlayers(transaction, match, now);
  });
  return { match: { id: matchId } };
};

export const submitScore: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交比分");
  const matchId = requiredId(payload.matchId, "对局编号");
  const expectedVersion = requiredVersion(payload.version);
  const scoreA = Number(payload.scoreA);
  const scoreB = Number(payload.scoreB);
  validateBadmintonScore(scoreA, scoreB);
  const user = await findCurrentUser(context);
  const match = await getMatch(db, matchId);
  const activity = await getActivity(db, match.activityId);
  assertViewer(activity, user._id);
  if (!activity.scoringEnabled) throw new AppError("FEATURE_DISABLED", "该球局未开启计分");
  assertLiveActivity(activity);
  const outcome = await db.runTransaction(async (transaction: Store) => {
    const fresh = await getMatch(transaction, matchId);
    const now = db.serverDate();
    if (fresh.version !== expectedVersion) {
      await transaction.collection("scoreRevisions").add({
        data: {
          activityId: fresh.activityId,
          matchId,
          actorId: user._id,
          action: "SUBMIT",
          scoreA,
          scoreB,
          expectedVersion,
          actualVersion: fresh.version,
          status: "CONFLICT",
          createdAt: now,
        },
      });
      return { conflict: true, version: fresh.version };
    }
    if (fresh.status === "LOCKED" || fresh.status === "VOID")
      throw new AppError("INVALID_STATE", "该比分已锁定或作废");
    const team = teamForUser(user._id, fresh.teamAUserIds, fresh.teamBUserIds);
    const confirmations = team ? [team] : [];
    const nextVersion = fresh.version + 1;
    await transaction
      .collection("matches")
      .doc(matchId)
      .update({
        data: {
          scoreA,
          scoreB,
          confirmations,
          status: "PENDING_CONFIRMATION",
          version: nextVersion,
          scoreSubmittedBy: user._id,
          updatedAt: now,
        },
      });
    await transaction.collection("scoreRevisions").add({
      data: {
        activityId: fresh.activityId,
        matchId,
        actorId: user._id,
        action: "SUBMIT",
        scoreA,
        scoreB,
        fromVersion: fresh.version,
        toVersion: nextVersion,
        status: "CURRENT",
        createdAt: now,
      },
    });
    return { conflict: false, version: nextVersion };
  });
  if (outcome.conflict)
    throw new AppError(
      "SCORE_CONFLICT",
      `比分已被他人更新，请刷新后重试（当前版本${outcome.version}）`,
    );
  return { match: { id: matchId, status: "PENDING_CONFIRMATION", version: outcome.version } };
};

async function applyLockedResults(
  store: Store,
  match: MatchDocument,
  scoreA: number,
  scoreB: number,
  now: unknown,
): Promise<void> {
  const winner = scoreA > scoreB ? "A" : "B";
  await store
    .collection("matchPlayers")
    .where({ matchId: match._id, team: winner })
    .update({ data: { result: "WIN", updatedAt: now } });
  await store
    .collection("matchPlayers")
    .where({ matchId: match._id, team: winner === "A" ? "B" : "A" })
    .update({ data: { result: "LOSS", updatedAt: now } });
}

export const confirmScore: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交确认信息");
  const matchId = requiredId(payload.matchId, "对局编号");
  const expectedVersion = requiredVersion(payload.version);
  const user = await findCurrentUser(context);
  const outcome = await db.runTransaction(async (transaction: Store) => {
    const match = await getMatch(transaction, matchId);
    const activity = await getActivity(transaction, match.activityId);
    assertViewer(activity, user._id);
    const team = teamForUser(user._id, match.teamAUserIds, match.teamBUserIds);
    if (!team) throw new AppError("FORBIDDEN", "只有本场参赛球友可以确认比分");
    if (match.status !== "PENDING_CONFIRMATION" || match.scoreA === null || match.scoreB === null)
      throw new AppError("INVALID_STATE", "当前没有待确认比分");
    if (match.version !== expectedVersion)
      throw new AppError("SCORE_CONFLICT", "比分已更新，请刷新后确认");
    const confirmations = [...new Set([...(match.confirmations ?? []), team])];
    const locked = confirmations.includes("A") && confirmations.includes("B");
    const nextVersion = match.version + 1;
    const now = db.serverDate();
    await transaction
      .collection("matches")
      .doc(matchId)
      .update({
        data: {
          confirmations,
          status: locked ? "LOCKED" : "PENDING_CONFIRMATION",
          version: nextVersion,
          ...(locked ? { lockedAt: now } : {}),
          updatedAt: now,
        },
      });
    await transaction.collection("scoreRevisions").add({
      data: {
        activityId: match.activityId,
        matchId,
        actorId: user._id,
        action: locked ? "AUTO_LOCK" : "CONFIRM",
        scoreA: match.scoreA,
        scoreB: match.scoreB,
        fromVersion: match.version,
        toVersion: nextVersion,
        status: locked ? "LOCKED" : "CURRENT",
        createdAt: now,
      },
    });
    if (locked) await applyLockedResults(transaction, match, match.scoreA, match.scoreB, now);
    return { status: locked ? "LOCKED" : "PENDING_CONFIRMATION", version: nextVersion };
  });
  return { match: { id: matchId, ...outcome } };
};

export const lockScore: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交锁定比分");
  const matchId = requiredId(payload.matchId, "对局编号");
  const expectedVersion = requiredVersion(payload.version);
  const scoreA = Number(payload.scoreA);
  const scoreB = Number(payload.scoreB);
  validateBadmintonScore(scoreA, scoreB);
  const user = await findCurrentUser(context);
  const result = await db.runTransaction(async (transaction: Store) => {
    const match = await getMatch(transaction, matchId);
    const activity = await getActivity(transaction, match.activityId);
    if (activity.organizerId !== user._id)
      throw new AppError("FORBIDDEN", "只有组织者可以处理比分冲突");
    if (match.version !== expectedVersion)
      throw new AppError("SCORE_CONFLICT", "比分已更新，请刷新后处理");
    if (match.status === "VOID") throw new AppError("INVALID_STATE", "作废对局不能锁定");
    const now = db.serverDate();
    const nextVersion = match.version + 1;
    await transaction
      .collection("matches")
      .doc(matchId)
      .update({
        data: {
          scoreA,
          scoreB,
          confirmations: ["A", "B"],
          status: "LOCKED",
          version: nextVersion,
          lockedAt: now,
          lockedBy: user._id,
          updatedAt: now,
        },
      });
    await transaction.collection("scoreRevisions").add({
      data: {
        activityId: match.activityId,
        matchId,
        actorId: user._id,
        action: "ORGANIZER_LOCK",
        scoreA,
        scoreB,
        fromVersion: match.version,
        toVersion: nextVersion,
        status: "LOCKED",
        createdAt: now,
      },
    });
    await applyLockedResults(transaction, match, scoreA, scoreB, now);
    return { version: nextVersion };
  });
  return { match: { id: matchId, status: "LOCKED", version: result.version } };
};

export const unlockScore: Handler = async (payload, context) => {
  if (!isRecord(payload)) throw new AppError("INVALID_ARGUMENT", "请提交解锁原因");
  const matchId = requiredId(payload.matchId, "对局编号");
  const expectedVersion = requiredVersion(payload.version);
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (reason.length < 2 || reason.length > 200)
    throw new AppError("INVALID_ARGUMENT", "解锁原因需为2至200个字符");
  const user = await findCurrentUser(context);
  const result = await db.runTransaction(async (transaction: Store) => {
    const match = await getMatch(transaction, matchId);
    const activity = await getActivity(transaction, match.activityId);
    if (activity.organizerId !== user._id)
      throw new AppError("FORBIDDEN", "只有组织者可以解锁比分");
    if (match.status !== "LOCKED") throw new AppError("INVALID_STATE", "当前比分未锁定");
    if (match.version !== expectedVersion)
      throw new AppError("SCORE_CONFLICT", "比分已更新，请刷新后处理");
    const now = db.serverDate();
    const nextVersion = match.version + 1;
    await transaction
      .collection("matches")
      .doc(matchId)
      .update({
        data: {
          status: "PENDING_CONFIRMATION",
          confirmations: [],
          version: nextVersion,
          unlockedAt: now,
          unlockedBy: user._id,
          updatedAt: now,
        },
      });
    await transaction
      .collection("matchPlayers")
      .where({ matchId })
      .update({ data: { result: "PENDING", updatedAt: now } });
    await transaction.collection("scoreRevisions").add({
      data: {
        activityId: match.activityId,
        matchId,
        actorId: user._id,
        action: "UNLOCK",
        scoreA: match.scoreA,
        scoreB: match.scoreB,
        fromVersion: match.version,
        toVersion: nextVersion,
        reason,
        status: "CURRENT",
        createdAt: now,
      },
    });
    return { version: nextVersion };
  });
  return { match: { id: matchId, status: "PENDING_CONFIRMATION", version: result.version } };
};

export const getPlayerStats: Handler = async (_payload, context) => {
  const user = await findCurrentUser(context);
  const result = await db.collection("matchPlayers").where({ userId: user._id }).limit(500).get();
  const completed = queryData<{ result: string }>(result).filter(
    (item) => item.result === "WIN" || item.result === "LOSS",
  );
  const wins = completed.filter((item) => item.result === "WIN").length;
  return {
    stats: {
      games: completed.length,
      wins,
      losses: completed.length - wins,
      winRate: completed.length ? Math.round((wins / completed.length) * 1000) / 10 : null,
    },
  };
};
