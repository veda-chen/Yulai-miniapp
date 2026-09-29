import type { ToolId } from "./appearance";

export type ToolDefinition = {
  id: ToolId;
  title: string;
  description: string;
  icon: string;
  tone: string;
  url: string;
};

export const TOOL_DEFINITIONS: Record<ToolId, ToolDefinition> = {
  grouping: {
    id: "grouping",
    title: "公平组队",
    description: "按到场人数生成整批双打赛程",
    icon: "组",
    tone: "orange",
    url: "/pages/tools/rotation",
  },
  scoring: {
    id: "scoring",
    title: "临时计分",
    description: "21分制，支持撤回",
    icon: "分",
    tone: "green",
    url: "/pages/tools/scoring",
  },
  rotation: {
    id: "rotation",
    title: "公平组队",
    description: "按到场人数生成整批双打赛程",
    icon: "组",
    tone: "orange",
    url: "/pages/tools/rotation",
  },
  draw: {
    id: "draw",
    title: "公平组队",
    description: "按到场人数生成整批双打赛程",
    icon: "组",
    tone: "orange",
    url: "/pages/tools/rotation",
  },
  expense: {
    id: "expense",
    title: "费用均摊",
    description: "计算AA与最少转账方案",
    icon: "AA",
    tone: "green",
    url: "/pages/tools/expense",
  },
  rules: {
    id: "rules",
    title: "规则速查",
    description: "计分、发球与常见违例",
    icon: "规",
    tone: "blue",
    url: "/pages/tools/rules",
  },
};

export const VISIBLE_TOOL_IDS: ToolId[] = ["rotation", "scoring", "expense", "rules"];

export function canonicalToolId(id: ToolId): ToolId {
  return id === "grouping" || id === "draw" ? "rotation" : id;
}

export function visibleToolIds(order: ToolId[], selected?: ToolId[]): ToolId[] {
  const selectedSet = selected ? new Set(selected.map(canonicalToolId)) : null;
  const result: ToolId[] = [];
  for (const rawId of order) {
    const id = canonicalToolId(rawId);
    if (!VISIBLE_TOOL_IDS.includes(id) || result.includes(id)) continue;
    if (!selectedSet || selectedSet.has(id)) result.push(id);
  }
  if (!selectedSet) {
    for (const id of VISIBLE_TOOL_IDS) if (!result.includes(id)) result.push(id);
  }
  return result;
}

export function expandVisibleToolOrder(order: ToolId[]): ToolId[] {
  const result: ToolId[] = [];
  for (const id of order) {
    if (id === "rotation") result.push("grouping", "rotation", "draw");
    else result.push(id);
  }
  return result;
}
