import { day } from "./db";

/** The Month as the team says it: "September 2026". */
export function formatMonth(monthStart: string): string {
  return new Date(`${day(monthStart)}T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Render whole VND in the notation the team says out loud (ADR-0001).
 * Parsing the other way belongs in the fund operations module, not here.
 */
export function formatVnd(amountVnd: number): string {
  return `${(amountVnd / 1000).toLocaleString("en-GB", { maximumFractionDigits: 3 })}k`;
}
