/**
 * Status effect management.
 */

import type {
  StatusInstance, StatusId, Combatant, EntityId,
} from "../types.js";
import type { StaticData } from "../data/loader.js";

/**
 * Apply status to combatant. Stack = refresh duration (no magnitude stack).
 * Returns true if newly applied or refreshed.
 */
export function applyStatus(
  target: Combatant,
  statusId: StatusId,
  duration: number,
  source: EntityId
): boolean {
  const def = statusId; // validate against data outside
  const existing = target.statuses.find((s) => s.statusId === def);
  if (existing) {
    existing.duration = Math.max(existing.duration, duration);
    existing.source = source;
    return false;
  }
  target.statuses.push({ statusId: def, duration, source });
  return true;
}

/**
 * Tick all statuses on a combatant: decrement duration, apply tick effects.
 * Returns damage/heal applied.
 */
export interface StatusTickResult {
  damage: number;
  heal: number;
  skipTurn: boolean;
  silenced: boolean;
  taunted: boolean;
  damageTakenMultiplier: number;
}

export function tickStatuses(
  combatant: Combatant,
  data: Pick<StaticData, "statuses">,
  maxHp: number
): StatusTickResult {
  let damage = 0;
  let heal = 0;
  let skipTurn = false;
  let silenced = false;
  let taunted = false;
  let damageTakenMultiplier = 1.0;

  for (const s of combatant.statuses) {
    const def = data.statuses.get(s.statusId);
    if (!def) continue;

    const tick = def.tickEffect ?? {};
    if (typeof tick.damage === "object" && tick.damage !== null) {
      const dmg = tick.damage as { type: string; value: number };
      if (dmg.type === "percent_max_hp") {
        damage += Math.floor(maxHp * dmg.value);
      } else if (dmg.type === "flat") {
        damage += dmg.value;
      }
    }
    if (typeof tick.heal === "object" && tick.heal !== null) {
      const h = tick.heal as { type: string; value: number };
      if (h.type === "percent_max_hp") {
        heal += Math.floor(maxHp * h.value);
      } else if (h.type === "flat") {
        heal += h.value;
      }
    }
    if (tick.skipTurn === true) {
      skipTurn = true;
    }

    const mod = def.modifier ?? {};
    if (mod.silenced === true) silenced = true;
    if (mod.taunted === true) taunted = true;
    if (typeof mod.damageTakenMultiplier === "number") {
      damageTakenMultiplier *= mod.damageTakenMultiplier;
    }

    s.duration--;
  }

  combatant.statuses = combatant.statuses.filter((s) => s.duration > 0);
  combatant.stats.hp = Math.max(0, combatant.stats.hp - damage + heal);
  if (combatant.stats.hp <= 0) {
    combatant.alive = false;
    combatant.stats.hp = 0;
  }

  return { damage, heal, skipTurn, silenced, taunted, damageTakenMultiplier };
}

/**
 * Get list of status IDs currently on combatant.
 */
export function getStatusIds(combatant: Combatant): string[] {
  return combatant.statuses.map((s) => s.statusId);
}

/**
 * Remove a specific status (dispell).
 */
export function removeStatus(combatant: Combatant, statusId: StatusId): boolean {
  const before = combatant.statuses.length;
  combatant.statuses = combatant.statuses.filter((s) => s.statusId !== statusId);
  return combatant.statuses.length < before;
}

/**
 * Check if combatant has a status.
 */
export function hasStatus(combatant: Combatant, statusId: StatusId): boolean {
  return combatant.statuses.some((s) => s.statusId === statusId);
}
