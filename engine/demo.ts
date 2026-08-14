/**
 * Demo: end-to-end game flow.
 * Run: npm run demo
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "./data/loader.js";
import { createEngine } from "./engine.js";
import { formatTime } from "./world/time.js";
// Polyfill IndexedDB in Node so demo can use SaveManager end-to-end.
import "fake-indexeddb/auto";
import { createSaveManager } from "./persistence/saveManager.js";
import { SAVE_SCHEMA_VERSION } from "./types.js";

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

  // 6.5. Quan hệ player ↔ NPC sau khi giết (chỉ仇恨/grudge, chưa có relation entry trực tiếp)
  console.log("\n--- Quan hệ Player↔NPC sau khi giết Wanderer ---");
  console.log("(grudge = hatred tích lũy, khi đủ mạnh NPC sẽ chuyển thành relation type=enemy)");
  for (const npc of engine.listNpcs()) {
    const rels = engine.state.relations.filter(
      (r) => r.from === "player" && r.to === npc.id
    );
    const hate = engine.getGrudgesAgainstPlayer(npc.id);
    if (rels.length > 0 || hate > 0) {
      const relStr = rels
        .map((r) => `${r.type}(aff:${r.affinity.toFixed(0)})`)
        .join(", ");
      console.log(
        `  Player → ${npc.name.padEnd(20)} [${relStr || "(chưa có relation)"}]  hatred=${hate.toFixed(1)}`
      );
    }
  }

  // 7. Spare demonstration: player tha một NPC → friend relation
  console.log("\n--- Spare flow: tha Tiểu Học Đồ ---");
  console.log("Trước:");
  const beforeSpare = engine.state.relations.filter(
    (r) => r.from === "player" && r.to === "village_child"
  );
  console.log(
    `  Player → village_child: ${beforeSpare.map((r) => `${r.type}(${r.affinity})`).join(", ") || "(none)"}`
  );
  engine.spareNpc("village_child");
  const afterSpare = engine.state.relations.filter(
    (r) => r.from === "player" && r.to === "village_child"
  );
  console.log("Sau spareNpc():");
  console.log(
    `  Player → village_child: ${afterSpare.map((r) => `${r.type}(aff:${r.affinity.toFixed(0)}, str:${r.strength.toFixed(0)})`).join(", ")}`
  );

  // 8. Rob demonstration: player cướp NPC → enemy relation
  console.log("\n--- Rob flow: cướp Thương Nhân ---");
  console.log("Trước:");
  const beforeRob = engine.state.relations.filter(
    (r) => r.from === "player" && r.to === "village_merchant"
  );
  console.log(
    `  Player → village_merchant: ${beforeRob.map((r) => `${r.type}(${r.affinity})`).join(", ") || "(none)"}`
  );
  engine.robNpc("village_merchant");
  const afterRob = engine.state.relations.filter(
    (r) => r.from === "player" && r.to === "village_merchant"
  );
  console.log("Sau robNpc():");
  console.log(
    `  Player → village_merchant: ${afterRob.map((r) => `${r.type}(aff:${r.affinity.toFixed(0)}, str:${r.strength.toFixed(0)})`).join(", ")}`
  );

  // 9. Quan hệ cuối cùng — tổng hợp tất cả
  console.log("\n--- Quan hệ cuối cùng (Player ↔ NPC) ---");
  for (const npc of engine.listNpcs()) {
    const rels = engine.state.relations.filter(
      (r) => r.from === "player" && r.to === npc.id
    );
    const hate = engine.getGrudgesAgainstPlayer(npc.id);
    if (rels.length > 0 || hate > 0) {
      const relStr = rels
        .map((r) => `${r.type}(aff:${r.affinity.toFixed(0)}, str:${r.strength.toFixed(0)})`)
        .join(", ");
      console.log(
        `  Player → ${npc.name.padEnd(20)} ${relStr || "(grudge only)"}  hatred=${hate.toFixed(1)}`
      );
    }
  }

  // 10. Quan hệ NPC ↔ NPC (đã bootstrap lúc khởi tạo)
  console.log("\n--- Quan hệ NPC ↔ NPC (đã bootstrap) ---");
  for (const npc of engine.listNpcs()) {
    const rels = engine.state.relations.filter(
      (r) => r.from === npc.id && r.to !== "player"
    );
    if (rels.length > 0) {
      const relStr = rels
        .map((r) => `→ ${engine.getNpc(r.to)?.name ?? r.to}: ${r.type}(${r.affinity.toFixed(0)})`)
        .join(", ");
      console.log(`  ${npc.name.padEnd(20)} ${relStr}`);
    }
  }

  // 11. Save / load roundtrip
  console.log("\n--- Save / Load roundtrip ---");
  const save = engine.save();
  console.log(`Save size: ${JSON.stringify(save).length} bytes`);
  const engine2 = createEngine({ seed: 12345, data });
  engine2.load(save);
  console.log(`Restored time: ${formatTime(engine2.state.time)}`);
  console.log(`Restored NPCs: ${engine2.state.npcs.size}`);
  console.log(`Player HP: ${engine2.getPlayer().stats.hp}`);
  console.log(
    `Restored player→village_child: ${engine2.state.relations
      .filter((r) => r.from === "player" && r.to === "village_child")
      .map((r) => `${r.type}(${r.affinity})`)
      .join(", ")}`
  );

  // ============== Faction mechanics demo ==============

  // Setup: fresh engine with initial faction war for clean demo
  console.log("\n=== Faction Mechanics Demo ===");
  const factionEngine = createEngine({
    seed: 99999,
    data,
    initialFactionWars: [
      { factionA: "thanh_van_sect", factionB: "demon_sect", intensity: 60 },
      { factionA: "village_council", factionB: "bandit_camp", intensity: 40 },
    ],
  });
  factionEngine.state.player.stats.attack = 100;
  factionEngine.state.player.stats.hp = 1000;
  factionEngine.state.player.stats.defense = 50;

  console.log("\n--- 12. Reputation BEFORE killing ---");
  console.log("(Player has 0 rep with all factions by default)");
  for (const [factionId, rep] of Object.entries(factionEngine.getAllPlayerRep())) {
    const rank = factionEngine.getPlayerRank(factionId);
    console.log(`  ${factionId.padEnd(20)} rep=${rep.toString().padStart(4)}  rank=${rank}`);
  }

  console.log("\n--- 13. Kill demon disciple (demon_sect member) ---");
  console.log(`  demon_sect hostile to: ${data.factions.get("demon_sect")?.hostileTo.join(", ")}`);
  console.log(`  → expect rep drop with demon_sect, rep rise with their enemies (thanh_van_sect)`);
  factionEngine.attackNpc("demon_disciple");
  let fcTurn = 0;
  while (factionEngine.battle && fcTurn < 30) {
    const actor = factionEngine.battle.combatants[factionEngine.battle.currentActorIdx];
    if (!actor) break;
    const targets = factionEngine.battle.combatants.filter(
      (c: import("./types.js").Combatant) => c.team !== actor.team && c.alive
    );
    if (targets.length === 0) break;
    factionEngine.combatAction({
      actorId: actor.id,
      action: "attack",
      targetId: targets[0]!.id,
    });
    fcTurn++;
  }
  console.log(`  result: ${factionEngine.lastBattleResult}`);
  console.log("  Rep AFTER:");
  for (const [factionId, rep] of Object.entries(factionEngine.getAllPlayerRep())) {
    const rank = factionEngine.getPlayerRank(factionId);
    if (rep !== 0) {
      console.log(`    ${factionId.padEnd(20)} rep=${rep.toString().padStart(4)}  rank=${rank}`);
    }
  }

  console.log("\n--- 14. War escalation: war intensity grows after kill ---");
  console.log(`  thanh_van_sect vs demon_sect intensity: ${factionEngine.getWarIntensity("thanh_van_sect", "demon_sect")}`);
  console.log(`  casualties:`, factionEngine.getFactionWars("demon_sect").map(w => w.casualties));

  console.log("\n--- 15. War decay over 200 ticks ---");
  const beforeDecay = factionEngine.getWarIntensity("thanh_van_sect", "demon_sect");
  for (let i = 0; i < 200; i++) factionEngine.tickWorld();
  const afterDecay = factionEngine.getWarIntensity("thanh_van_sect", "demon_sect");
  console.log(`  ${beforeDecay.toFixed(1)} → ${afterDecay.toFixed(1)}`);

  console.log("\n--- 16. Personal betrayal: force grudge then check ---");
  const sectMember = factionEngine.getNpc("sect_disciple")!;
  console.log(`  before: ${sectMember.name} faction=${sectMember.factionId}`);
  sectMember.grudge.push({
    target: "thanh_van_patrol",
    type: "attacked",
    strength: 100,
    decay: 1,
    day: 0,
  });
  const betrayal = factionEngine.checkAndTriggerBetrayal("sect_disciple");
  if (betrayal) {
    const updated = factionEngine.getNpc("sect_disciple")!;
    console.log(`  after:  ${updated.name} faction=${updated.factionId} (reason=${betrayal.reason})`);
  } else {
    console.log(`  no betrayal triggered`);
  }

  console.log("\n--- 17. Disband faction: disband village_council ---");
  console.log(`  village_council members: ${factionEngine.listNpcs().filter(n => n.factionId === "village_council").map(n => n.name).join(", ")}`);
  const disbanded = factionEngine.disbandFaction("village_council");
  console.log(`  → ${disbanded.length} NPCs migrated to wandering`);
  console.log(`  village_council members after: ${factionEngine.listNpcs().filter(n => n.factionId === "village_council").map(n => n.name).join(", ") || "(none)"}`);

  // ============== Items demo ==============

  console.log("\n=== Item System Demo ===");
  const itemEngine = createEngine({ seed: 55555, data });
  itemEngine.state.player.stats.hp = 30;

  console.log("\n--- 18. Inventory trước ---");
  for (const stack of itemEngine.getPlayer().inventory) {
    const def = data.items.get(stack.itemId);
    console.log(`  ${def?.name.padEnd(28) ?? stack.itemId.padEnd(28)} × ${stack.quantity}`);
  }

  console.log("\n--- 19. Nhặt vật phẩm ---");
  itemEngine.giveItem("hp_potion_small", 5);
  itemEngine.giveItem("spirit_sword", 1);
  itemEngine.giveItem("qi_recovery_pill", 3);
  console.log(`  Sau khi nhặt:`);
  for (const stack of itemEngine.getPlayer().inventory) {
    const def = data.items.get(stack.itemId);
    console.log(`    ${def?.name.padEnd(28) ?? stack.itemId.padEnd(28)} × ${stack.quantity}`);
  }

  console.log("\n--- 20. Trang bị ---");
  itemEngine.equipItem("spirit_sword");
  const bonus = itemEngine.getEquipmentBonus();
  console.log(`  bonus tấn công: ${bonus.attack}`);
  console.log(`  weapon slot: ${itemEngine.getPlayer().equipment?.weapon}`);

  console.log("\n--- 21. Dùng đan dược ---");
  const healRes = itemEngine.applyItem("hp_potion_small");
  console.log(`  hp_potion_small: heal=${healRes.effect?.heal}, consumed=${healRes.consumed}`);
  const qiRes = itemEngine.applyItem("qi_recovery_pill");
  console.log(`  qi_recovery_pill: cultivationExp +${qiRes.effect?.cultivationExp}, tổng exp: ${itemEngine.getPlayer().cultivationExp}`);

  console.log(`  HP sau dùng đan: ${itemEngine.getPlayer().stats.hp}`);

  // ============== Cultivation demo ==============

  console.log("\n=== Cultivation (Tu Luyện) Demo ===");
  const cultEngine = createEngine({ seed: 77777, data });
  cultEngine.state.currentRegion = "region_village";
  cultEngine.state.player.stats.hp = cultEngine.getPlayerMaxHp();

  console.log(`\n--- 22. Tu vi ban đầu ---`);
  console.log(`  ${cultEngine.getRealmDisplay()}`);
  console.log(`  exp: ${cultEngine.getCultivationExp()}`);

  console.log(`\n--- 23. Tọa thiền 8h ---`);
  const medRes = cultEngine.meditate(8 * 60);
  console.log(`  +${medRes.expGained} tu vi`);
  console.log(`  exp: ${cultEngine.getCultivationExp()}`);
  console.log(`  ${cultEngine.getRealmDisplay()}`);

  console.log(`\n--- 24. Luyện đan (Tụ Khí Đan) ---`);
  cultEngine.giveItem("spirit_herb", 6);
  cultEngine.giveItem("wood_essence", 2);
  const craftRes = cultEngine.craft("qi_recovery_pill_recipe");
  console.log(`  ${craftRes.message}`);
  console.log(`  tụ khí đan trong kho: ${cultEngine.countItem("qi_recovery_pill")}`);

  console.log(`\n--- 25. Dùng Tụ Khí Đan ---`);
  const expBefore = cultEngine.getCultivationExp();
  cultEngine.applyItem("qi_recovery_pill");
  console.log(`  exp: ${expBefore} → ${cultEngine.getCultivationExp()}`);

  console.log(`\n--- 26. Đột phá Luyện Khí tầng 2 ---`);
  // Add large exp pool and try multiple times
  for (let i = 0; i < 5; i++) {
    cultEngine.addCultivationExp(200);
  }
  let btAttempts = 0;
  let btResult = cultEngine.attemptBreakthrough();
  while (!btResult.success && btAttempts < 50) {
    cultEngine.addCultivationExp(200);
    btResult = cultEngine.attemptBreakthrough();
    btAttempts++;
  }
  console.log(`  ${btResult.message}`);
  console.log(`  ${cultEngine.getRealmDisplay()} (sau ${btAttempts} lần thử)`);
  if (btResult.qiDeviation) {
    console.log(`  ⚠ Đã trải qua tẩu hỏa nhập ma`);
  }

  // ============== Quest demo ==============

  console.log("\n=== Quest System Demo ===");
  const questEngine = createEngine({ seed: 88888, data });

  console.log(`\n--- 27. Danh sách nhiệm vụ ---`);
  for (const q of questEngine.listQuests().slice(0, 4)) {
    console.log(`  ${q.name.padEnd(28)} — ${q.description.substring(0, 50)}...`);
  }

  console.log(`\n--- 28. Nhận quest ---`);
  const a1 = questEngine.acceptQuest("herb_gathering");
  console.log(`  herb_gathering: accepted=${a1.accepted} ${a1.reason ?? ""}`);
  const a2 = questEngine.acceptQuest("sect_recruit_trial");
  console.log(`  sect_recruit_trial: accepted=${a2.accepted} ${a2.reason ?? ""}`);
  const a3 = questEngine.acceptQuest("demon_scout_patrol");
  console.log(`  demon_scout_patrol: accepted=${a3.accepted} ${a3.reason ?? ""}`);

  console.log(`\n--- 29. Tiến độ quest ---`);
  for (const q of questEngine.getActiveQuests()) {
    const def = questEngine.getQuest(q.questId)!;
    console.log(`  ${def.name.padEnd(28)}`);
    def.objectives.forEach((obj, idx) => {
      const cur = q.objectiveProgress[idx] ?? 0;
      console.log(`    - ${obj.description}: ${cur}/${obj.quantity}`);
    });
  }

  console.log(`\n--- 30. Hoàn thành mục tiêu ---`);
  questEngine.triggerOnItemGained("spirit_herb", 5); // collect objective done
  for (const q of questEngine.getAllQuestProgress()) {
    const def = questEngine.getQuest(q.questId)!;
    console.log(`  ${def.name}: status=${q.status}`);
  }

  console.log(`\n--- 31. Khám phá vùng mới ---`);
  questEngine.acceptQuest("explore_demon_valley");
  questEngine.enterRegion("region_demon_valley");
  const completed = questEngine.getAllQuestProgress().find((q) => q.questId === "explore_demon_valley");
  console.log(`  explore_demon_valley: ${completed?.status}`);
  console.log(`  player gold: ${questEngine.getPlayer().gold} (reward +500)`);

  // ============== Dialogue demo ==============

  console.log("\n=== Dialogue System Demo ===");
  const dialEngine = createEngine({ seed: 99999, data });

  console.log(`\n--- 32. Hội thoại Trưởng Làng ---`);
  const elderTalk = dialEngine.talkToNpc("village_elder");
  if (elderTalk) {
    console.log(`  ${elderTalk.speaker}: ${elderTalk.rootText}`);
    console.log(`  Lựa chọn:`);
    for (let i = 0; i < elderTalk.available.length; i++) {
      console.log(`    ${i + 1}. ${elderTalk.available[i]!.text}`);
    }
    // Pick "dẹp cướp" choice
    const chIdx = elderTalk.available.findIndex((c) => c.text.includes("dẹp cướp"));
    if (chIdx >= 0) {
      const next = dialEngine.chooseDialogue("village_elder", "root", chIdx);
      console.log(`  Sau chọn: ${next?.speaker}: ${next?.text}`);
      console.log(`  Quest active: ${dialEngine.getActiveQuests().map((q) => q.questId).join(", ") || "(none)"}`);
    }
  }

  console.log(`\n--- 33. Lữ Khách tặng linh thảo ---`);
  const wandererTalk = dialEngine.talkToNpc("wanderer");
  if (wandererTalk) {
    const herbIdx = wandererTalk.available.findIndex((c) => c.text.includes("5 cây linh thảo"));
    if (herbIdx >= 0) {
      const before = dialEngine.countItem("spirit_herb");
      dialEngine.chooseDialogue("wanderer", "root", herbIdx);
      const after = dialEngine.countItem("spirit_herb");
      console.log(`  spirit_herb: ${before} → ${after}`);
    }
  }

  console.log(`\n--- 34. Thanh Vân Tuần Tra ---`);
  const patrolTalk = dialEngine.talkToNpc("thanh_van_patrol");
  if (patrolTalk) {
    console.log(`  Available choices:`);
    for (const c of patrolTalk.available) {
      console.log(`    - ${c.text}`);
    }
    console.log(`  Locked: ${patrolTalk.locked.length === 0 ? "(không)" : ""}`);
    for (const l of patrolTalk.locked) {
      console.log(`    - ${l.text} (${l.reason})`);
    }
  }

  // ============== Shop demo ==============

  console.log("\n=== Shop System Demo ===");
  const shopEngine = createEngine({ seed: 11111, data });
  shopEngine.state.player.gold = 500;

  console.log(`\n--- 35. Mua sắm ở Thương Nhân ---`);
  const shopItems = shopEngine.listShop("village_merchant");
  console.log(`  Hàng có sẵn (${shopItems.length} món):`);
  for (const it of shopItems.slice(0, 6)) {
    const price = shopEngine.getBuyPrice("village_merchant", it.itemId);
    console.log(`    ${data.items.get(it.itemId)?.name.padEnd(28)} giá ${price} vàng`);
  }

  console.log(`\n--- 36. Mua đan ---`);
  const goldBefore = shopEngine.getPlayer().gold;
  const r1 = shopEngine.buyItem("village_merchant", "hp_potion_medium", 2);
  console.log(`  ${r1.message}`);
  console.log(`  Vàng: ${goldBefore} → ${shopEngine.getPlayer().gold}`);

  console.log(`\n--- 37. Bán linh thảo ---`);
  shopEngine.giveItem("spirit_herb", 10);
  const herbsBefore = shopEngine.countItem("spirit_herb");
  const r2 = shopEngine.sellItem("village_merchant", "spirit_herb", 5);
  console.log(`  ${r2.message}`);
  console.log(`  Linh thảo: ${herbsBefore} → ${shopEngine.countItem("spirit_herb")}`);

  console.log(`\n--- 38. Giảm giá theo phe ---`);
  shopEngine.state.player.factionRep["village_council"] = 100;
  const noDiscPrice = (() => {
    shopEngine.state.player.factionRep["village_council"] = 0;
    const p = shopEngine.getBuyPrice("village_merchant", "iron_sword");
    shopEngine.state.player.factionRep["village_council"] = 100;
    return p;
  })();
  const discPrice = shopEngine.getBuyPrice("village_merchant", "iron_sword");
  console.log(`  Sắt Kiếm: gốc ${noDiscPrice} vàng → giảm giá ${discPrice} vàng (-${noDiscPrice - discPrice})`);

  // ============== World foundation demo ==============

  console.log("\n=== World Foundation (Tile / POI / Weather) Demo ===");
  const worldEngine = createEngine({ seed: 12121, data });

  console.log(`\n--- 39. Day/night + thời tiết ---`);
  console.log(`  Ban đầu: ${formatTime(worldEngine.state.time)}, weather=${worldEngine.state.time.weather}`);
  for (let i = 0; i < 12; i++) {
    worldEngine.advanceTime(60 * 4); // 4h forward
    console.log(`  +4h: ${formatTime(worldEngine.state.time)}, weather=${worldEngine.state.time.weather} (${worldEngine.getWeatherInfo().daysLeft} ngày còn)`);
  }

  console.log(`\n--- 40. Tile terrain tại vị trí player ---`);
  console.log(`  Tile: ${worldEngine.getCurrentTile()}`);
  console.log(`  Encounter rate: ${worldEngine.checkEncounterAtPlayer() ? "có" : "không"}`);

  console.log(`\n--- 41. Render map 40x30 (rừng den) ---`);
  const villageMap = worldEngine.getTerrainMap("region_village");
  // Print 10-row sample
  for (let y = 0; y < Math.min(8, villageMap.length); y++) {
    const row = villageMap[y]!.slice(0, 40);
    const condensed = row.map((t) => {
      if (t === "grass") return ".";
      if (t === "road") return "=";
      if (t === "shrine") return "S";
      if (t === "sand") return "s";
      if (t === "forest") return "T";
      if (t === "water") return "~";
      if (t === "mountain") return "^";
      if (t === "swamp") return "w";
      if (t === "cave") return "C";
      if (t === "ruin") return "R";
      return "?";
    }).join("");
    console.log(`  ${condensed}`);
  }

  console.log(`\n--- 42. POIs trong vùng ---`);
  for (const poi of worldEngine.listPoisInRegion()) {
    console.log(`  ${poi.name.padEnd(28)} (${poi.type}) tại (${poi.position.x}, ${poi.position.y})`);
  }

  console.log(`\n--- 43. Đến POI ---`);
  worldEngine.state.player.position = { x: 20 * 32, y: 15 * 32 };
  console.log(`  Trước: tile=${worldEngine.getCurrentTile()}`);
  const poi = worldEngine.findPoiHere();
  if (poi) {
    console.log(`  Tìm thấy POI: ${poi.name}`);
    const info = worldEngine.enterPoi(poi.id);
    console.log(`  Loại: ${info?.type}, NPC ở đây: ${info?.npcs.join(", ") || "(không)"}`);
    console.log(`  Có cấn gặp (đêm): ${info?.hasEncounter}`);
  }

  console.log(`\n--- 44. Weather effect ---`);
  worldEngine.state.time.weather = "storm";
  const stormEff = worldEngine.getWeatherInfo().effect;
  console.log(`  Storm: encounter x${stormEff.encounterMultiplier}, regen ${stormEff.hpRegenPerHour}/h, speed x${stormEff.speedMultiplier}`);
  worldEngine.state.time.weather = "fog";
  const fogEff = worldEngine.getWeatherInfo().effect;
  console.log(`  Fog: encounter x${fogEff.encounterMultiplier} (tăng!), regen ${fogEff.hpRegenPerHour}/h`);

  console.log("\n========= Batch 2: Combat 3v3 + AI + Faction Politics =========");

  // 45. Faction stance snapshot
  console.log(`\n--- 45. Faction stance ban đầu ---`);
  const stances = worldEngine.getAllFactionStances();
  for (const [fid, stance] of Object.entries(stances)) {
    console.log(`  ${fid.padEnd(20)} → ${stance}`);
  }

  // 46. 3v3 combat: attack wanderer → triggers 3-enemy team
  console.log(`\n--- 46. Combat 3v3 vs wanderer (player + allies vs target + faction allies) ---`);
  worldEngine.state.player.stats.attack = 200;
  worldEngine.state.player.stats.hp = 1000;
  worldEngine.attackNpc("wanderer");
  if (worldEngine.battle) {
    const enemyTeam = worldEngine.battle.combatants.filter((c) => c.team === 1);
    const playerTeam = worldEngine.battle.combatants.filter((c) => c.team === 0);
    console.log(`  Player team (${playerTeam.length}): ${playerTeam.map((c) => c.name).join(", ")}`);
    console.log(`  Enemy team (${enemyTeam.length}): ${enemyTeam.map((c) => c.name).join(", ")}`);
    console.log(`  Formation: enemy ở [(${enemyTeam.map((c) => `${c.row},${c.col}`).join(") (")})]`);
    // Run 10 attacks to show turn order
    for (let i = 0; i < 10 && worldEngine.battle; i++) {
      const actor = worldEngine.battle.combatants[worldEngine.battle.currentActorIdx];
      if (!actor || !actor.alive) break;
      const targets = worldEngine.battle.combatants.filter((c) => c.team !== actor.team && c.alive);
      if (targets.length === 0) break;
      const target = [...targets].sort((a, b) => a.stats.hp - b.stats.hp)[0]!;
      console.log(`  T${i} ${actor.name} → ${target.name} (${target.stats.hp}HP)`);
      worldEngine.combatAction({ actorId: actor.id, action: "attack", targetId: target.id });
    }
    // Force end with defend loop, skip dead actors
    let forced = 0;
    while (worldEngine.battle && forced < 100) {
      const a = worldEngine.battle.combatants[worldEngine.battle.currentActorIdx];
      if (!a || !a.alive) {
        const alive = worldEngine.battle.combatants.find((c) => c.alive);
        if (!alive) break;
        worldEngine.combatAction({ actorId: alive.id, action: "defend" });
        forced++;
        continue;
      }
      const tg = worldEngine.battle.combatants.filter((c) => c.team !== a.team && c.alive);
      if (tg.length === 0) break;
      const t2 = [...tg].sort((x, y) => x.stats.hp - y.stats.hp)[0]!;
      worldEngine.combatAction({ actorId: a.id, action: "attack", targetId: t2.id });
      forced++;
    }
    console.log(`  Kết quả: ${worldEngine.lastBattleResult} sau ${forced} lượt`);
  }

  // 47. Faction stance changes after combat
  console.log(`\n--- 47. Faction stance sau combat (reputation giảm) ---`);
  const stances2 = worldEngine.getAllFactionStances();
  for (const [fid, stance] of Object.entries(stances2)) {
    if (stance !== stances[fid]) {
      console.log(`  ${fid.padEnd(20)} ${stances[fid]} → ${stance}`);
    }
  }

  // 48. Faction politics tick
  console.log(`\n--- 48. Politics tick (10 ngày) ---`);
  worldEngine.giveRep("thanh_van_sect", 60, "demo");
  console.log(`  Đã +60 rep Thanh Vân → stance = ${worldEngine.getFactionStance("thanh_van_sect")}`);
  for (let i = 0; i < 1440 * 10; i++) worldEngine.tickWorld();
  console.log(`  Sau 10 ngày: rep Thanh Vân = ${worldEngine.getPlayerRep("thanh_van_sect")} (defensive +1/ngày)`);
  console.log(`  Stances hiện tại:`);
  for (const [fid, stance] of Object.entries(worldEngine.getAllFactionStances())) {
    console.log(`    ${fid.padEnd(20)} → ${stance}`);
  }

  console.log("\n========= Batch 3: Tutorial + Modding =========");

  // 49. Tutorial state
  console.log(`\n--- 49. Tutorial state ban đầu ---`);
  console.log(`  done=${worldEngine.state.tutorial.done}, completed=${worldEngine.state.tutorial.completed.length}`);
  const welcome = worldEngine.fireTutorial("on_start");
  console.log(`  on_start → step: ${welcome?.title} / ${welcome?.body}`);

  // 50. Tutorial progression
  console.log(`\n--- 50. Tutorial progression ---`);
  worldEngine.completeTutorialStep("welcome");
  console.log(`  Sau complete("welcome"): completed=${worldEngine.state.tutorial.completed.length}`);
  const combatStep = worldEngine.fireTutorial("on_first_combat");
  console.log(`  on_first_combat → ${combatStep?.title}`);

  // 51. Mod loader
  console.log(`\n--- 51. Mod loader ---`);
  const { loadMods, applyMods, validateModDependencies, topoSortMods } = await import("./modding/loader.js");
  const mods = loadMods(join(DATA_DIR, "mods"));
  console.log(`  Mods tìm thấy: ${mods.length}`);
  for (const m of mods) console.log(`    - ${m.manifest.id} v${m.manifest.version}: ${m.manifest.name}`);
  const missing = validateModDependencies(mods);
  console.log(`  Missing deps: ${missing.length === 0 ? "(none)" : missing.join(", ")}`);
  const sorted = topoSortMods(mods);
  console.log(`  Topo order: ${sorted.map((m) => m.manifest.id).join(" → ")}`);
  const merged = applyMods(data, sorted);
  console.log(`  Base npcTemplates: ${data.npcTemplates.size}, merged: ${merged.npcTemplates.size} (+${merged.npcTemplates.size - data.npcTemplates.size})`);

  // 52. Onboarding quest chain
  console.log(`\n--- 52. Onboarding quests ---`);
  const { ensureOnboardingQuests } = await import("./tutorial/onboarding.js");
  const before = worldEngine.state.player.questProgress.length;
  const r = ensureOnboardingQuests(worldEngine.state, data, worldEngine.state.player.id);
  console.log(`  Đã thêm ${r.added.length} quests (trước: ${before}, sau: ${worldEngine.state.player.questProgress.length})`);
  for (const q of r.added) console.log(`    + ${q}`);

  console.log("\n========= Batch 4: Endgame + Tooling =========");

  // 53. Tribulation
  console.log(`\n--- 53. Thiên Kiếp ---`);
  const { generateTribulation, canChallengeTribulation, runTribulation, listAvailableSecretBosses } = await import("./endgame/tribulation.js");
  console.log(`  Realm hiện tại: ${worldEngine.state.player.realm}, có thể độ kiếp: ${canChallengeTribulation(worldEngine.state, data)}`);
  worldEngine.state.player.realm = "kim_dan";
  worldEngine.state.player.stats.maxHp = 99999;
  worldEngine.state.player.stats.hp = 99999;
  worldEngine.state.player.stats.maxMp = 99999;
  worldEngine.state.player.stats.mp = 99999;
  console.log(`  Sau khi lên Kim Đan + max HP: có thể độ kiếp: ${canChallengeTribulation(worldEngine.state, data)}`);
  const waves = generateTribulation(worldEngine.state);
  console.log(`  Sóng: ${waves.length} (đầu ${waves[0]?.damage} dmg, cuối ${waves[waves.length-1]?.damage} dmg)`);
  const tribRng = { value: 0, state: 12345 };
  const tribResult = runTribulation(worldEngine.state, data, tribRng);
  console.log(`  Kết quả: ascension=${tribResult.ascension}, rewards: ${tribResult.events.filter((e) => e.type === "TRIBULATION_WAVE").length} waves`);
  console.log(`  Player flag: ascended=${worldEngine.state.player.flags["ascended"]}, titles: ${worldEngine.state.player.titles.join(", ")}`);

  // 54. Legendary crafting
  console.log(`\n--- 54. Legendary crafting ---`);
  const { LEGENDARY_RECIPES, canCraftLegendary, craftLegendary } = await import("./endgame/legendary.js");
  for (const rec of LEGENDARY_RECIPES) {
    const check = canCraftLegendary(worldEngine.state, data, rec);
    console.log(`  ${rec.id}: ok=${check.ok}${check.ok ? "" : " (" + check.reasons.join("; ") + ")"}`);
  }
  worldEngine.state.player.inventory.push(
    { itemId: "thien_kinh_iron", quantity: 2 },
    { itemId: "cuu_chau_thuy_tinh", quantity: 2 },
  );
  const recipe = LEGENDARY_RECIPES[0]!;
  const craftRng = { value: 0.01, state: 77777 };
  const craftResult = craftLegendary(worldEngine.state, recipe, craftRng);
  console.log(`  Craft ${recipe.name}: quality=${craftResult.quality}, item=${craftResult.resultItem ?? "(failed)"}`);

  // 55. Secret bosses
  console.log(`\n--- 55. Secret bosses ---`);
  worldEngine.state.player.factionRep["demon_sect"] = -80;
  worldEngine.state.time.phase = "night";
  const bosses = listAvailableSecretBosses(worldEngine.state);
  console.log(`  Available: ${bosses.join(", ") || "(none)"}`);

  // 56. Inspector + Scenarios
  console.log(`\n--- 56. Inspector ---`);
  const { fullReport, saveSnapshot } = await import("./tooling/inspector.js");
  const { SCENARIOS, listScenarios, applyScenario } = await import("./tooling/scenarios.js");
  console.log(`  Snapshot: ${saveSnapshot(worldEngine)}`);
  console.log(`  Scenarios: ${listScenarios().length}`);
  for (const line of listScenarios()) console.log(`    ${line}`);
  applyScenario(worldEngine, "war_zone");
  console.log(`  Sau war_zone: wars active = ${worldEngine.state.factionWars.filter((w) => w.active).length}`);

  console.log("\n=== Demo complete — Tu Tiên Bát Hoang Engine ===");
  console.log("Hệ thống: combat 3v3 + formation + AOE / hatred / faction politics / reputation / war / migration / cultivation / alchemy / dual cultivation / items / equipment / quests / dialogue / shop / tile map / POI / day-night / weather / save / tutorial / modding / tribulation / legendary crafting / secret bosses / inspector / scenarios");

  // 57. End-of-run persistence roundtrip — SaveManager ↔ engine
  console.log(`\n--- 57. End-of-run persistence ---`);
  const demoMgr = createSaveManager();
  const snapshot = worldEngine.save();
  const saved = await demoMgr.save(1, snapshot, "auto");
  console.log(`  Saved slot 1 (auto): schemaVersion=${saved.schemaVersion}, size=${saved.size}B, checksum=${saved.checksum.slice(0, 12)}…`);

  const reloaded = await demoMgr.load(1, "auto");
  if (!reloaded) throw new Error("Reload returned null — roundtrip failed");
  const checks = {
    schemaVersion: reloaded.schemaVersion === SAVE_SCHEMA_VERSION,
    realm: reloaded.player.realm === snapshot.player.realm,
    region: reloaded.currentRegion === snapshot.currentRegion,
    day: reloaded.worldTime.day === snapshot.worldTime.day,
    npcCount: reloaded.npcs.length === snapshot.npcs.length,
    warCount: (reloaded.factionWars ?? []).length === (snapshot.factionWars ?? []).length,
  };
  const allPass = Object.values(checks).every(Boolean);
  console.log(`  Reloaded: realm=${reloaded.player.realm}, day=${reloaded.worldTime.day}, npcs=${reloaded.npcs.length}, wars=${(reloaded.factionWars ?? []).length}`);
  console.log(`  Checks: ${JSON.stringify(checks)}`);
  if (!allPass) throw new Error("Persistence roundtrip mismatch");
  console.log("  ✓ End-of-run persistence OK");

  const slotList = await demoMgr.list();
  console.log(`  Slot list: ${slotList.length} entries`);
  for (const meta of slotList) console.log(`    slot ${meta.slot} (${meta.kind}) v${meta.schemaVersion} ${meta.size}B`);
}

main().catch((err) => {
  console.error("Demo error:", err);
  process.exit(1);
});
