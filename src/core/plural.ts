/** "1 note", "3 notes" — the plural is the singular plus an s unless given. */
export function formatCount(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}
