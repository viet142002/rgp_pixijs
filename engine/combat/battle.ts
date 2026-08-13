/**
 * Battle orchestrator.
 * Manages turn order, action resolution, victory/defeat.
 */

import type {
  BattleState, Combatant, EntityId, GameEvent, StatusId,
} from "../types.js";
export type { BattleState };
import type { StaticData } from "../data/loader.js";
import {
  prngInit, prngNext, prngInt, prngChance,
} from "../seed/prng.js";
import { selectTargets } from "./grid.js";
import { applyDamageToCombatant, rollDamage } from "./damage.js";
import { applyStatus, tickStatuses, hasStatus } from "./status.js";
import { getComboBonus, incrementCombo, resetCombo } from "./combo.js";

export interface BattleOptions {
  playerTeam: Combatant[];
  enemyTeam: Combatant[];
  data: StaticData;
  rng: { value: number; state: number };
  day: number;
  tick: number;
}

export interface ActionRequest {
  actorId: EntityId;
  action: "attack" | "skill" | "defend" | "escape";
  skillId?: string;
  targetId?: EntityId;
}

/**
 * Initialize battle: roll initiative, sort turn order, reset AP.
 */
export function initBattle(opts: BattleOptions): BattleState {
  const combatants: Combatant[] = [];

  for (const c of opts.playerTeam) {
    combatants.push({ ...c, team: 0, side: "player", ap: 3, maxAp: 3, combo: 0 });
  }
  for (const c of opts.enemyTeam) {
    combatants.push({ ...c, team: 1, side: "enemy", ap: 3, maxAp: 3, combo: 0 });
  }

  // Roll initiative per combatant
  const initRolls: { id: EntityId; init: number }[] = [];
  let rng = opts.rng;
  for (const c of combatants) {
    const speedRoll = prngInt(rng.state, 0, Math.floor(c.stats.speed / 2));
    rng = { value: speedRoll.value, state: speedRoll.state };
    initRolls.push({ id: c.id, init: c.stats.speed + speedRoll.value });
  }

  // Sort by initiative descending, tie-break by id
  initRolls.sort((a, b) => {
    if (b.init !== a.init) return b.init - a.init;
    return a.id.localeCompare(b.id);
  });

  return {
    combatants,
    turnOrder: initRolls.map((r) => r.id),
    currentActorIdx: 0,
    round: 1,
    log: [`Trận đấu bắt đầu: ${opts.playerTeam.length} vs ${opts.enemyTeam.length}`],
    result: undefined,
  };
}

/**
 * Get the current actor.
 */
export function getCurrentActor(battle: BattleState): Combatant | null {
  const id = battle.turnOrder[battle.currentActorIdx];
  if (!id) return null;
  return battle.combatants.find((c) => c.id === id) ?? null;
}

/**
 * Resolve a player/NPC action.
 * Returns events fired this action.
 */
export function resolveAction(
  battle: BattleState,
  request: ActionRequest,
  data: StaticData,
  rng: { value: number; state: number }
): { battle: BattleState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let r = rng;

  const actor = battle.combatants.find((c) => c.id === request.actorId);
  if (!actor || !actor.alive) {
    // Dead actor — advance turn to skip and check end
    advanceTurn(battle);
    return checkBattleEnd(battle, events, data, r);
  }
  if (battle.result) {
    return { battle, events };
  }

  // Tick statuses at start of actor's turn
  const maxHp = estimateMaxHp(actor);
  const tickResult = tickStatuses(actor, data, maxHp);
  if (tickResult.skipTurn) {
    battle.log.push(`${actor.name} bị choáng, mất lượt!`);
    if (!actor.alive) {
      battle.log.push(`${actor.name} gục ngã!`);
      events.push(...onActorDeath(battle, actor, data, r));
    }
    advanceTurn(battle);
    return checkBattleEnd(battle, events, data, r);
  }

  // Resolve based on action type
  switch (request.action) {
    case "attack":
      r = doAttack(battle, actor, request.targetId, data, r);
      break;
    case "skill":
      if (!request.skillId) {
        battle.log.push(`${actor.name}: thiếu skill id`);
        break;
      }
      r = doSkill(battle, actor, request.skillId, request.targetId, data, r);
      break;
    case "defend":
      doDefend(battle, actor);
      break;
    case "escape":
      r = doEscape(battle, actor, data, r);
      break;
  }

  // Reset combo on non-attack action
  if (request.action === "skill" || request.action === "defend" || request.action === "escape") {
    resetCombo(actor);
  }

  advanceTurn(battle);
  return checkBattleEnd(battle, events, data, r);
}

function doAttack(
  battle: BattleState,
  actor: Combatant,
  targetId: EntityId | undefined,
  data: StaticData,
  rng: { value: number; state: number }
): { value: number; state: number } {
  const targets = selectTargets(actor, "single", targetId, battle.combatants);
  if (targets.length === 0) {
    battle.log.push(`${actor.name}: không có mục tiêu hợp lệ`);
    actor.ap -= 1;
    return rng;
  }
  const target = targets[0]!;
  actor.ap -= 1;

  const result = rollDamage({
    attacker: actor,
    defender: target,
    baseDamage: 0,
    scalingStat: "attack",
    scaleFactor: 1.0,
    element: actor.element,
    data,
    allCombatants: battle.combatants,
    attackerMaxHp: estimateMaxHp(actor),
    defenderMaxHp: estimateMaxHp(target),
    rng,
  });

  const actual = applyDamageToCombatant(target, result.damage);
  if (result.isMiss) {
    battle.log.push(`${actor.name} tấn công ${target.name} — TRƯỢT!`);
  } else if (result.isCrit) {
    battle.log.push(`${actor.name} chí mạng ${target.name}: ${actual} sát thương!`);
  } else {
    battle.log.push(`${actor.name} tấn công ${target.name}: ${actual} sát thương`);
  }

  incrementCombo(actor);
  if (!target.alive) {
    battle.log.push(`${target.name} gục ngã!`);
  }

  return result.newState;
}

function doSkill(
  battle: BattleState,
  actor: Combatant,
  skillId: string,
  targetId: EntityId | undefined,
  data: StaticData,
  rng: { value: number; state: number }
): { value: number; state: number } {
  const skill = data.skills.get(skillId);
  if (!skill) {
    battle.log.push(`${actor.name}: skill ${skillId} không tồn tại`);
    return rng;
  }
  if (actor.stats.mp < skill.mpCost) {
    battle.log.push(`${actor.name}: không đủ MP cho ${skill.name}`);
    return rng;
  }
  if (actor.ap < skill.apCost) {
    battle.log.push(`${actor.name}: không đủ AP cho ${skill.name}`);
    return rng;
  }
  if (hasStatus(actor, "SILENCE") && skill.id !== "basic_attack" && skill.id !== "defend") {
    battle.log.push(`${actor.name}: bị câm, không thể dùng ${skill.name}`);
    return rng;
  }

  actor.ap -= skill.apCost;
  actor.stats.mp -= skill.mpCost;

  // Determine targets
  const targets = selectTargets(actor, skill.range, targetId, battle.combatants);
  if (targets.length === 0) {
    battle.log.push(`${actor.name}: ${skill.name} không có mục tiêu`);
    return rng;
  }

  battle.log.push(`${actor.name} dùng ${skill.name}`);

  let state = rng.state;

  // Apply damage / heal per target
  for (const t of targets) {
    if (skill.damage && skill.damage.base + (skill.damage.scaling === "attack" ? actor.stats.attack * skill.damage.factor : 0) > 0) {
      const dmgResult = rollDamage({
        attacker: actor,
        defender: t,
        baseDamage: skill.damage.base,
        scalingStat: "attack",
        scaleFactor: skill.damage.factor,
        element: skill.element,
        data,
        allCombatants: battle.combatants,
        attackerMaxHp: estimateMaxHp(actor),
        defenderMaxHp: estimateMaxHp(t),
        rng: { value: rng.value, state },
      });
      state = dmgResult.newState.state;
      const actual = applyDamageToCombatant(t, dmgResult.damage);
      battle.log.push(`  → ${t.name} nhận ${actual} sát thương${dmgResult.elementMultiplier > 1 ? " (yếu)" : dmgResult.elementMultiplier < 1 ? " (mạnh)" : ""}`);
      if (!t.alive) battle.log.push(`  → ${t.name} gục ngã!`);
    }
    if (skill.heal) {
      const healAmount = skill.heal.base + actor.stats.attack * skill.heal.factor;
      const before = t.stats.hp;
      t.stats.hp += Math.floor(healAmount);
      const actual = t.stats.hp - before;
      battle.log.push(`  → ${t.name} hồi ${actual} HP`);
    }
    if (skill.buff) {
      // Simple flat buff: increase stat for duration
      const stat = skill.buff.stat;
      const baseVal = t.stats[stat];
      t.stats[stat] = baseVal + skill.buff.value;
      battle.log.push(`  → ${t.name} +${skill.buff.value} ${stat} (${skill.buff.duration} turn)`);
    }
    if (skill.statusEffect) {
      const roll = prngNext(state);
      state = roll.state;
      const applied = prngChance(roll.state, skill.statusEffect.chance).value;
      if (applied) {
        applyStatus(t, skill.statusEffect.type, skill.statusEffect.duration, actor.id);
        battle.log.push(`  → ${t.name} nhận ${skill.statusEffect.type} (${skill.statusEffect.duration} turn)`);
      }
    }
  }

  return { value: rng.value, state };
}

function doDefend(battle: BattleState, actor: Combatant): void {
  actor.ap -= 1;
  actor.stats.defense = Math.round(actor.stats.defense * 1.5);
  battle.log.push(`${actor.name} phòng thủ (+50% defense trong turn)`);
}

function doEscape(
  battle: BattleState,
  actor: Combatant,
  data: StaticData,
  rng: { value: number; state: number }
): { value: number; state: number } {
  if (actor.team !== 0) {
    battle.log.push(`NPC không thể bỏ chạy`);
    return rng;
  }
  const enemies = battle.combatants.filter((c) => c.team !== actor.team && c.alive);
  const enemyAvgSpeed = enemies.length === 0
    ? 0
    : enemies.reduce((s, c) => s + c.stats.speed, 0) / enemies.length;
  const successRate = 0.3 + (actor.stats.speed - enemyAvgSpeed) / 100;
  const roll = prngChance(rng.state, Math.max(0.1, Math.min(0.9, successRate)));
  if (roll.value) {
    battle.result = "escape";
    battle.escapedBy = actor.id;
    battle.log.push(`${actor.name} bỏ chạy thành công!`);
  } else {
    battle.log.push(`${actor.name} thử bỏ chạy nhưng thất bại!`);
    // Free attack by all enemies
    for (const e of enemies) {
      const dmgResult = rollDamage({
        attacker: e,
        defender: actor,
        baseDamage: 0,
        scalingStat: "attack",
        scaleFactor: 1.0,
        element: e.element,
        data,
        allCombatants: battle.combatants,
        attackerMaxHp: estimateMaxHp(e),
        defenderMaxHp: estimateMaxHp(actor),
        rng: { value: rng.value, state: roll.state },
      });
      const actual = applyDamageToCombatant(actor, dmgResult.damage);
      battle.log.push(`  ${e.name} đánh free: ${actual} sát thương`);
    }
  }
  return { value: rng.value, state: roll.state };
}

function advanceTurn(battle: BattleState): void {
  battle.currentActorIdx++;
  if (battle.currentActorIdx >= battle.turnOrder.length) {
    battle.currentActorIdx = 0;
    battle.round++;
    battle.log.push(`--- Vòng ${battle.round} ---`);
    // Reset AP at start of new round
    for (const c of battle.combatants) {
      if (c.alive) c.ap = c.maxAp;
    }
  }
  // Skip dead combatants
  while (battle.currentActorIdx < battle.turnOrder.length) {
    const c = battle.combatants.find((x) => x.id === battle.turnOrder[battle.currentActorIdx]);
    if (c && c.alive) break;
    battle.currentActorIdx++;
  }
  if (battle.currentActorIdx >= battle.turnOrder.length) {
    battle.currentActorIdx = 0;
  }
}

function checkBattleEnd(
  battle: BattleState,
  events: GameEvent[],
  data: StaticData,
  rng: { value: number; state: number }
): { battle: BattleState; events: GameEvent[] } {
  const playerAlive = battle.combatants.some((c) => c.team === 0 && c.alive);
  const enemyAlive = battle.combatants.some((c) => c.team === 1 && c.alive);

  if (battle.result) {
    return { battle, events };
  }

  if (!playerAlive) {
    battle.result = "defeat";
    battle.log.push("THẤT BẠI!");
    events.push(makeEvent("COMBAT_ENDED", "system", [], { result: "defeat" }, battle, []));
  } else if (!enemyAlive) {
    battle.result = "victory";
    battle.log.push("CHIẾN THẮNG!");
    events.push(makeEvent("COMBAT_ENDED", "system", [], { result: "victory" }, battle, []));
  }

  void data;
  void rng;
  return { battle, events };
}

function onActorDeath(
  battle: BattleState,
  actor: Combatant,
  _data: StaticData,
  rng: { value: number; state: number }
): GameEvent[] {
  void _data;
  return [
    makeEvent("NPC_DIED", actor.id, [actor.id], { killer: battle.turnOrder[battle.currentActorIdx] ?? "unknown" }, battle, []),
  ];
  void rng;
}

function makeEvent(
  type: import("../types.js").EventType,
  source: EntityId | "system",
  targets: EntityId[],
  data: Record<string, unknown>,
  battle: BattleState,
  _events: GameEvent[]
): GameEvent {
  return {
    id: `${type}_${battle.round}_${battle.currentActorIdx}_${Date.now()}`,
    type,
    source,
    targets,
    data,
    day: 0,
    tick: 0,
    timestamp: Date.now(),
  };
}

function estimateMaxHp(c: Combatant): number {
  // For percent-based effects, use a heuristic:
  // assume max HP is current HP unless we're tracking max separately.
  // Without separate max, we'll use a "reasonable" baseline.
  // Real impl: store maxHp in combatant stats.
  return Math.max(c.stats.hp, 100);
}
