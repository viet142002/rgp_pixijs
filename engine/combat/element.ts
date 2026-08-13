/**
 * Element matchup calculation.
 */

import type { ElementId } from "../types.js";
import type { StaticData } from "../data/loader.js";

/**
 * Get element multiplier for attacker element vs defender element.
 * Weakness: 1.5x
 * Strength: 0.5x
 * Resist: 0.25x (per trait)
 * Otherwise: 1.0x
 */
export function getElementMultiplier(
  attackerEl: ElementId,
  defenderEl: ElementId,
  defenderResist: Partial<Record<ElementId, number>>,
  data: Pick<StaticData, "matchup">
): number {
  if (attackerEl === "none" || defenderEl === "none") return 1.0;

  const matchup = data.matchup.get(attackerEl);
  if (!matchup) return 1.0;

  let mult = 1.0;
  if (matchup.weakness === defenderEl) mult = 1.5;
  else if (matchup.strength === defenderEl) mult = 0.5;

  // Resist override (defender innate)
  const resist = defenderResist[attackerEl];
  if (typeof resist === "number") {
    mult *= 1 - Math.min(0.9, resist);
  }

  return mult;
}
