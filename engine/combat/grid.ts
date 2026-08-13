/**
 * Combat grid helpers.
 *
 * Battle layout:
 *   Each side has 2 rows x 3 cols.
 *   Row 0 = front, Row 1 = back.
 */

import type { Combatant, EntityId } from "../types.js";

export const GRID_ROWS = 2;
export const GRID_COLS = 3;

/**
 * Get all combatants in a team.
 */
export function getTeam(combatants: Combatant[], team: number): Combatant[] {
  return combatants.filter((c) => c.team === team && c.alive);
}

/**
 * Check if a target is in front row (provides cover).
 */
export function isFrontRow(c: Combatant): boolean {
  return c.row === 0;
}

/**
 * Calculate cover bonus for a target against attacker from opposite team.
 * Returns 0-1 reduction applied to incoming damage.
 */
export function calcCover(
  target: Combatant,
  attacker: Combatant,
  allCombatants: Combatant[]
): number {
  if (target.row === 0) return 0; // front row, no cover
  // Back row target: check if there's an alive ally in same team, same col, row 0
  const coverProvider = allCombatants.find(
    (c) =>
      c.team === target.team &&
      c.col === target.col &&
      c.row === 0 &&
      c.alive &&
      c.id !== target.id
  );
  if (!coverProvider) return 0;

  // Adjacent allies in front row also contribute
  const adjacent = allCombatants.filter(
    (c) =>
      c.team === target.team &&
      c.row === 0 &&
      c.alive &&
      Math.abs(c.col - target.col) === 1
  );

  let cover = 0.3 + 0.1 * adjacent.length;
  void attacker;
  // Flanking: if attacker from opposite team can hit both rows
  if (isFlanked(target, attacker, allCombatants)) {
    cover = 0;
  }
  return Math.min(0.7, cover);
}

function isFlanked(
  target: Combatant,
  _attacker: Combatant,
  allCombatants: Combatant[]
): boolean {
  // Flanked = both front and back row in target's column are valid targets
  // Simplified: if front row is empty (dead) AND back row targeted, no cover (already 0)
  // If front row alive AND back row alive → not flanked
  // Flanking only via special abilities (not modeled yet)
  void allCombatants;
  void target;
  return false;
}

/**
 * Determine valid targets for an action based on range.
 */
export function selectTargets(
  attacker: Combatant,
  range: "single" | "line" | "radial" | "cone" | "all_enemies" | "all_allies",
  explicitTarget: EntityId | undefined,
  combatants: Combatant[]
): Combatant[] {
  const enemies = combatants.filter((c) => c.team !== attacker.team && c.alive);
  const allies = combatants.filter((c) => c.team === attacker.team && c.alive && c.id !== attacker.id);

  switch (range) {
    case "single": {
      if (!explicitTarget) return [];
      return combatants.filter((c) => c.id === explicitTarget && c.alive);
    }
    case "line": {
      // Target row of enemies
      return enemies.filter((c) => c.row === 0);
    }
    case "radial": {
      // 3x3 around target — simplified: all enemies in adjacent rows
      if (!explicitTarget) return enemies;
      const target = combatants.find((c) => c.id === explicitTarget);
      if (!target) return [];
      return enemies.filter((c) => Math.abs(c.row - target.row) <= 1);
    }
    case "cone": {
      return enemies.filter((c) => c.row === 0);
    }
    case "all_enemies":
      return enemies;
    case "all_allies":
      return allies;
  }
}

/**
 * Find an empty slot in a team.
 */
export function findEmptySlot(combatants: Combatant[], team: number): { row: 0 | 1; col: 0 | 1 | 2 } | null {
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const exists = combatants.find(
        (x) => x.team === team && x.row === r && x.col === c && x.alive
      );
      if (!exists) return { row: r as 0 | 1, col: c as 0 | 1 | 2 };
    }
  }
  return null;
}
