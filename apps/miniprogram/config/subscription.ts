export type SubscriptionTemplateKey =
  | "ACTIVITY_UPDATE"
  | "ACTIVITY_CANCELLED"
  | "WAITLIST_PROMOTED";

export type SubscriptionTemplate = {
  key: SubscriptionTemplateKey;
  id: string;
  label: string;
};

export const SUBSCRIPTION_TEMPLATES: SubscriptionTemplate[] = [
  {
    key: "ACTIVITY_UPDATE",
    id: "cqCZYss6j--bOHkYnZs2VEJoxE6mBK6ifpuocdagg0A",
    label: "球局时间或场地变更",
  },
  {
    key: "ACTIVITY_CANCELLED",
    id: "cqCZYss6j--bOHkYnZs2VEJoxE6mBK6ifpuocdagg0A",
    label: "球局取消",
  },
  {
    key: "WAITLIST_PROMOTED",
    id: "SH-jFRByW81RL-m1nmw294VxYQ8Fota5ysyGd4XMgkM",
    label: "候补递补",
  },
];

export function configuredSubscriptionTemplates(): SubscriptionTemplate[] {
  const uniqueTemplates = new Map<string, SubscriptionTemplate>();
  for (const template of SUBSCRIPTION_TEMPLATES) {
    if (template.id.trim().length >= 8 && !uniqueTemplates.has(template.id)) {
      uniqueTemplates.set(template.id, template);
    }
  }
  return [...uniqueTemplates.values()].slice(0, 3);
}
