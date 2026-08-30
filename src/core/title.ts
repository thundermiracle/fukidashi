import type { PageTitle } from "./types";

/**
 * Reads a stored title in whichever format it was written. Titles used to be
 * plain strings; those read as never updated, so any timestamped title wins
 * a merge against them.
 */
export function toPageTitle(value: unknown): PageTitle | undefined {
  if (typeof value === "string") return { text: value, updatedAt: 0 };
  if (typeof value !== "object" || value === null) return undefined;

  const title = value as Partial<PageTitle>;
  return typeof title.text === "string" && typeof title.updatedAt === "number"
    ? { text: title.text, updatedAt: title.updatedAt }
    : undefined;
}
