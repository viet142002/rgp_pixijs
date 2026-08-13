/**
 * Damage calculation.
 */

import type { Combatant, EntityId } from "../types.js";
import type { StaticData } from "../data/loader.js";
import { getElementMultiplier } from "./element.js";
import { calcCover } from "./grid.js";
import { applyStatus, hasStatus, tickStatuses } from "./status.js";

export interface DamageInput {
  attacker: Combatant;
  defender: Combatant;
  baseDamage: number;
  scalingStat: "attack";
  scaleFactor: number;
  element: import("../types.js").ElementId;
  skillCritRateBonus?: number;
  data: StaticData;
  allCombatants: Combatant[];
  attackerMaxHp: number;
  defenderMaxHp: number;
  rng: { value: number; state: number };
}

export interface DamageResult {
  damage: number;
  isCrit: boolean;
  isMiss: boolean;
  isDodged: boolean;
  elementMultiplier: number;
  coverApplied: number;
  newState: { value: number; state: number };
}

/**
 * Roll and compute damage.
 */
export function rollDamage(input: DamageInput): DamageResult {
  const { attacker, defender, baseDamage, scalingStat, scaleFactor, element, data } = input;

  // Hit roll
  const hitRoll = input.rng.value;
  let state = input.rng.state;
  const hitChance = attacker.stats.accuracy - defender.stats.evasion;
  const isMiss = hitRoll > hitChance;
  if (isMiss) {
    return {
      damage: 0,
      isCrit: false,
      isMiss: true,
      isDodged: false,
      elementMultiplier: 1.0,
      coverApplied: 0,
      newState: { value: hitRoll, state },
    };
  }

  // Crit roll
  const critRoll = prngNext(state).value;
  state = prngNext(state).state;
  const critRate = attacker.stats.critRate + (input.skillCritRateBonus ?? 0);
  const isCrit = critRoll < critRate;

  // Element multiplier
  const elMult = getElementMultiplier(
    element,
    defender.element,
    defender.elementResist,
    data
  );

  // Cover
  const cover = calcCover(defender, attacker, input.allCombatants);

  // Base scaling
  const statValue = attacker.stats[scalingStat];
  const scaled = baseDamage + statValue * scaleFactor;

  // Damage taken multiplier from status
  let damageTakenMult = 1.0;
  if (hasStatus(defender, "BLEED")) damageTakenMult *= 1.2;

  let rawDmg = scaled * (isCrit ? attacker.stats.critDamage : 1.0) * elMult * (1 - cover);
  rawDmg *= damageTakenMult;
  rawDmg = Math.max(1, Math.floor(rawDmg - defender.stats.defense * 0.5));

  return {
    damage: rawDmg,
    isCrit,
    isMiss: false,
    isDodged: false,
    elementMultiplier: elMult,
    coverApplied: cover,
    newState: { value: critRoll, state },
  };
}

/**
 * Apply damage to combatant, update HP, check death.
 */
export function applyDamageToCombatant(target: Combatant, damage: number): number {
  if (!target.alive) return 0;
  const actual = Math.max(0, Math.min(damage, target.stats.hp));
  target.stats.hp -= actual;
  if (target.stats.hp <= 0) {
    target.stats.hp = 0;
    target.alive = false;
  }
  return actual;
}

// Re-export for convenience
export { applyStatus, tickStatuses };

function prngNext(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const next = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value: next, state: t >>> 0 };
}
