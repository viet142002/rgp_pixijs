/**
 * POI (Point of Interest) system.
 *
 * POIs are static locations: shrines, caves, ruins, markets, camps, temples.
 * Each POI has its own npc list, encounter rules, optional cultivation bonus.
 */

import type { EngineState, EntityId, POIDef as POI } from "../types.js";
import type { StaticData } from "../data/loader.js";

export interface EnterPOIResult {
  po: POI;
  events: { type: string; data?: unknown }[];
}

/**
 * Check if player tile position matches a POI.
 */
export function findPoiAt(
  data: StaticData,
  regionId: string,
  tileX: number,
  tileY: number
): POI | null {
  for (const poi of data.pois.values()) {
    if (poi.regionId !== regionId) continue;
    if (poi.position.x === tileX && poi.position.y === tileY) return poi;
  }
  return null;
}

/**
 * Enter a POI. Returns effects: npc greeting, possible combat, cultivation bonus.
 */
export function enterPoi(
  state: EngineState,
  data: StaticData,
  poiId: EntityId
): EnterPOIResult | null {
  const poi = data.pois.get(poiId);
  if (!poi) return null;

  const events: { type: string; data?: unknown }[] = [];
  events.push({
    type: "POI_ENTERED",
    data: { poiId, name: poi.name, type: poi.type },
  });

  // Night-time encounter check
  if (poi.encounterOnEnter && (state.time.phase === "night" || state.time.phase === "evening")) {
    events.push({
      type: "POI_ENCOUNTER",
      data: { npcId: poi.encounterOnEnter },
    });
  }

  // NPCs at POI greet
  if (poi.npcs) {
    events.push({
      type: "POI_NPCS_PRESENT",
      data: { npcs: poi.npcs },
    });
  }

  return { po: poi, events };
}

/**
 * Get list of POIs in region.
 */
export function listPoisInRegion(data: StaticData, regionId: string): POI[] {
  return [...data.pois.values()].filter((p) => p.regionId === regionId);
}
