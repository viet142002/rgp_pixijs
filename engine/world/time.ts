/**
 * World time management.
 */

import type { WorldTime, DayPhase } from "../types.js";

export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;

/**
 * Get current phase of day.
 * dawn 5-7, morning 7-11, noon 11-13, afternoon 13-17, evening 17-21, night 21-5.
 */
export function getDayPhase(hour: number): DayPhase {
  if (hour >= 5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 11) return "morning";
  if (hour >= 11 && hour < 13) return "noon";
  if (hour >= 13 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/**
 * Advance world time by N minutes. Updates phase. Returns whether day changed.
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
  time.phase = getDayPhase(newHour);

  return { dayChanged };
}

/**
 * Format time as "Day X, HH:MM (phase)".
 */
export function formatTime(time: WorldTime): string {
  const hh = String(time.hour).padStart(2, "0");
  const mm = String(time.minute).padStart(2, "0");
  const phaseVN: Record<DayPhase, string> = {
    dawn: "Bình Minh",
    morning: "Sáng",
    noon: "Trưa",
    afternoon: "Chiều",
    evening: "Tối",
    night: "Đêm",
  };
  return `Ngày ${time.day}, ${hh}:${mm} (${phaseVN[time.phase]})`;
}

/**
 * Compare two times. Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareTime(a: WorldTime, b: WorldTime): number {
  const aTotal = a.day * MINUTES_PER_DAY + a.hour * MINUTES_PER_HOUR + a.minute;
  const bTotal = b.day * MINUTES_PER_DAY + b.hour * MINUTES_PER_HOUR + b.minute;
  return aTotal - bTotal;
}

/**
 * Is it daytime (safe to travel)?
 */
export function isDaytime(hour: number): boolean {
  return hour >= 6 && hour < 20;
}
