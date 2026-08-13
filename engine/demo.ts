/**
 * Demo: end-to-end game flow.
 * Run: npm run demo
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "./data/loader.js";
import { createEngine } from "./engine.js";
import { formatTime } from "./world/time.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, "..", "data");

async function main(): Promise<void> {
  console.log("=== Tu Tiên Bát Hoang — Engine Demo ===\n");

  const data = await loadStaticData(DATA_DIR);
  console.log(`Loaded ${data.npcTemplates.size} NPC templates, ${data.skills.size} skills, ${data.elements.size} elements\n`);

  const engine = createEngine({ seed: 12345, data });
  console.log(`Engine created with seed 12345`);
  console.log(`Time: ${formatTime(engine.state.time)}`);
  console.log(`NPCs in world: ${engine.state.npcs.size}\n`);

  // Buff player so demo shows victory clearly
  engine.state.player.stats.attack = 60;
  engine.state.player.stats.hp = 500;
  engine.state.player.stats.defense = 30;

  // 1. Simulate 100 world ticks (game time advances)
  console.log("--- Tick world 100 times ---");
  for (let i = 0; i < 100; i++) {
    engine.tickWorld();
  }
  console.log(`After 100 ticks: ${formatTime(engine.state.time)}`);

  // 2. Show NPC positions after tick (schedule movement)
  console.log("\n--- NPC positions after ticks ---");
  for (const npc of engine.listNpcs()) {
    console.log(`  ${npc.name.padEnd(20)} pos=(${npc.position.x.toFixed(0)}, ${npc.position.y.toFixed(0)}) hp=${npc.stats.hp}`);
  }

  // 3. Player attacks an NPC → trigger combat
  console.log("\n--- Player attacks Wanderer ---");
  const events = engine.attackNpc("wanderer");
  console.log(`Events fired: ${events.map((e) => e.type).join(", ")}`);

  // 4. Run combat turn-by-turn. Capture log before battle is cleared.
  let lastLog: string[] = [];
  let turn = 0;
  while (engine.battle && turn < 30) {
    const actor = engine.battle.combatants[engine.battle.currentActorIdx];
    if (!actor) break;
    if (actor.team === 0) {
      const enemies = engine.battle.combatants.filter((c: import("./types.js").Combatant) => c.team === 1 && c.alive);
      if (enemies.length === 0) break;
      engine.combatAction({
        actorId: actor.id,
        action: "attack",
        targetId: enemies[0]!.id,
      });
    } else {
      const player = engine.battle.combatants.find((c: import("./types.js").Combatant) => c.team === 0 && c.alive);
      if (!player) break;
      engine.combatAction({
        actorId: actor.id,
        action: "attack",
        targetId: player.id,
      });
    }
    if (engine.battle) lastLog = engine.battle.log.slice();
    turn++;
  }

  // 5. Show combat result
  console.log("\n--- Combat log ---");
  for (const line of lastLog) console.log(`  ${line}`);
  console.log(`Result: ${engine.lastBattleResult ?? "ongoing"}`);

  // 6. Check hatred propagation
  console.log("\n--- Hatred after combat ---");
  if (engine.lastBattleResult === "victory") {
    console.log(`NPCs with grudge on player: ${engine.totalNpcsWithGrudgeOnPlayer()}`);
    for (const npc of engine.listNpcs()) {
      const g = engine.getGrudgesAgainstPlayer(npc.id);
      if (g > 0) {
        console.log(`  ${npc.name.padEnd(20)} hatred=${g.toFixed(1)}`);
      }
    }
  } else {
    console.log(`(no hatred — battle result: ${engine.lastBattleResult})`);
  }

  // 7. Save / load roundtrip
  console.log("\n--- Save / Load roundtrip ---");
  const save = engine.save();
  console.log(`Save size: ${JSON.stringify(save).length} bytes`);
  const engine2 = createEngine({ seed: 12345, data });
  engine2.load(save);
  console.log(`Restored time: ${formatTime(engine2.state.time)}`);
  console.log(`Restored NPCs: ${engine2.state.npcs.size}`);
  console.log(`Player HP: ${engine2.getPlayer().stats.hp}`);

  console.log("\n=== Demo complete ===");
}

main().catch((err) => {
  console.error("Demo error:", err);
  process.exit(1);
});
