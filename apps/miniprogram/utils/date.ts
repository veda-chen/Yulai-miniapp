const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000;

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

export function formatChinaDateTime(value: string): string {
  const date = new Date(new Date(value).getTime() + SHANGHAI_OFFSET);
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function toChinaFormValue(value: string): { date: string; time: string } {
  const date = new Date(new Date(value).getTime() + SHANGHAI_OFFSET);
  return {
    date: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
    time: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`,
  };
}

export function getDefaultActivityTimes(now = new Date()) {
  const local = new Date(now.getTime() + SHANGHAI_OFFSET + 24 * 60 * 60 * 1000);
  const date = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  return {
    startDate: date,
    startTime: "19:00",
    endDate: date,
    endTime: "21:00",
    deadlineDate: date,
    deadlineTime: "17:00",
  };
}

export function chinaFormToIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+08:00`).toISOString();
}
