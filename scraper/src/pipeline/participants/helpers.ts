type DropCheckResult =
  | { keep: false }
  | { keep: true; reason: string };

export function shouldKeepExistingParticipants(
  fetchedCount: number,
  previousCount: number,
): DropCheckResult {
  if (fetchedCount === 0 && previousCount > 0) {
    return {
      keep: true,
      reason: `API returned 0 — keeping existing ${previousCount} participants`,
    };
  }

  const drop = previousCount - fetchedCount;
  const dropPercent = previousCount > 0 ? drop / previousCount : 0;
  if (drop >= 10 && dropPercent >= 0.2) {
    return {
      keep: true,
      reason: `${previousCount} → ${fetchedCount} (−${drop}, −${Math.round(dropPercent * 100)}%) — keeping existing`,
    };
  }

  return { keep: false };
}
