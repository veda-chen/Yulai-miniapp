export type ToolDraftId = "scoring" | "rotation" | "draw" | "expense";
export type ToolDraftEnvelope<T> = { schemaVersion: 1; updatedAt: number; data: T };

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TOOL_IDS: ToolDraftId[] = ["scoring", "rotation", "draw", "expense"];
const keyFor = (id: ToolDraftId) => `yulai:tool:${id}:v1`;
let lastStorageWarningAt = 0;

function warnStorageFailure() {
  const now = Date.now();
  if (now - lastStorageWarningAt < 5000) return;
  lastStorageWarningAt = now;
  wx.showToast({ title: "本机临时数据保存失败，请检查存储空间", icon: "none" });
}

export function isFreshToolDraft(
  value: unknown,
  now = Date.now(),
): value is ToolDraftEnvelope<unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    typeof record.updatedAt === "number" &&
    record.updatedAt <= now &&
    now - record.updatedAt <= RETENTION_MS &&
    "data" in record
  );
}

export function loadToolDraft<T>(
  id: ToolDraftId,
  validate: (value: unknown) => value is T,
): T | null {
  try {
    const stored = wx.getStorageSync(keyFor(id)) as unknown;
    if (!isFreshToolDraft(stored) || !validate(stored.data)) {
      wx.removeStorageSync(keyFor(id));
      return null;
    }
    return stored.data;
  } catch {
    return null;
  }
}

export function saveToolDraft<T>(id: ToolDraftId, data: T) {
  try {
    wx.setStorageSync(keyFor(id), { schemaVersion: 1, updatedAt: Date.now(), data });
    return true;
  } catch {
    warnStorageFailure();
    return false;
  }
}

export function clearToolDraft(id: ToolDraftId) {
  try {
    wx.removeStorageSync(keyFor(id));
    return true;
  } catch {
    warnStorageFailure();
    return false;
  }
}

export function clearAllToolDrafts() {
  let success = true;
  for (const id of TOOL_IDS) if (!clearToolDraft(id)) success = false;
  return success;
}

export function cleanupExpiredToolDrafts() {
  for (const id of TOOL_IDS) {
    try {
      const value = wx.getStorageSync(keyFor(id)) as unknown;
      if (value && !isFreshToolDraft(value)) wx.removeStorageSync(keyFor(id));
    } catch {}
  }
}
