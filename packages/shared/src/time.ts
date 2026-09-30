const HOUR_MS = 3_600_000;

/** Start (epoch ms) of the UTC hour window containing `ts`. */
export function hourWindowStart(ts: number): number {
  return Math.floor(ts / HOUR_MS) * HOUR_MS;
}

export function nextHourWindowStart(ts: number): number {
  return hourWindowStart(ts) + HOUR_MS;
}

/** Stable label for a window, used in Redis keys / alert dedupe. */
export function hourWindowLabel(ts: number): string {
  return new Date(hourWindowStart(ts)).toISOString().slice(0, 13);
}
