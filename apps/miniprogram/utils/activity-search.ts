export const ACTIVITY_SEARCH_MAX_LENGTH = 50;

export function normalizeActivitySearchKeyword(value: string): string {
  return value.trim().slice(0, ACTIVITY_SEARCH_MAX_LENGTH);
}

export function activitySearchListUrl(keyword: string): string {
  const normalized = normalizeActivitySearchKeyword(keyword);
  return normalized
    ? `/pages/activities/list?keyword=${encodeURIComponent(normalized)}`
    : "/pages/activities/list";
}

export class RequestVersion {
  private version = 0;

  begin(): number {
    this.version += 1;
    return this.version;
  }

  invalidate(): void {
    this.version += 1;
  }

  isCurrent(version: number): boolean {
    return version === this.version;
  }
}
