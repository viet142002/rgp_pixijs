/**
 * Combo system.
 *
 * Combo tier increases with consecutive attacks.
 * Resets on stun, non-attack skill, or turn interleaved.
 */

import type { Combatant } from "../types.js";

export interface ComboBonus {
  damageBonus: number;  // multiplier 1.0+
  critBonus: number;
  finisherUnlocked: boolean;
}

export function getComboBonus(combo: number): ComboBonus {
  if (combo >= 5) {
    return { damageBonus: 1.20, critBonus: 0.15, finisherUnlocked: true };
  }
  if (combo >= 4) {
    return { damageBonus: 1.15, critBonus: 0.10, finisherUnlocked: false };
  }
  if (combo >= 3) {
    return { damageBonus: 1.10, critBonus: 0.05, finisherUnlocked: false };
  }
  if (combo >= 2) {
    return { damageBonus: 1.05, critBonus: 0.0, finisherUnlocked: false };
  }
  return { damageBonus: 1.0, critBonus: 0.0, finisherUnlocked: false };
}

/**
 * Increment combo (after successful attack).
 */
export function incrementCombo(c: Combatant): void {
  c.combo++;
}

/**
 * Reset combo (after non-attack action, stun, etc.).
 */
export function resetCombo(c: Combatant): void {
  c.combo = 0;
}
