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
    id: "",
    label: "球局时间或场地变更",
  },
  {
    key: "ACTIVITY_CANCELLED",
    id: "",
    label: "球局取消",
  },
  {
    key: "WAITLIST_PROMOTED",
    id: "",
    label: "候补递补",
  },
];

export function configuredSubscriptionTemplates(): SubscriptionTemplate[] {
  return SUBSCRIPTION_TEMPLATES.filter((template) => template.id.trim().length >= 8).slice(0, 3);
}
