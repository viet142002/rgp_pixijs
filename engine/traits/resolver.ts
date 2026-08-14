/**
 * Trait resolver.
 * Combine static traits + dynamic states into a flat modifier object.
 */

import type { TraitModifier, Trait, State, Stats } from "../types.js";
import type { StaticData } from "../data/loader.js";

export interface ResolvedModifiers {
  totalAggression: number;
  totalCowardice: number;
  totalLoyalty: number;
  totalHatredMultiplier: number;
  totalForgiveRate: number;
  totalGrudgeStrength: number;
  totalDamageMultiplier: number;
  totalDefenseMultiplier: number;
  totalSpeedMultiplier: number;
  totalCritRateBonus: number;
  totalEvasion: number;
  totalAccuracy: number;
  elementalResist: Map<string, number>;
}

/**
 * Resolve combined modifiers from traits + states.
 * Same field from multiple sources: additive (per spec/07).
 * Exception: damageMultiplier etc. are explicitly multiplicative in trait def.
 */
export function resolveModifiers(
  traitIds: string[],
  states: State[],
  data: Pick<StaticData, "traits" | "states">
): ResolvedModifiers {
  const result: ResolvedModifiers = {
    totalAggression: 0,
    totalCowardice: 0,
    totalLoyalty: 0,
    totalHatredMultiplier: 1.0,
    totalForgiveRate: 1.0,
    totalGrudgeStrength: 1.0,
    totalDamageMultiplier: 1.0,
    totalDefenseMultiplier: 1.0,
    totalSpeedMultiplier: 1.0,
    totalCritRateBonus: 0,
    totalEvasion: 0,
    totalAccuracy: 0,
    elementalResist: new Map(),
  };

  for (const id of traitIds) {
    const trait = data.traits.get(id);
    if (!trait) continue;
    applyModifier(result, trait.modifiers);
  }

  for (const state of states) {
    const def = data.states.get(state.id);
    if (!def) continue;
    if (def.modifiers) applyModifier(result, def.modifiers);
  }

  return result;
}

function applyModifier(target: ResolvedModifiers, mod: TraitModifier): void {
  if (mod.damageMultiplier !== undefined) target.totalDamageMultiplier *= mod.damageMultiplier;
  if (mod.defenseMultiplier !== undefined) target.totalDefenseMultiplier *= mod.defenseMultiplier;
  if (mod.speedMultiplier !== undefined) target.totalSpeedMultiplier *= mod.speedMultiplier;
  if (mod.critRateBonus !== undefined) target.totalCritRateBonus += mod.critRateBonus;
  if (mod.aggression !== undefined) target.totalAggression += mod.aggression;
  if (mod.cowardice !== undefined) target.totalCowardice += mod.cowardice;
  if (mod.loyalty !== undefined) target.totalLoyalty += mod.loyalty;
  if (mod.hatredMultiplier !== undefined) target.totalHatredMultiplier *= mod.hatredMultiplier;
  if (mod.grudgeStrength !== undefined) target.totalGrudgeStrength *= mod.grudgeStrength;
  if (mod.forgiveRate !== undefined) target.totalForgiveRate *= mod.forgiveRate;
  if (mod.evasion !== undefined) target.totalEvasion += mod.evasion;
  if (mod.accuracy !== undefined) target.totalAccuracy += mod.accuracy;
  if (mod.elementalResist) {
    for (const [el, val] of Object.entries(mod.elementalResist)) {
      target.elementalResist.set(el, (target.elementalResist.get(el) ?? 0) + val);
    }
  }
}

/**
 * Apply resolved modifiers to base stats.
 */
export function applyToStats(base: Stats, mod: ResolvedModifiers): Stats {
  return {
    hp: base.hp,
    maxHp: base.maxHp,
    mp: base.mp,
    maxMp: base.maxMp,
    attack: Math.round(base.attack * mod.totalDamageMultiplier),
    defense: Math.round(base.defense * mod.totalDefenseMultiplier),
    speed: Math.round(base.speed * mod.totalSpeedMultiplier),
    critRate: clamp(base.critRate + mod.totalCritRateBonus, 0, 1),
    critDamage: base.critDamage,
    evasion: clamp(base.evasion + mod.totalEvasion, 0, 1),
    accuracy: clamp(base.accuracy + mod.totalAccuracy, 0, 1),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Apply status modifiers to stats (for combat).
 * Status modifiers are separate from trait modifiers (status is temporary).
 */
export function applyStatusToStats(
  base: Stats,
  traitMod: ResolvedModifiers,
  statusMods: Array<{ modifier?: Record<string, number> }>
): Stats {
  let dmgMul = traitMod.totalDamageMultiplier;
  let defMul = traitMod.totalDefenseMultiplier;
  let spdMul = traitMod.totalSpeedMultiplier;

  for (const s of statusMods) {
    const m = s.modifier ?? {};
    if (typeof m.damageMultiplier === "number") dmgMul *= m.damageMultiplier;
    if (typeof m.defenseMultiplier === "number") defMul *= m.defenseMultiplier;
    if (typeof m.speedMultiplier === "number") spdMul *= m.speedMultiplier;
  }

  return {
    hp: base.hp,
    maxHp: base.maxHp,
    mp: base.mp,
    maxMp: base.maxMp,
    attack: Math.round(base.attack * dmgMul),
    defense: Math.round(base.defense * defMul),
    speed: Math.round(base.speed * spdMul),
    critRate: base.critRate,
    critDamage: base.critDamage,
    evasion: base.evasion,
    accuracy: base.accuracy,
  };
}
