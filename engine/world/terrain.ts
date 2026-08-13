/**
 * Procedural terrain generation.
 *
 * Each region gets a deterministic terrain map based on seed+regionId.
 * Tile types: grass, forest, water, mountain, road, sand, swamp, cave, ruin, shrine.
 *
 * Encounter rate per terrain tier:
 * - safe: shrine, road, sand (settlement)
 * - low: grass (village outskirts)
 * - mid: forest
 * - high: swamp, ruin
 * - extreme: cave, mountain
 */

import type { TerrainId } from "../types.js";

export interface TileDef {
  terrain: TerrainId;
  encounterRate: number; // 0-1
  speedCost: number;    // 1 = normal, 2 = slow, infinity = impassable
}

export const TILE_DEFS: Record<TerrainId, TileDef> = {
  grass:    { terrain: "grass",    encounterRate: 0.05, speedCost: 1 },
  road:     { terrain: "road",     encounterRate: 0.01, speedCost: 0.8 },
  forest:   { terrain: "forest",   encounterRate: 0.15, speedCost: 1.4 },
  swamp:    { terrain: "swamp",    encounterRate: 0.25, speedCost: 2.0 },
  mountain: { terrain: "mountain", encounterRate: 0.2,  speedCost: 3.0 },
  water:    { terrain: "water",    encounterRate: 0.05, speedCost: Infinity },
  sand:     { terrain: "sand",     encounterRate: 0.02, speedCost: 1.2 },
  cave:     { terrain: "cave",     encounterRate: 0.35, speedCost: 1.5 },
  ruin:     { terrain: "ruin",     encounterRate: 0.3,  speedCost: 1.2 },
  shrine:   { terrain: "shrine",   encounterRate: 0,    speedCost: 1 },
};

/**
 * Generate terrain for a region deterministically based on seed+regionId.
 * Returns 2D array indexed [y][x].
 */
export function generateTerrain(
  masterSeed: number,
  regionId: string,
  width: number,
  height: number
): TerrainId[][] {
  const map: TerrainId[][] = [];
  let seed = (masterSeed ^ hashString(regionId)) >>> 0;
  for (let y = 0; y < height; y++) {
    const row: TerrainId[] = [];
    for (let x = 0; x < width; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      // Normalize region-specific bias
      const bias = regionBias(regionId);
      const n = (seed % 1000) / 1000; // 0..1
      row.push(pickTerrain(n, x, y, regionId, bias));
    }
    map.push(row);
  }
  return map;
}

function pickTerrain(n: number, x: number, y: number, regionId: string, bias: Partial<Record<TerrainId, number>>): TerrainId {
  // Edge masks for water / mountain
  if (regionId === "region_village") {
    if (x === 0 || y === 0 || x === 39 || y === 29) return "road";
    if (n < 0.5) return "grass";
    if (n < 0.7) return "road";
    if (n < 0.85) return "shrine";
    return "sand";
  }
  if (regionId === "region_forest") {
    if (n < 0.6) return "forest";
    if (n < 0.75) return "grass";
    if (n < 0.85) return "ruin";
    if (n < 0.93) return "cave";
    if (n < 0.97) return "swamp";
    return "mountain";
  }
  if (regionId === "region_sect_main") {
    if (n < 0.5) return "shrine";
    if (n < 0.8) return "grass";
    if (n < 0.9) return "road";
    if (n < 0.96) return "mountain";
    return "cave";
  }
  if (regionId === "region_demon_valley") {
    if (n < 0.4) return "swamp";
    if (n < 0.65) return "ruin";
    if (n < 0.85) return "cave";
    if (n < 0.95) return "mountain";
    return "cave";
  }
  void bias;
  return "grass";
}

function regionBias(_id: string): Partial<Record<TerrainId, number>> {
  return {};
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

/**
 * Get tile at world coordinates (in tile units).
 */
export function getTileAt(map: TerrainId[][], x: number, y: number): TerrainId | null {
  if (y < 0 || y >= map.length) return null;
  const row = map[y];
  if (!row || x < 0 || x >= row.length) return null;
  return row[x] ?? null;
}

/**
 * Get tile encounter rate.
 */
export function getTileEncounterRate(tile: TerrainId | null): number {
  if (!tile) return 0;
  return TILE_DEFS[tile].encounterRate;
}
