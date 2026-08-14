/**
 * Debug overlay — read-only state inspection.
 *
 * Renders engine state as compact text. Used by:
 * - CLI scenario launcher
 * - Debug HUD (in-game overlay)
 * - Save file inspector
 */

import type { EngineState } from "../types.js";
import type { Engine } from "../engine.js";

/**
 * Return compact one-line-per-field summary of player.
 */
export function inspectPlayer(engine: Engine): string[] {
  const p = engine.state.player;
  const realm = engine.getRealmDisplay();
  return [
    `id=${p.id} name=${p.name}`,
    `realm=${realm} exp=${p.cultivationExp}/${engine.getBreakthroughCost().exp}`,
    `hp=${p.stats.hp}/${p.stats.maxHp} mp=${p.stats.mp}/${p.stats.maxMp}`,
    `atk=${p.stats.attack} def=${p.stats.defense} spd=${p.stats.speed}`,
    `gold=${p.gold} realmLayer=${p.realmLayer}`,
    `factionRep: ${Object.entries(p.factionRep).map(([k, v]) => `${k}:${v}`).join(" ")}`,
    `quests: ${p.questProgress.length} (${p.questProgress.filter((q) => q.status === "active").length} active)`,
    `inventory: ${p.inventory?.length ?? 0} items`,
    `titles: ${p.titles.join(", ") || "(none)"}`,
    `flags: ${Object.keys(p.flags).join(", ") || "(none)"}`,
  ];
}

/**
 * Return compact one-line-per-field summary of world.
 */
export function inspectWorld(engine: Engine): string[] {
  return [
    `day=${engine.state.time.day} time=${engine.state.time.hour}:${String(engine.state.time.minute).padStart(2, "0")} phase=${engine.state.time.phase}`,
    `region=${engine.state.currentRegion} pos=(${engine.state.player.position.x},${engine.state.player.position.y})`,
    `weather=${engine.state.time.weather} (${engine.state.time.weatherDaysLeft}d left)`,
    `tick=${engine.state.tick}`,
    `npcs: ${engine.state.npcs.size} total, ${[...engine.state.npcs.values()].filter((n) => n.alive).length} alive`,
    `wars: ${engine.state.factionWars.filter((w) => w.active).length} active`,
    `tutorial: ${engine.state.tutorial.completed.length} done, ${engine.state.tutorial.done ? "COMPLETE" : "pending"}`,
  ];
}

/**
 * Compact save snapshot — single line for logs.
 */
export function saveSnapshot(engine: Engine): string {
  return `seed=${engine.seed} day=${engine.state.time.day} ` +
    `realm=${engine.state.player.realm} hp=${engine.state.player.stats.hp} ` +
    `gold=${engine.state.player.gold} ` +
    `battle=${engine.battle ? "active" : "none"} ` +
    `result=${engine.lastBattleResult ?? "-"}`;
}

/**
 * Get JSON-serializable state (sans Maps which JSON can't handle).
 */
export function serializeForDebug(engine: Engine): unknown {
  return {
    seed: engine.seed,
    time: { ...engine.state.time },
    player: { ...engine.state.player },
    npcs: [...engine.state.npcs.values()].map((n) => ({ ...n })),
    factionWars: [...engine.state.factionWars],
    tutorial: { ...engine.state.tutorial },
    flags: { ...engine.state.flags },
  };
}

/**
 * Render a sectioned text report.
 */
export function fullReport(engine: Engine): string {
  const lines: string[] = [];
  lines.push("=== ENGINE STATE ===");
  lines.push(...inspectWorld(engine));
  lines.push("--- PLAYER ---");
  lines.push(...inspectPlayer(engine));
  lines.push("--- FACTIONS ---");
  const stances = engine.getAllFactionStances();
  for (const [id, stance] of Object.entries(stances)) {
    lines.push(`  ${id.padEnd(20)} ${stance}`);
  }
  lines.push("--- NEARBY NPCs ---");
  const here = findNearbyNpcs(engine);
  for (const n of here) {
    lines.push(`  ${n.id.padEnd(20)} ${n.name} (${n.factionId})`);
  }
  return lines.join("\n");
}

/**
 * List NPCs at player position.
 */
export function findNearbyNpcs(engine: Engine): ReturnType<typeof engine.listNpcs> {
  return engine.listNpcs().filter((n) => {
    const dx = Math.abs(n.position.x - engine.state.player.position.x);
    const dy = Math.abs(n.position.y - engine.state.player.position.y);
    return dx < 200 && dy < 200;
  });
}