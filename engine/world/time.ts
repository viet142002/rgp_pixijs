/**
 * World time management.
 */

import type { WorldTime } from "../types.js";

export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;

/**
 * Advance world time by N minutes. Returns whether day changed.
 */
export function advanceMinutes(time: WorldTime, minutes: number): { dayChanged: boolean } {
  let totalMin = time.day * MINUTES_PER_DAY + time.hour * MINUTES_PER_HOUR + time.minute + minutes;
  const newDay = Math.floor(totalMin / MINUTES_PER_DAY);
  totalMin = totalMin - newDay * MINUTES_PER_DAY;
  const newHour = Math.floor(totalMin / MINUTES_PER_HOUR);
  const newMinute = totalMin - newHour * MINUTES_PER_HOUR;

  const dayChanged = newDay !== time.day;
  time.day = newDay;
  time.hour = newHour;
  time.minute = newMinute;

  return { dayChanged };
}

/**
 * Format time as "Day X, HH:MM"
 */
export function formatTime(time: WorldTime): string {
  const hh = String(time.hour).padStart(2, "0");
  const mm = String(time.minute).padStart(2, "0");
  return `Day ${time.day}, ${hh}:${mm}`;
}

/**
 * Get current phase of day (0=morning, 1=noon, 2=evening, 3=night).
 */
export function getDayPhase(hour: number): "morning" | "noon" | "evening" | "night" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "noon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/**
 * Compare two times. Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareTime(a: WorldTime, b: WorldTime): number {
  const aTotal = a.day * MINUTES_PER_DAY + a.hour * MINUTES_PER_HOUR + a.minute;
  const bTotal = b.day * MINUTES_PER_DAY + b.hour * MINUTES_PER_HOUR + b.minute;
  return aTotal - bTotal;
}
