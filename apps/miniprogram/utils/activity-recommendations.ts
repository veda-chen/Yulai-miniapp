export type SearchableActivity = {
  title: string;
  venue: { name: string };
  levelText: string;
  currentRegistrationStatus: string | null;
};

export function filterRecommendedActivities<T extends SearchableActivity>(
  activities: T[],
  keyword: string,
  limit = 8,
): T[] {
  const normalized = keyword.trim().toLowerCase();
  return activities
    .filter(
      (activity) =>
        activity.currentRegistrationStatus !== "CONFIRMED" &&
        activity.currentRegistrationStatus !== "WAITLISTED",
    )
    .filter((activity) => {
      if (!normalized) return true;
      return `${activity.title} ${activity.venue.name} ${activity.levelText}`
        .toLowerCase()
        .includes(normalized);
    })
    .slice(0, limit);
}
