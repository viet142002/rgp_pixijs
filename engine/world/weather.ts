/**
 * Weather system.
 *
 * Rolls daily weather when day changes. Weather has duration (1-4 days).
 * Effects:
 * - clear: baseline encounter rate
 * - cloudy: encounter 0.9x
 * - rain: encounter 0.7x, HP regen 1.2x (slow travel)
 * - storm: encounter 0.5x, no flight
 * - fog: encounter 1.3x (hidden threats)
 * - snow: encounter 0.6x, slow
 */

import type { WeatherId } from "../types.js";

export interface WeatherEffect {
  encounterMultiplier: number;
  hpRegenPerHour: number;
  speedMultiplier: number;
  canFly: boolean;
  visibilityPenalty: number; // 0-1
}

export const WEATHER_EFFECTS: Record<WeatherId, WeatherEffect> = {
  clear:   { encounterMultiplier: 1.0, hpRegenPerHour: 2,  speedMultiplier: 1.0, canFly: true,  visibilityPenalty: 0 },
  cloudy:  { encounterMultiplier: 0.9, hpRegenPerHour: 2,  speedMultiplier: 0.95, canFly: true, visibilityPenalty: 0.05 },
  rain:    { encounterMultiplier: 0.7, hpRegenPerHour: 3,  speedMultiplier: 0.85, canFly: false, visibilityPenalty: 0.15 },
  storm:   { encounterMultiplier: 0.5, hpRegenPerHour: 4,  speedMultiplier: 0.6,  canFly: false, visibilityPenalty: 0.4 },
  fog:     { encounterMultiplier: 1.3, hpRegenPerHour: 1,  speedMultiplier: 0.9,  canFly: true,  visibilityPenalty: 0.5 },
  snow:    { encounterMultiplier: 0.6, hpRegenPerHour: 2,  speedMultiplier: 0.7,  canFly: false, visibilityPenalty: 0.3 },
};

export const WEATHER_LIST: WeatherId[] = ["clear", "cloudy", "rain", "storm", "fog", "snow"];
export const DEFAULT_WEATHER: WeatherId = "clear";

/**
 * Roll next weather when current expires. Uses RNG state.
 * Clear weather has higher probability; bad weather rarer.
 */
export function rollWeather(rng: { state: number }): { weather: WeatherId; durationDays: number } {
  // Weighted random
  const weights: Record<WeatherId, number> = {
    clear: 35,
    cloudy: 25,
    rain: 18,
    fog: 10,
    snow: 7,
    storm: 5,
  };
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  let roll = (rng.state * 1103515245 + 12345) & 0x7fffffff;
  rng.state = roll;
  roll = roll % total;
  let acc = 0;
  let chosen: WeatherId = "clear";
  for (const w of WEATHER_LIST) {
    acc += weights[w];
    if (roll < acc) { chosen = w; break; }
  }
  // Duration: 1-4 days, weather-dependent
  const durRoll = (rng.state * 1103515245 + 12345) & 0x7fffffff;
  rng.state = durRoll;
  const baseDur = chosen === "clear" ? 3 : 2;
  const maxDur = chosen === "storm" ? 2 : 4;
  const durationDays = baseDur + (durRoll % (maxDur - baseDur + 1));
  return { weather: chosen, durationDays };
}

/**
 * Advance weather by one day. If current weather expired, roll new.
 */
export function tickWeather(
  weather: WeatherId,
  weatherDaysLeft: number,
  rng: { state: number }
): { weather: WeatherId; weatherDaysLeft: number } {
  const remaining = weatherDaysLeft - 1;
  if (remaining > 0) {
    return { weather, weatherDaysLeft: remaining };
  }
  const next = rollWeather(rng);
  return { weather: next.weather, weatherDaysLeft: next.durationDays };
}

/**
 * Get effect for current weather.
 */
export function getWeatherEffect(weather: WeatherId): WeatherEffect {
  return WEATHER_EFFECTS[weather];
}
