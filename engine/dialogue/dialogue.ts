/**
 * Dialogue tree system.
 *
 * - Each NPC may have a dialogue tree (data/dialogues.json).
 * - Nodes are linked via choices or auto-next.
 * - Choices can have conditions (rep, quest, relationship, gold).
 * - Nodes can have effects (give item, rep change, start quest, etc).
 */

import type { EngineState, Player, EntityId } from "../types.js";
import type { StaticData, DialogueTree as DT } from "../data/loader.js";

export interface DialogueChoice {
  text: string;
  next: string;
  condition?: DialogueCondition;
}

export interface DialogueCondition {
  factionRepMin?: Record<string, number>;
  factionRepMax?: Record<string, number>;
  affinityMin?: Record<string, number>; // npcId → min affinity
  affinityMax?: Record<string, number>;
  questCompleted?: string[];
  questActive?: string[];
  gold?: number;
}

export interface DialogueEffect {
  giveItem?: { itemId: string; quantity: number }[];
  takeItem?: { itemId: string; quantity: number }[];
  factionRep?: { factionId: string; delta: number }[];
  startQuest?: string[];
  completeQuest?: string[];
  affinity?: { npcId: string; delta: number; symmetric?: boolean }[];
  gold?: number;
  exp?: number;
  cultivationExp?: number;
}

export interface DialogueNode {
  id: string;
  speaker: string; // "npc" or NPC id
  text: string;
  choices?: DialogueChoice[];
  effects?: DialogueEffect;
  next?: string;
  isEnd?: boolean;
}

/**
 * Check if a condition is met by player state.
 */
export function checkCondition(
  state: EngineState,
  cond: DialogueCondition | undefined,
  npcId: EntityId
): { met: boolean; reason?: string } {
  if (!cond) return { met: true };
  const p = state.player;

  if (cond.factionRepMin) {
    for (const [f, min] of Object.entries(cond.factionRepMin)) {
      if ((p.factionRep[f] ?? 0) < min) {
        return { met: false, reason: `Cần ${min} uy tín với ${f}` };
      }
    }
  }
  if (cond.factionRepMax) {
    for (const [f, max] of Object.entries(cond.factionRepMax)) {
      if ((p.factionRep[f] ?? 0) > max) {
        return { met: false, reason: `Không được quá ${max} uy tín với ${f}` };
      }
    }
  }
  if (cond.affinityMin) {
    for (const [nId, min] of Object.entries(cond.affinityMin)) {
      const a = getAffinityToNpc(state, nId);
      if (a < min) return { met: false, reason: `Cần quan hệ với ${nId}` };
    }
  }
  if (cond.questCompleted) {
    for (const q of cond.questCompleted) {
      const done = p.questProgress.find((qp) => qp.questId === q && qp.status === "completed");
      if (!done) return { met: false, reason: `Cần hoàn thành ${q}` };
    }
  }
  if (cond.questActive) {
    for (const q of cond.questActive) {
      const active = p.questProgress.find((qp) => qp.questId === q && qp.status === "active");
      if (!active) return { met: false, reason: `Cần đang làm ${q}` };
    }
  }
  if (cond.gold !== undefined && p.gold < cond.gold) {
    return { met: false, reason: `Cần ${cond.gold} vàng` };
  }
  void npcId;
  return { met: true };
}

/**
 * Sum affinity from player → npc across all relations.
 */
export function getAffinityToNpc(state: EngineState, npcId: EntityId): number {
  return state.relations
    .filter((r) => r.from === state.player.id && r.to === npcId)
    .reduce((sum, r) => sum + r.affinity, 0);
}

/**
 * Apply dialogue effects to state.
 */
export function applyEffects(state: EngineState, effects: DialogueEffect, npcId: EntityId): void {
  const p = state.player;
  void npcId;
  if (effects.giveItem) {
    for (const it of effects.giveItem) {
      p.inventory.push({ itemId: it.itemId, quantity: it.quantity });
    }
  }
  if (effects.takeItem) {
    for (const it of effects.takeItem) {
      let remaining = it.quantity;
      for (let i = 0; i < p.inventory.length && remaining > 0; i++) {
        const s = p.inventory[i]!;
        if (s.itemId !== it.itemId) continue;
        const take = Math.min(remaining, s.quantity);
        s.quantity -= take;
        remaining -= take;
        if (s.quantity <= 0) { p.inventory.splice(i, 1); i--; }
      }
    }
  }
  if (effects.factionRep) {
    for (const r of effects.factionRep) {
      p.factionRep[r.factionId] = (p.factionRep[r.factionId] ?? 0) + r.delta;
    }
  }
  if (effects.startQuest) {
    for (const qid of effects.startQuest) {
      if (!p.questProgress.find((q) => q.questId === qid)) {
        p.questProgress.push({
          questId: qid,
          status: "active",
          objectiveProgress: {},
          acceptedDay: state.time.day,
        });
      }
    }
  }
  if (effects.completeQuest) {
    for (const qid of effects.completeQuest) {
      const prog = p.questProgress.find((q) => q.questId === qid);
      if (prog && prog.status === "active") {
        prog.status = "completed";
        prog.completedDay = state.time.day;
      }
    }
  }
  if (effects.affinity) {
    for (const a of effects.affinity) {
      // Direct affinity change via relations
      const r = state.relations.find(
        (rel) => rel.from === p.id && rel.to === a.npcId
      );
      if (r) {
        r.affinity = Math.max(-100, Math.min(100, r.affinity + a.delta));
      } else {
        state.relations.push({
          from: p.id,
          to: a.npcId,
          type: "friend",
          affinity: a.delta,
          strength: 50,
          day: state.time.day,
          symmetric: a.symmetric ?? false,
        });
      }
    }
  }
  if (effects.gold !== undefined) p.gold += effects.gold;
  if (effects.cultivationExp !== undefined) p.cultivationExp += effects.cultivationExp;
}

/**
 * Get dialogue for NPC. Returns root node filtered choices + state.
 */
export function getDialogue(
  state: EngineState,
  data: StaticData,
  npcId: EntityId
): { tree: DT; node: DialogueNode; availableChoices: { text: string; next: string }[]; locked: { text: string; reason: string }[] } | null {
  const tree = data.dialogues.get(npcId);
  if (!tree) return null;
  const node = tree.nodes[tree.rootNode];
  if (!node) return null;
  const available: { text: string; next: string }[] = [];
  const locked: { text: string; reason: string }[] = [];
  if (node.choices) {
    for (const ch of node.choices) {
      const c = checkCondition(state, ch.condition, npcId);
      if (c.met) available.push({ text: ch.text, next: ch.next });
      else locked.push({ text: ch.text, reason: c.reason ?? "Điều kiện không thỏa" });
    }
  }
  return { tree, node, availableChoices: available, locked };
}

/**
 * Process player choice: apply effects of current node + advance.
 */
export function chooseDialogueOption(
  state: EngineState,
  data: StaticData,
  npcId: EntityId,
  treeId: string,
  fromNodeId: string,
  choiceIdx: number
): DialogueNode | null {
  const tree = data.dialogues.get(treeId);
  if (!tree) return null;
  const fromNode = tree.nodes[fromNodeId];
  if (!fromNode || !fromNode.choices) return null;
  const ch = fromNode.choices[choiceIdx];
  if (!ch) return null;
  const c = checkCondition(state, ch.condition, npcId);
  if (!c.met) return null;

  // Apply effects of source node (one-shot rewards on this branch)
  if (fromNode.effects) applyEffects(state, fromNode.effects, npcId);

  // Advance to next node
  const nextNode = tree.nodes[ch.next];
  if (!nextNode) return null;

  // Apply effects of next node (start quest, etc)
  if (nextNode.effects) applyEffects(state, nextNode.effects, npcId);

  return nextNode;
}

/**
 * Step dialogue that has no choices (auto next with effects).
 * Returns the next node, or null if isEnd or tree missing.
 */
export function stepDialogue(
  state: EngineState,
  data: StaticData,
  npcId: EntityId
): DialogueNode | null {
  const tree = data.dialogues.get(npcId);
  if (!tree) return null;
  const startNode = tree.nodes[tree.rootNode];
  if (!startNode) return null;
  let current = startNode;
  // Apply root effects (give item, etc)
  if (current.effects) applyEffects(state, current.effects, npcId);
  while (current.next && !current.isEnd) {
    const next = tree.nodes[current.next];
    if (!next) return null;
    if (next.effects) applyEffects(state, next.effects, npcId);
    current = next;
    if (current.choices) return current;
  }
  return current;
}

// Re-export for convenience
export type { DT as DialogueTree };
