import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";
import { createEngine } from "../engine/engine.js";
import { rankFromRep } from "../engine/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

describe("Faction Reputation", () => {
  it("rankFromRep maps values to tiers", () => {
    expect(rankFromRep(-100)).toBe("sworn_enemy");
    expect(rankFromRep(-50)).toBe("hostile");
    expect(rankFromRep(-20)).toBe("unfriendly");
    expect(rankFromRep(0)).toBe("neutral");
    expect(rankFromRep(20)).toBe("friendly");
    expect(rankFromRep(50)).toBe("ally");
    expect(rankFromRep(100)).toBe("sworn_ally");
  });

  it("killing NPC reduces rep with their faction", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 11111, data });
    engine.state.player.stats.attack = 200;
    engine.state.player.stats.hp = 1000;

    const beforeRep = engine.getPlayerRep("village_council");
    engine.attackNpc("village_guard");
    let turns = 0;
    while (engine.battle && turns < 100) {
      const actor = engine.battle.combatants[engine.battle.currentActorIdx];
      if (!actor || !actor.alive) {
        const alive = engine.battle.combatants.find((c) => c.alive);
        if (!alive) break;
        engine.combatAction({actorId: alive.id, action: "defend"});
        turns++;
        continue;
      }
      const targets = engine.battle.combatants.filter(
        (c: import("../engine/types.js").Combatant) => c.team !== actor.team && c.alive
      );
      if (targets.length === 0) break;
      const target = [...targets].sort((a, b) => a.stats.hp - b.stats.hp)[0]!;
      engine.combatAction({
        actorId: actor.id,
        action: "attack",
        targetId: target.id,
      });
      turns++;
    }
    expect(engine.lastBattleResult).toBe("victory");
    const afterRep = engine.getPlayerRep("village_council");
    expect(afterRep).toBeLessThan(beforeRep);
  });

  it("alliance cascade: killing demon sect member reduces rep with demon + allies", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 22222, data });
    engine.state.player.stats.attack = 200;
    engine.state.player.stats.hp = 1000;

    // demon_disciple's faction: demon_sect
    // demon_sect hostile to: thanh_van_sect, bai_yun_sect, village_council
    // So killing demon disciple should INCREASE rep with thanh_van_sect (ally of demon's enemy)
    engine.attackNpc("demon_disciple");
    let turns = 0;
    while (engine.battle && turns < 100) {
      const actor = engine.battle.combatants[engine.battle.currentActorIdx];
      if (!actor || !actor.alive) {
        const alive = engine.battle.combatants.find((c) => c.alive);
        if (!alive) break;
        engine.combatAction({actorId: alive.id, action: "defend"});
        turns++;
        continue;
      }
      const targets = engine.battle.combatants.filter(
        (c: import("../engine/types.js").Combatant) => c.team !== actor.team && c.alive
      );
      if (targets.length === 0) break;
      const target = [...targets].sort((a, b) => a.stats.hp - b.stats.hp)[0]!;
      engine.combatAction({
        actorId: actor.id,
        action: "attack",
        targetId: target.id,
      });
      turns++;
    }
    expect(engine.lastBattleResult).toBe("victory");
    const repThanhVan = engine.getPlayerRep("thanh_van_sect");
    expect(repThanhVan).toBeGreaterThan(0);
  });

  it("spare NPC increases rep with their faction", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 33333, data });
    const beforeRep = engine.getPlayerRep("village_council");
    engine.spareNpc("village_child");
    const afterRep = engine.getPlayerRep("village_council");
    expect(afterRep).toBeGreaterThan(beforeRep);
  });

  it("rob NPC decreases rep with their faction", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 44444, data });
    const beforeRep = engine.getPlayerRep("village_council");
    engine.robNpc("village_merchant");
    const afterRep = engine.getPlayerRep("village_council");
    expect(afterRep).toBeLessThan(beforeRep);
  });

  it("canJoinFaction requires rep >= 50", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 55555, data });
    expect(engine.joinFaction("thanh_van_sect")).toBe(false);
    engine.giveRep("thanh_van_sect", 60, "test");
    expect(engine.joinFaction("thanh_van_sect")).toBe(true);
  });
});

describe("Faction War", () => {
  it("initial faction wars are configured", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({
      seed: 66666,
      data,
      initialFactionWars: [
        { factionA: "thanh_van_sect", factionB: "demon_sect", intensity: 60 },
      ],
    });
    expect(engine.isFactionAtWar("thanh_van_sect", "demon_sect")).toBe(true);
    expect(engine.getWarIntensity("thanh_van_sect", "demon_sect")).toBe(60);
  });

  it("killing faction member escalates war intensity", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({
      seed: 77777,
      data,
      initialFactionWars: [
        { factionA: "thanh_van_sect", factionB: "demon_sect", intensity: 50 },
      ],
    });
    const before = engine.getWarIntensity("thanh_van_sect", "demon_sect");
    engine.state.player.stats.attack = 200;
    engine.state.player.stats.hp = 1000;
    engine.attackNpc("demon_disciple");
    let turns = 0;
    while (engine.battle && turns < 100) {
      const actor = engine.battle.combatants[engine.battle.currentActorIdx];
      if (!actor || !actor.alive) {
        const alive = engine.battle.combatants.find((c) => c.alive);
        if (!alive) break;
        engine.combatAction({actorId: alive.id, action: "defend"});
        turns++;
        continue;
      }
      const targets = engine.battle.combatants.filter(
        (c: import("../engine/types.js").Combatant) => c.team !== actor.team && c.alive
      );
      if (targets.length === 0) break;
      const target = [...targets].sort((a, b) => a.stats.hp - b.stats.hp)[0]!;
      engine.combatAction({
        actorId: actor.id,
        action: "attack",
        targetId: target.id,
      });
      turns++;
    }
    const after = engine.getWarIntensity("thanh_van_sect", "demon_sect");
    expect(after).toBeGreaterThan(before);
  });

  it("war decays slowly over ticks", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({
      seed: 88888,
      data,
      initialFactionWars: [
        { factionA: "thanh_van_sect", factionB: "demon_sect", intensity: 50 },
      ],
    });
    const before = engine.getWarIntensity("thanh_van_sect", "demon_sect");
    for (let i = 0; i < 100; i++) engine.tickWorld();
    const after = engine.getWarIntensity("thanh_van_sect", "demon_sect");
    expect(after).toBeLessThan(before);
  });
});

describe("NPC Faction Migration", () => {
  it("migrateNpc changes faction and updates relations", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 99999, data });
    const result = engine.migrateNpc("village_child", "wandering", "player_recruit");
    expect(result).not.toBeNull();
    expect(result!.oldFaction).toBe("village_council");
    expect(result!.newFaction).toBe("wandering");
    const npc = engine.getNpc("village_child");
    expect(npc!.factionId).toBe("wandering");
  });

  it("disbandFaction moves all members to wandering", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 10000, data });
    const result = engine.disbandFaction("village_council");
    expect(result.length).toBeGreaterThan(0);
    for (const r of result) {
      expect(r.newFaction).toBe("wandering");
    }
  });

  it("personal betrayal triggered by grudge against own leader", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 11112, data });
    // Use sect_disciple (thanh_van_sect) — that faction has hostileTo list
    const sectMember = engine.getNpc("sect_disciple")!;
    // Force huge grudge against own faction member
    sectMember.grudge.push({
      target: "thanh_van_patrol",
      type: "attacked",
      strength: 100,
      decay: 1,
      day: 0,
    });
    const result = engine.checkAndTriggerBetrayal("sect_disciple");
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("personal_betrayal");
    // Should have moved to a hostile faction of thanh_van_sect (demon_sect or bandit_camp)
    expect(["demon_sect", "bandit_camp"]).toContain(result!.newFaction);
  });
});
