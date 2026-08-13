/**
 * Relation graph — directed edges between entities.
 * Storage: flat array (per spec), looked up via index.
 */

import type { Relation, RelationType, EntityId, EngineState } from "../types.js";

/**
 * Add or update a relation.
 * If symmetric: also create mirror edge.
 */
export function addRelation(
  state: EngineState,
  from: EntityId,
  to: EntityId,
  type: RelationType,
  affinity: number,
  strength: number,
  symmetric: boolean = false
): void {
  if (from === to) return;
  const existing = state.relations.find(
    (r) => r.from === from && r.to === to && r.type === type
  );
  if (existing) {
    existing.affinity = clampAffinity(existing.affinity + affinity * 0.3);
    existing.strength = Math.min(100, existing.strength + strength * 0.3);
  } else {
    state.relations.push({
      from,
      to,
      type,
      affinity: clampAffinity(affinity),
      strength: Math.min(100, strength),
      day: state.time.day,
      symmetric,
    });
  }

  if (symmetric) {
    addRelation(state, to, from, type, affinity, strength, false);
  }
}

/**
 * Modify affinity of existing relation (or create new).
 */
export function changeAffinity(
  state: EngineState,
  from: EntityId,
  to: EntityId,
  type: RelationType,
  delta: number,
  strengthFactor: number = 1
): void {
  const existing = state.relations.find(
    (r) => r.from === from && r.to === to && r.type === type
  );
  if (existing) {
    const effDelta = delta * (existing.strength / 100) * strengthFactor;
    existing.affinity = clampAffinity(existing.affinity + effDelta);
  } else {
    state.relations.push({
      from,
      to,
      type,
      affinity: clampAffinity(delta),
      strength: 50 * strengthFactor,
      day: state.time.day,
      symmetric: type === "family" || type === "friend" || type === "lover" || type === "sworn_brother",
    });
    if (type === "family" || type === "friend" || type === "lover" || type === "sworn_brother") {
      // Auto-mirror
      const mirror = state.relations.find(
        (r) => r.from === to && r.to === from && r.type === type
      );
      if (!mirror) {
        state.relations.push({
          from: to,
          to: from,
          type,
          affinity: clampAffinity(delta),
          strength: 50 * strengthFactor,
          day: state.time.day,
          symmetric: false,
        });
      }
    }
  }
}

/**
 * Get all relations from entity.
 */
export function getRelationsFrom(state: EngineState, id: EntityId): Relation[] {
  return state.relations.filter((r) => r.from === id);
}

/**
 * Get all relations to entity.
 */
export function getRelationsTo(state: EngineState, id: EntityId): Relation[] {
  return state.relations.filter((r) => r.to === id);
}

/**
 * Get relation affinity between two entities (best type).
 */
export function getAffinity(state: EngineState, from: EntityId, to: EntityId): number {
  const rels = state.relations.filter((r) => r.from === from && r.to === to);
  if (rels.length === 0) return 0;
  // Best positive or most extreme negative
  return rels.reduce((best, r) => {
    if (Math.abs(r.affinity) > Math.abs(best)) return r.affinity;
    return best;
  }, 0);
}

/**
 * Get all NPCs that have relation with given NPC.
 */
export function getRelatedNpcs(state: EngineState, id: EntityId): EntityId[] {
  const set = new Set<EntityId>();
  for (const r of state.relations) {
    if (r.from === id) set.add(r.to);
    if (r.to === id) set.add(r.from);
  }
  return [...set];
}

function clampAffinity(v: number): number {
  return Math.max(-100, Math.min(100, v));
}
