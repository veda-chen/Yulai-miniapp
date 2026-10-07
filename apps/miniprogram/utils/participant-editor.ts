export function splitParticipantNames(value: string): string[] {
  return value
    .split(/[\n,，;；]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function participantValues(value: string, minimum: number, maximum: number): string[] {
  const names = splitParticipantNames(value).slice(0, maximum);
  return [...names, ...Array(Math.max(0, minimum - names.length)).fill("")];
}

export function duplicateParticipantErrors(values: string[]): string[] {
  const positions = new Map<string, number[]>();
  values.forEach((value, index) => {
    const name = value.trim();
    if (!name) return;
    const indexes = positions.get(name) ?? [];
    indexes.push(index);
    positions.set(name, indexes);
  });
  return values.map((value, index) => {
    const name = value.trim();
    const indexes = name ? (positions.get(name) ?? []) : [];
    if (indexes.length < 2) return "";
    const otherIndex = indexes.find((item) => item !== index) ?? index;
    return `与第${otherIndex + 1}位球友重名`;
  });
}

export function removeParticipantValue(values: string[], index: number, minimum: number): string[] {
  const result = values.filter((_, itemIndex) => itemIndex !== index);
  while (result.length < minimum) result.push("");
  return result;
}

export function mergeParticipantValues(
  values: string[],
  input: string,
  maximum: number,
): { values: string[]; imported: number; skipped: number } {
  const result = [...values];
  const existing = new Set(result.map((value) => value.trim()).filter(Boolean));
  let imported = 0;
  let skipped = 0;
  for (const name of splitParticipantNames(input)) {
    if (existing.has(name)) {
      skipped += 1;
      continue;
    }
    const emptyIndex = result.findIndex((value) => !value.trim());
    if (emptyIndex >= 0) result[emptyIndex] = name;
    else if (result.length < maximum) result.push(name);
    else {
      skipped += 1;
      continue;
    }
    existing.add(name);
    imported += 1;
  }
  return { values: result, imported, skipped };
}
