/**
 * Combat grid helpers.
 *
 * Battle layout (spec/09):
 *   Each side has 2 rows x 3 cols = 6 slots.
 *   Row 0 = front (cover provider, melee).
 *   Row 1 = back  (ranged, protected by front).
 *
 * Position rules:
 *   - Front row has cover vs back-row attackers.
 *   - Back row melee needs front empty (gap) OR a swap skill.
 *   - Dead slot → row shift (back promotes to front when col empty).
 *   - Flanking (attacker hits both front and back of same col) removes cover.
 */

import type { Combatant, EntityId } from "../types.js";

export const GRID_ROWS = 2;
export const GRID_COLS = 3;

export const ALL_ROWS: ReadonlyArray<0 | 1> = [0, 1];
export const ALL_COLS: ReadonlyArray<0 | 1 | 2> = [0, 1, 2];

/**
 * Get all combatants in a team.
 */
export function getTeam(combatants: Combatant[], team: number): Combatant[] {
  return combatants.filter((c) => c.team === team && c.alive);
}

/**
 * Check if a target is in front row.
 */
export function isFrontRow(c: Combatant): boolean {
  return c.row === 0;
}

/**
 * Find any alive ally in target's team at (row, col).
 */
function allyAt(combatants: Combatant[], team: number, row: 0 | 1, col: 0 | 1 | 2): Combatant | undefined {
  return combatants.find((c) => c.team === team && c.row === row && c.col === col && c.alive);
}

/**
 * Real flanking detection per spec/09.
 *
 * Flanked = attacker threatens BOTH front and back row in same column
 *           (no alive ally in target col front row, OR attacker is at back col adjacent).
 *
 * Simplified rule: if no alive front-row ally in target's column, the
 * attacker hits the back row directly without obstruction → flanking.
 */
function isFlanked(
  target: Combatant,
  _attacker: Combatant,
  allCombatants: Combatant[]
): boolean {
  const front = allyAt(allCombatants, target.team, 0, target.col);
  // No front-row cover provider in this column → back-row target is flanked.
  return !front;
}

/**
 * Calculate cover bonus for a target against attacker from opposite team.
 * Returns 0-1 reduction applied to incoming damage.
 *
 * Front row: 0 (no cover, melee target).
 * Back row:
 *   - 0 if front col empty (dead/missing) → flanked.
 *   - 0.3 base + 0.1 per adjacent front ally (max 2).
 *   - Capped at 0.7.
 */
export function calcCover(
  target: Combatant,
  attacker: Combatant,
  allCombatants: Combatant[]
): number {
  if (target.row === 0) return 0;

  if (isFlanked(target, attacker, allCombatants)) return 0;

  let cover = 0.3;
  const adjacentFront = allCombatants.filter(
    (c) =>
      c.team === target.team &&
      c.row === 0 &&
      c.alive &&
      Math.abs(c.col - target.col) === 1
  );
  cover += 0.1 * adjacentFront.length;
  return Math.min(0.7, cover);
}

/**
 * Determine valid targets for an action based on range pattern.
 *
 * Patterns (spec/09):
 *   single       — explicit target only.
 *   line         — full row of enemies (row param optional, default attacker's row).
 *   radial       — 3x3 around explicit target: same row ±1 col, adjacent row same col.
 *   cone         — 3 enemies in attacker's row, centered on attacker's col.
 *   all_enemies  — every alive enemy.
 *   all_allies   — every alive ally except self.
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
      // Full row of enemies in attacker's row (front ↔ front, back ↔ back).
      // If attacker is back row but front empty (gap), can target enemy front row.
      return enemies.filter((c) => {
        if (c.row === attacker.row) return true;
        // Gap rule: if attacker row col has no alive ally in target team,
        // attacker can reach the other row in same col.
        if (targetHasGap(attacker, combatants)) {
          return c.col === attacker.col;
        }
        return false;
      });
    }

    case "radial": {
      if (!explicitTarget) return enemies;
      const target = combatants.find((c) => c.id === explicitTarget);
      if (!target) return [];
      // 3x3 centered on target: same row cols ±1, adjacent row same col.
      return enemies.filter((c) => {
        if (c.row === target.row) return Math.abs(c.col - target.col) <= 1;
        if (Math.abs(c.row - target.row) === 1) return c.col === target.col;
        return false;
      });
    }

    case "cone": {
      // 3 enemies centered on attacker's col, same row.
      return enemies.filter(
        (c) => c.row === attacker.row && Math.abs(c.col - attacker.col) <= 1
      );
    }

    case "all_enemies":
      return enemies;

    case "all_allies":
      return allies;
  }
}

/**
 * Check if attacker has a "gap" — front of attacker's col is empty in their own team,
 * so attacker can melee across rows.
 */
function targetHasGap(attacker: Combatant, combatants: Combatant[]): boolean {
  if (attacker.row === 0) return false;
  return !allyAt(combatants, attacker.team, 0, attacker.col);
}

/**
 * Swap two combatants' positions. Used by swap skill (spec/09 B5).
 * Returns true if swap succeeded.
 */
export function swapPositions(
  combatants: Combatant[],
  idA: EntityId,
  idB: EntityId
): boolean {
  const a = combatants.find((c) => c.id === idA);
  const b = combatants.find((c) => c.id === idB);
  if (!a || !b || !a.alive || !b.alive) return false;
  if (a.team !== b.team) return false; // swap only within same team
  const tmpRow = a.row;
  const tmpCol = a.col;
  a.row = b.row;
  a.col = b.col;
  b.row = tmpRow;
  b.col = tmpCol;
  return true;
}

/**
 * Promote back-row combatants to front when their front-row ally dies (row shift).
 * Mutates combatants in place. Per spec/09: "Dead → slot trống → row shift".
 *
 * Returns the list of promoted combatant ids.
 */
export function shiftRowsOnDeath(combatants: Combatant[]): EntityId[] {
  const promoted: EntityId[] = [];
  for (const team of [0, 1]) {
    for (const col of ALL_COLS) {
      const frontAlive = !!allyAt(combatants, team, 0, col);
      if (frontAlive) continue;
      const back = allyAt(combatants, team, 1, col);
      if (back) {
        back.row = 0;
        promoted.push(back.id);
      }
    }
  }
  return promoted;
}

/**
 * Find an empty slot in a team (row, col pair not occupied by alive combatant).
 */
export function findEmptySlot(
  combatants: Combatant[],
  team: number
): { row: 0 | 1; col: 0 | 1 | 2 } | null {
  for (const r of ALL_ROWS) {
    for (const c of ALL_COLS) {
      const exists = combatants.find(
        (x) => x.team === team && x.row === r && x.col === c && x.alive
      );
      if (!exists) return { row: r, col: c };
    }
  }
  return null;
}

/**
 * Flanking detection exposed for tests (internal helper).
 */
export function detectFlanking(
  target: Combatant,
  attacker: Combatant,
  allCombatants: Combatant[]
): boolean {
  return isFlanked(target, attacker, allCombatants);
}
