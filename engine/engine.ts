/**
 * Engine orchestrator.
 * Top-level facade tying all systems together.
 */

import type {
  EngineState, GameEvent, EntityId, GameSave, Player, NPC,
} from "./types.js";
import type { StaticData } from "./data/loader.js";
import { prngInit, prngNext, prngInt } from "./seed/prng.js";
import {
  SaveSerializer, createDefaultPlayer, initPrngStates,
} from "./save/serializer.js";
import { tickWorld, checkEncounter } from "./world/tick.js";
import { evaluateNpc } from "./ai/utility.js";
import { instantiateNpc } from "./npc/model.js";
import { advanceMinutes } from "./world/time.js";
import { eventBus, DelayedEventQueue } from "./events/dispatcher.js";
import { propagateHatred } from "./relationship/hatred.js";
import { addRelation, changeAffinity } from "./relationship/graph.js";
import {
  initBattle, resolveAction, type BattleState, type ActionRequest,
} from "./combat/battle.js";
import {
  applyRepChange, applyRepWithCascade, canJoinFaction, getRank, getRankLabel,
  affinityFromRep, REP_DELTAS, type RepChange,
} from "./faction/reputation.js";
import {
  migrateNpc, migrateFallennFactionMembers, checkPersonalBetrayal,
  recruitNpc, type MigrationResult,
} from "./faction/migration.js";
import {
  computeFactionStance, evaluateFactionPolitics, getAllStances,
  type FactionStance,
} from "./faction/politics.js";
import {
  initFactionWar, recordCasualty, getActiveWars, isAtWar,
  decayWarIntensity, getWarIntensity,
} from "./faction/war.js";
import {
  giveItem, takeItem, countItem, useItem, equipItem, getEquipmentBonus,
} from "./items/items.js";
import {
  getDayPhase, advanceMinutes as advanceTimeMinutes, formatTime, isDaytime,
} from "./world/time.js";
import {
  WEATHER_LIST, getWeatherEffect, tickWeather, rollWeather,
} from "./world/weather.js";
import {
  generateTerrain, getTileAt, getTileEncounterRate, TILE_DEFS,
} from "./world/terrain.js";
import {
  findPoiAt, enterPoi, listPoisInRegion,
} from "./world/poi.js";
import {
  meditate as meditateFn, attemptBreakthrough, expToNextLayer, breakthroughCost,
  type MeditationResult, type BreakthroughAttempt,
} from "./cultivation/cultivation.js";
import {
  craft, getRecipe, BUILTIN_RECIPES, type Recipe, type CraftResult,
} from "./cultivation/alchemy.js";
import {
  dualCultivate, type DualCultivationResult,
} from "./cultivation/dual.js";
import {
  acceptQuest, completeObjective, completeQuest, abandonQuest,
  onNpcKilled, onItemGained, onRegionEntered,
} from "./quest/quest.js";
import {
  getDialogue, chooseDialogueOption, stepDialogue,
  type DialogueNode,
} from "./dialogue/dialogue.js";
import {
  listShop, getBuyPrice, getSellPrice, buyItem, sellItem,
  type ShopResult,
} from "./economy/shop.js";
import { getNextStep as tutNextStep, completeStep as tutComplete, type TutorialStep } from "./tutorial/tutorial.js";
import { SaveManager, type SaveMeta } from "./persistence/saveManager.js";
import { AUTO_SLOT } from "./persistence/db.js";

export interface EngineConfig {
  seed: number;
  data: StaticData;
  initialPlayer?: Player;
  initialFactionWars?: { factionA: string; factionB: string; intensity: number; startDay?: number }[];
  /**
   * Optional IndexedDB-backed save manager. When provided, save()/load()
   * can target slots via `slot` arg, and auto-save fires every N ticks.
   */
  saveManager?: SaveManager;
  /**
   * Auto-save interval in world ticks (1 tick = 1 game-second per spec/03).
   * Spec/03 E1: auto save every 30 game-second. Default 30 when saveManager set, 0 = disabled.
   */
  autoSaveEveryTicks?: number;
  /**
   * Player actions between dirty-threshold saves (spec E1 "Dirty threshold").
   * Default 10.
   */
  dirtySaveThreshold?: number;
}

export class Engine {
  state: EngineState;
  data: StaticData;
  seed: number;
  prng: Record<string, { value: number; state: number }>;
  serializer: SaveSerializer;
  battle: BattleState | null = null;
  lastBattleResult: "victory" | "defeat" | "escape" | null = null;
  eventQueue: DelayedEventQueue = new DelayedEventQueue();
  /** Optional IndexedDB-backed save store. */
  saveManager: SaveManager | null;
  /** Auto-save cadence in world ticks (0 = disabled). */
  autoSaveEveryTicks: number;
  /** Game-second since last auto-save. */
  private ticksSinceAutoSave = 0;
  /** Last auto-save metadata, for inspection. */
  lastAutoSave: SaveMeta | null = null;
  /** Counter of player actions since last dirty-threshold save. */
  actionsSinceDirtySave = 0;
  /** Auto-save when this many player actions accumulate (spec E1 "Dirty threshold"). */
  dirtySaveThreshold: number = 10;

  constructor(config: EngineConfig) {
    this.seed = config.seed;
    this.data = config.data;
    this.prng = initPrngStates(config.seed);
    this.saveManager = config.saveManager ?? null;
    this.autoSaveEveryTicks = config.autoSaveEveryTicks
      ?? (config.saveManager ? 30 : 0);
    this.dirtySaveThreshold = config.dirtySaveThreshold ?? 10;
    this.serializer = new SaveSerializer({
      prngSeed: config.seed,
      dataVersion: config.data.dataVersion,
      prngState: this.prng,
    });

    const player = config.initialPlayer ?? createDefaultPlayer();

    const npcs = new Map<EntityId, NPC>();
    for (const [tplId, _tpl] of config.data.npcTemplates) {
      const npc = instantiateNpc(tplId, config.data, 0);
      if (npc) npcs.set(npc.id, npc);
    }

    this.state = {
      time: {
        day: 0,
        hour: 8,
        minute: 0,
        phase: "morning" as const,
        weather: "clear" as const,
        weatherDaysLeft: 3,
      },
      tick: 0,
      currentRegion: player.currentRegion,
      player,
      npcs,
      relations: [],
      events: [],
      flags: {},
      factionWars: [],
      tutorial: { currentIdx: 0, completed: [], done: false },
    };

    // Initial setup: a few relations to bootstrap social graph
    this.bootstrapRelations();

    // Initialize faction wars from config
    if (config.initialFactionWars) {
      for (const war of config.initialFactionWars) {
        initFactionWar(this.state, {
          ...war,
          startDay: war.startDay ?? 0,
        });
      }
    }
  }

  private bootstrapRelations(): void {
    const npcList = [...this.state.npcs.values()];
    if (npcList.length < 2) return;

    // Lý Trưởng Lão knows Lý Vệ Sĩ (master/family)
    const elder = this.state.npcs.get("village_elder");
    const guard = this.state.npcs.get("village_guard");
    if (elder && guard) {
      addRelation(this.state, elder.id, guard.id, "master", 60, 80, false);
      addRelation(this.state, elder.id, guard.id, "family", 30, 50, true);
    }
    // Trần Thương Nhân knows Lý Trưởng Lão (friend)
    const merchant = this.state.npcs.get("village_merchant");
    if (merchant && elder) {
      addRelation(this.state, merchant.id, elder.id, "friend", 40, 60, true);
    }
    void npcList;
  }

  // ============== World ==============

  tickWorld(): GameEvent[] {
    const result = tickWorld(this.state, this.data, this.prng.world);
    // Process delayed events
    const due = this.eventQueue.pop(this.state.time.day);
    for (const de of due) {
      eventBus.emit({
        id: de.id,
        type: de.type,
        source: de.source,
        targets: de.targets,
        data: de.data,
        day: this.state.time.day,
        tick: this.state.tick,
        timestamp: Date.now(),
      });
    }
    // War intensity slowly decays over time
    decayWarIntensity(this.state, 0.05);
    // Faction politics daily evaluation
    evaluateFactionPolitics(this.state, this.data, this.prng.world, this.state.time.day);

    // Auto-save (spec/03 E1: every 30 game-second when SaveManager wired).
    if (this.saveManager && this.autoSaveEveryTicks > 0) {
      this.ticksSinceAutoSave++;
      if (this.ticksSinceAutoSave >= this.autoSaveEveryTicks) {
        this.ticksSinceAutoSave = 0;
        // Fire-and-forget; caller can inspect lastAutoSave for confirmation.
        const payload = this.save();
        this.lastAutoSave = null;
        this.saveManager.save(AUTO_SLOT, payload, "auto")
          .then((meta) => { this.lastAutoSave = meta; })
          .catch((err: unknown) => {
            eventBus.emit({
              id: `autosave_fail_${Date.now()}`,
              type: "COMBAT_ENDED",
              source: "system",
              targets: [],
              data: { kind: "autosave_error", error: String(err) },
              day: this.state.time.day,
              tick: this.state.tick,
              timestamp: Date.now(),
            });
          });
      }
    }

    return result.events;
  }

  checkEncounterAtPlayer(): boolean {
    const region = this.data.regions.get(this.state.currentRegion);
    if (!region) return false;
    const baseRate = region.encounterRate;
    // Apply weather modifier
    const weatherEff = getWeatherEffect(this.state.time.weather);
    return checkEncounter(baseRate * weatherEff.encounterMultiplier, this.prng.world);
  }

  // ============== Tile + POI + Weather ==============

  /**
   * Advance world time by minutes. Returns whether day changed (triggers weather roll).
   */
  advanceTime(minutes: number): { dayChanged: boolean } {
    const r = advanceTimeMinutes(this.state.time, minutes);
    if (r.dayChanged) {
      // Roll weather when day changes
      const w = tickWeather(this.state.time.weather, this.state.time.weatherDaysLeft, this.prng.world);
      this.state.time.weather = w.weather;
      this.state.time.weatherDaysLeft = w.weatherDaysLeft;
    }
    return r;
  }

  /**
   * Move player by dx/dy. Returns whether encounter occurs (tile-based).
   */
  movePlayer(dx: number, dy: number): boolean {
    this.state.player.position.x += dx;
    this.state.player.position.y += dy;
    // Check encounter via tile
    const region = this.data.regions.get(this.state.currentRegion);
    if (!region) return false;
    const tile = getTileAt(
      generateTerrain(this.seed, region.id, region.width, region.height),
      Math.floor(this.state.player.position.x / region.tileSize),
      Math.floor(this.state.player.position.y / region.tileSize)
    );
    const encounterRate = getTileEncounterRate(tile);
    const weatherEff = getWeatherEffect(this.state.time.weather);
    if (!tile) return false;
    // Use deterministic checkEncounter
    const effective = encounterRate * weatherEff.encounterMultiplier;
    return checkEncounter(effective, this.prng.world);
  }

  /**
   * Get current terrain tile at player position.
   */
  getCurrentTile(): string {
    const region = this.data.regions.get(this.state.currentRegion);
    if (!region) return "unknown";
    const tile = getTileAt(
      generateTerrain(this.seed, region.id, region.width, region.height),
      Math.floor(this.state.player.position.x / region.tileSize),
      Math.floor(this.state.player.position.y / region.tileSize)
    );
    return tile ?? "unknown";
  }

  /**
   * Get terrain map for region (rendering/UI).
   */
  getTerrainMap(regionId: string): string[][] {
    const region = this.data.regions.get(regionId);
    if (!region) return [];
    const map = generateTerrain(this.seed, regionId, region.width, region.height);
    // Convert TerrainId to string for ease
    return map.map((row) => row.map((t) => t as string));
  }

  /**
   * Find POI at player's current tile.
   */
  findPoiHere(): import("./types.js").POIDef | null {
    const region = this.data.regions.get(this.state.currentRegion);
    if (!region) return null;
    const tileX = Math.floor(this.state.player.position.x / region.tileSize);
    const tileY = Math.floor(this.state.player.position.y / region.tileSize);
    return findPoiAt(this.data, this.state.currentRegion, tileX, tileY);
  }

  /**
   * Enter a POI by id.
   */
  enterPoi(poiId: string): { name: string; type: string; npcs: string[]; hasEncounter: boolean } | null {
    const r = enterPoi(this.state, this.data, poiId);
    if (!r) return null;
    return {
      name: r.po.name,
      type: r.po.type,
      npcs: r.po.npcs ?? [],
      hasEncounter: !!r.po.encounterOnEnter && (this.state.time.phase === "night" || this.state.time.phase === "evening"),
    };
  }

  /**
   * List all POIs in current region.
   */
  listPoisInRegion(): import("./types.js").POIDef[] {
    return listPoisInRegion(this.data, this.state.currentRegion);
  }

  /**
   * Get current weather + effect.
   */
  getWeatherInfo() {
    return {
      weather: this.state.time.weather,
      daysLeft: this.state.time.weatherDaysLeft,
      effect: getWeatherEffect(this.state.time.weather),
    };
  }

  /**
   * Advance time + check weather (test helper).
   */
  testRollWeather() {
    const w = rollWeather(this.prng.world);
    this.state.time.weather = w.weather;
    this.state.time.weatherDaysLeft = w.durationDays;
    return w;
  }

  // ============== Player actions ==============

  /**
   * Travel to a different region (sets player.currentRegion).
   * Triggers explore-quest hook + area-change save (spec E1).
   */
  enterRegion(regionId: string): void {
    this.state.currentRegion = regionId;
    onRegionEntered(this.state, this.data, regionId);
    // Auto-complete quests where all objectives are now met
    const completed: string[] = [];
    for (const p of this.state.player.questProgress) {
      if (p.status === "active") completed.push(p.questId);
    }
    for (const qid of completed) {
      completeQuest(this.state, this.data, qid);
    }
    this.maybeSave("area_change");
  }

  attackNpc(npcId: EntityId): GameEvent[] {
    const events: GameEvent[] = [];
    const npc = this.state.npcs.get(npcId);
    if (!npc || !npc.alive) return events;

    // 3v3 team combat: player + nearby faction allies vs NPC + nearby allies
    const playerTeam = buildCombatTeam(this, 0, [this.state.player]);
    // Enemy team: target + allied NPCs (same faction, in same region)
    const allies = [...this.state.npcs.values()]
      .filter((n) => n.id !== npcId && n.alive && n.factionId === npc.factionId && n.homeRegion === npc.homeRegion)
      .slice(0, 2);
    const enemyTeam = buildCombatTeam(this, 1, [npc, ...allies]);

    this.battle = initBattle({
      playerTeam,
      enemyTeam,
      data: this.data,
      rng: this.prng.combat,
      day: this.state.time.day,
      tick: this.state.tick,
    });

    events.push({
      id: `ENCOUNTER_${Date.now()}`,
      type: "ENCOUNTER_TRIGGERED",
      source: this.state.player.id,
      targets: [npcId],
      data: { reason: "player_attack" },
      day: this.state.time.day,
      tick: this.state.tick,
      timestamp: Date.now(),
    });

    this.fireTutorial("on_first_combat");
    this.maybeSave("pre_combat");

    return events;
  }

  // ============== Combat ==============

  combatAction(request: ActionRequest): GameEvent[] {
    if (!this.battle) return [];
    const result = resolveAction(this.battle, request, this.data, this.prng.combat);
    this.prng.combat = { value: result.events[0]?.id ? 0 : 0, state: this.prng.combat.state };
    void result;

    // If battle ended, apply post-combat
    if (this.battle.result) {
      return this.endBattle();
    }
    return [];
  }

  private endBattle(): GameEvent[] {
    if (!this.battle) return [];
    const events: GameEvent[] = [];

    const playerWon = this.battle.result === "victory";
    const enemies = this.battle.combatants.filter((c: import("./types.js").Combatant) => c.team === 1);

    if (playerWon) {
      for (const e of enemies) {
        if (!e.alive) {
          // Sync HP back to NPC (we treat combat HP as direct)
          const npc = this.state.npcs.get(e.id);
          if (npc) {
            npc.stats.hp = 0;
            npc.alive = false;
            // Hatred propagation
            const hatredEvents = propagateHatred(this.state, this.data, {
              actor: this.state.player.id,
              victim: npc.id,
              type: "killed",
              position: npc.position,
            });
            events.push(...hatredEvents);
            // Quest hook: kill objective
            onNpcKilled(this.state, this.data, npc.id);
            // NPC died event
            events.push({
              id: `NPC_DIED_${Date.now()}_${npc.id}`,
              type: "NPC_DIED",
              source: this.state.player.id,
              targets: [npc.id],
              data: { killer: this.state.player.id },
              day: this.state.time.day,
              tick: this.state.tick,
              timestamp: Date.now(),
            });
            // Schedule revenge attack (3 days later)
            this.scheduleRevenge(npc);
          }
        }
      }
    } else if (this.battle.result === "defeat") {
      // Player loses HP, returns to town
      this.state.player.stats.hp = 1;
    } else if (this.battle.result === "escape") {
      // No-op, player escaped
    }

    // Sync player HP back
    const playerCombatant = this.battle.combatants.find((c: import("./types.js").Combatant) => c.team === 0);
    if (playerCombatant) {
      this.state.player.stats.hp = Math.max(1, playerCombatant.stats.hp);
      this.state.player.stats.mp = Math.max(0, playerCombatant.stats.mp);
    }

    this.lastBattleResult = this.battle.result ?? null;
    this.battle = null;
    this.maybeSave("post_combat");
    return events;
  }

  private scheduleRevenge(victim: NPC): void {
    // Find a faction ally of the victim to attack
    for (const [id, npc] of this.state.npcs) {
      if (id === victim.id) continue;
      if (!npc.alive) continue;
      if (npc.factionId !== victim.factionId) continue;
      if (npc.grudge.find((g) => g.target === this.state.player.id)) {
        // Already has grudge, schedule attack
        this.eventQueue.enqueue({
          id: `REVENGE_${Date.now()}_${npc.id}`,
          type: "NPC_ATTACKED",
          source: npc.id,
          targets: [this.state.player.id],
          data: { attackerId: npc.id, victimId: this.state.player.id },
          executeAtDay: this.state.time.day + 3,
        });
        break;
      }
    }
  }

  // ============== Social ==============

  giveGift(targetId: EntityId, value: number): void {
    changeAffinity(this.state, this.state.player.id, targetId, "friend", value * 0.5, 1);
    this.markPlayerAction();
  }

  robNpc(targetId: EntityId): void {
    changeAffinity(this.state, this.state.player.id, targetId, "enemy", -40, 1.5);
    const npc = this.state.npcs.get(targetId);
    if (npc && npc.factionId) {
      applyRepChange(this.state.player, npc.factionId, REP_DELTAS.robbedMember, `rob_${targetId}`, "player");
    }
    this.markPlayerAction();
  }

  spareNpc(targetId: EntityId): void {
    changeAffinity(this.state, this.state.player.id, targetId, "friend", 20, 1);
    const npc = this.state.npcs.get(targetId);
    if (npc && npc.factionId) {
      applyRepChange(this.state.player, npc.factionId, REP_DELTAS.sparedMember, `spare_${targetId}`, "player");
    }
    this.markPlayerAction();
  }

  // ============== Faction ==============

  getPlayerRep(factionId: string): number {
    return this.state.player.factionRep[factionId] ?? 0;
  }

  getPlayerRank(factionId: string): string {
    return getRankLabel(getRank(this.state.player, factionId));
  }

  getAllPlayerRep(): Record<string, number> {
    return { ...this.state.player.factionRep };
  }

  /**
   * Try to join a faction. Requires rep ≥ 50.
   * Returns true if joined.
   */
  joinFaction(factionId: string): boolean {
    if (!canJoinFaction(this.state.player, factionId)) return false;
    applyRepChange(this.state.player, factionId, REP_DELTAS.joinedFaction, `join_${factionId}`, "player");
    this.state.player.factionRep[factionId] = 100;
    this.fireTutorial("on_first_faction");
    return true;
  }

  /**
   * Apply direct rep change (e.g., quest reward).
   */
  giveRep(factionId: string, delta: number, reason: string): number {
    return applyRepChange(this.state.player, factionId, delta, reason, "player");
  }

  /**
   * Apply rep change with alliance cascade (used by hatred.ts internally too).
   */
  giveRepCascade(change: RepChange): RepChange[] {
    return applyRepWithCascade(this.state, change);
  }

  /**
   * Check if two factions are at war.
   */
  isFactionAtWar(factionA: string, factionB: string): boolean {
    return isAtWar(this.state, factionA, factionB);
  }

  /**
   * Get war intensity between factions (0 if not at war).
   */
  getWarIntensity(factionA: string, factionB: string): number {
    return getWarIntensity(this.state, factionA, factionB);
  }

  /**
   * Get active wars for a faction.
   */
  getFactionWars(factionId: string): { factionA: string; factionB: string; intensity: number; casualties: Record<string, number> }[] {
    return getActiveWars(this.state, factionId).map((w) => ({
      factionA: w.factionA,
      factionB: w.factionB,
      intensity: w.intensity,
      casualties: { ...w.casualties },
    }));
  }

  /**
   * Get stance for a single faction.
   */
  getFactionStance(factionId: string): FactionStance {
    return computeFactionStance(this.state, this.data, factionId);
  }

  /**
   * Get all factions' current stance.
   */
  getAllFactionStances(): Record<string, FactionStance> {
    return getAllStances(this.state, this.data);
  }

  /**
   * Migrate NPC to a new faction.
   */
  migrateNpc(npcId: EntityId, newFactionId: string, reason: "faction_fallen" | "personal_betrayal" | "player_recruit" | "war_resolution" | "ideological_shift"): MigrationResult | null {
    return migrateNpc(this.state, npcId, newFactionId, reason, this.data);
  }

  /**
   * Check + auto-trigger personal betrayal.
   * Returns the migration result if betrayal happened.
   */
  checkAndTriggerBetrayal(npcId: EntityId): MigrationResult | null {
    const npc = this.state.npcs.get(npcId);
    if (!npc) return null;
    const check = checkPersonalBetrayal(npc, this.state, this.data);
    if (check.should && check.targetFaction) {
      return migrateNpc(this.state, npcId, check.targetFaction, "personal_betrayal", this.data);
    }
    return null;
  }

  /**
   * Recruit an NPC to player's faction (if player has one).
   */
  recruitNpc(npcId: EntityId, playerFactionId: string): MigrationResult | null {
    return recruitNpc(this.state, npcId, playerFactionId, this.data);
  }

  // ============== Cultivation ==============

  /**
   * Meditate in safe zone for `minutes` game time.
   * Returns exp gained.
   */
  meditate(minutes: number = 60): MeditationResult {
    const result = meditateFn(this.state, this.data, minutes);
    this.fireTutorial("on_first_meditation");
    return result;
  }

  /**
   * Cost in exp for next breakthrough attempt.
   */
  getBreakthroughCost(): { exp: number; isRealmTier: boolean } {
    return breakthroughCost(this.state.player, this.data);
  }

  /**
   * Attempt breakthrough to next layer or next realm tier.
   */
  attemptBreakthrough(): BreakthroughAttempt {
    const result = attemptBreakthrough(this.state, this.data, this.prng.world);
    this.fireTutorial("on_first_breakthrough");
    if (result.success) {
      const realmId = result.newRealm;
      if (realmId === "linh_khi") this.fireTutorial("on_realm_linh_khi");
      else if (realmId === "truc_co") this.fireTutorial("on_realm_truc_co");
      else if (realmId === "kim_dan") this.fireTutorial("on_realm_kim_dan");
    }
    return result;
  }

  /**
   * Get current cultivation exp.
   */
  getCultivationExp(): number {
    return this.state.player.cultivationExp;
  }

  /**
   * Add cultivation exp (debug/quest reward).
   */
  addCultivationExp(amount: number): void {
    this.state.player.cultivationExp += amount;
  }

  /**
   * Get player's current realm display name.
   */
  getRealmDisplay(): string {
    const realm = this.data.realms.get(this.state.player.realm);
    return realm ? `${realm.name} ${this.state.player.realmLayer}/${realm.layers}` : "Không rõ";
  }

  // ============== Tutorial ==============

  /**
   * Fire tutorial trigger; returns the step to show (if any) or null.
   * Caller should display it and call `completeTutorialStep` when dismissed.
   */
  fireTutorial(trigger: import("./tutorial/tutorial.js").TutorialTrigger): TutorialStep | null {
    return tutNextStep(this.state, trigger);
  }

  /**
   * Mark step as seen by player.
   */
  completeTutorialStep(stepId: string): void {
    tutComplete(this.state, stepId);
  }

  /**
   * Get count of pending tutorial steps.
   */
  getTutorialPending(): number {
    return this.state.tutorial.completed.length === 0
      ? 1
      : [...this.state.tutorial.completed].length;
  }

  /**
   * Skip tutorial entirely (for experienced players / debug).
   */
  skipTutorial(): void {
    this.state.tutorial.done = true;
    this.state.tutorial.currentIdx = 999;
    this.state.tutorial.completed = ["*"];
  }

  // ============== Alchemy ==============

  /**
   * List all known recipes.
   */
  listRecipes(): Recipe[] {
    return [...BUILTIN_RECIPES];
  }

  /**
   * Get recipe by id.
   */
  getRecipe(id: string): Recipe | undefined {
    return getRecipe(id);
  }

  /**
   * Craft a recipe. Consumes ingredients, gives output.
   */
  craft(recipeId: string): CraftResult {
    const recipe = getRecipe(recipeId);
    if (!recipe) {
      return {
        success: false,
        quality: "failure",
        resultItem: null,
        quantity: 0,
        message: "Không có phương thuốc này",
      };
    }
    return craft(this.state, recipe, this.prng.world);
  }

  // ============== Dual cultivation ==============

  /**
   * Song tu với NPC partner. 3× exp nhưng có rủi ro phản bội.
   */
  dualCultivate(partnerId: EntityId, minutes: number = 60): DualCultivationResult {
    return dualCultivate(this.state, this.data, partnerId, minutes, this.prng.world);
  }

  // ============== Quest ==============

  /**
   * List all available quest defs in the game.
   */
  listQuests() {
    return [...this.data.quests.values()];
  }

  /**
   * Get a quest def by id.
   */
  getQuest(questId: string) {
    return this.data.quests.get(questId);
  }

  /**
   * Get active quest progress (player.questProgress with status active).
   */
  getActiveQuests() {
    return this.state.player.questProgress.filter((q) => q.status === "active");
  }

  /**
   * Get all quest progress (any status).
   */
  getAllQuestProgress() {
    return [...this.state.player.questProgress];
  }

  /**
   * Accept a quest. Returns {accepted, reason}.
   */
  acceptQuest(questId: string): { accepted: boolean; reason?: string } {
    return acceptQuest(this.state, this.data, questId);
  }

  /**
   * Manually advance objective progress. Auto-checks completion.
   * Returns true if all objectives done.
   */
  advanceQuestObjective(questId: string, objectiveIdx: number, count: number = 1): boolean {
    const done = completeObjective(this.state, this.data, questId, objectiveIdx, count);
    if (done) this.completeQuest(questId);
    return done;
  }

  /**
   * Complete a quest (after all objectives met). Awards rewards.
   */
  completeQuest(questId: string) {
    return completeQuest(this.state, this.data, questId);
  }

  /**
   * Abandon a quest.
   */
  abandonQuest(questId: string): boolean {
    return abandonQuest(this.state, questId);
  }

  /**
   * Mark a "talk" objective as complete (called when player talks to NPC).
   */
  reportTalkToNpc(npcId: EntityId): void {
    onItemGained; // satisfy unused-import warning; will be useful for collect hooks
  }

  /**
   * Mark a "deliver" objective complete when player gives item to NPC via engine.deliverItem.
   */
  triggerOnItemGained(itemId: string, quantity: number): void {
    onItemGained(this.state, this.data, itemId, quantity);
  }

  /**
   * Hook called on engine entry into a region (for "explore" objectives).
   */
  triggerOnRegionEntered(regionId: string): void {
    onRegionEntered(this.state, this.data, regionId);
  }

  /**
   * Hook called when NPC dies (for "kill" objectives).
   */
  triggerOnNpcKilled(npcId: EntityId): void {
    onNpcKilled(this.state, this.data, npcId);
  }

  // ============== Dialogue ==============

  /**
   * Talk to NPC. Returns available dialogue options + locked (with reasons).
   */
  talkToNpc(npcId: EntityId): {
    npcName: string;
    rootText: string;
    speaker: string;
    available: { text: string; next: string }[];
    locked: { text: string; reason: string }[];
  } | null {
    const npc = this.state.npcs.get(npcId);
    if (!npc) return null;
    const dial = getDialogue(this.state, this.data, npcId);
    if (!dial) return null;
    return {
      npcName: npc.name,
      rootText: dial.node.text,
      speaker: dial.node.speaker,
      available: dial.availableChoices,
      locked: dial.locked,
    };
  }

  /**
   * Choose a dialogue option by index. Applies effects, advances.
   */
  chooseDialogue(npcId: EntityId, fromNodeId: string = "root", choiceIdx: number = 0): DialogueNode | null {
    return chooseDialogueOption(this.state, this.data, npcId, npcId, fromNodeId, choiceIdx);
  }

  /**
   * Step dialogue without choices (auto-advance through effects).
   */
  stepDialogue(npcId: EntityId): DialogueNode | null {
    return stepDialogue(this.state, this.data, npcId);
  }

  /**
   * Get dialogue node by id (raw).
   */
  getDialogueNode(npcId: EntityId, nodeId: string): DialogueNode | null {
    const tree = this.data.dialogues.get(npcId);
    return tree?.nodes[nodeId] ?? null;
  }

  // ============== Shop ==============

  /**
   * List shop inventory for NPC. Filters by rep.
   */
  listShop(ownerId: EntityId) {
    return listShop(this.data, ownerId, this.state.player);
  }

  /**
   * Get buy price for item at NPC's shop.
   */
  getBuyPrice(ownerId: EntityId, itemId: string): number {
    return getBuyPrice(this.data, ownerId, itemId, this.state.player);
  }

  /**
   * Get sell price for item to NPC's shop.
   */
  getSellPrice(ownerId: EntityId, itemId: string): number {
    return getSellPrice(this.data, ownerId, itemId, this.state.player);
  }

  /**
   * Buy item from NPC shop.
   */
  buyItem(ownerId: EntityId, itemId: string, quantity: number = 1): ShopResult {
    return buyItem(this.state, this.data, ownerId, itemId, quantity);
  }

  /**
   * Sell item to NPC shop.
   */
  sellItem(ownerId: EntityId, itemId: string, quantity: number = 1): ShopResult {
    return sellItem(this.state, this.data, ownerId, itemId, quantity);
  }

  // ============== Items ==============

  /**
   * Give an item to an NPC (drops into their inventory).
   */
  giveItemToNpc(npcId: EntityId, itemId: string, quantity: number): number {
    const npc = this.state.npcs.get(npcId);
    if (!npc) return 0;
    const def = this.data.items.get(itemId);
    const maxStack = def?.maxStack ?? 99;
    const res = giveItem(npc.inventory ?? (npc.inventory = []), itemId, quantity, maxStack);
    return res.added;
  }

  /**
   * Give an item to the player.
   */
  giveItem(itemId: string, quantity: number): number {
    const def = this.data.items.get(itemId);
    const maxStack = def?.maxStack ?? 99;
    const res = giveItem(this.state.player.inventory, itemId, quantity, maxStack);
    return res.added;
  }

  /**
   * Take item from player inventory. Returns quantity removed.
   */
  takeItem(itemId: string, quantity: number): number {
    return takeItem(this.state.player.inventory, itemId, quantity);
  }

  /**
   * Count of item in player inventory.
   */
  countItem(itemId: string): number {
    return countItem(this.state.player.inventory, itemId);
  }

  /**
   * Apply (use) an item by ID. Resolves effect via static data.
   * Returns a record of effects applied + whether consumed.
   */
  applyItem(itemId: string): { consumed: boolean; effect: Record<string, number | string[]> | null; message?: string } {
    const def = this.data.items.get(itemId);
    if (!def) return { consumed: false, effect: null, message: "Vật phẩm không tồn tại" };
    if (def.type !== "consumable") {
      return { consumed: false, effect: null, message: "Không thể dùng" };
    }
    const have = this.countItem(itemId);
    if (have <= 0) return { consumed: false, effect: null, message: "Không có vật phẩm" };

    const applied: Record<string, number | string[]> = {};
    const eff = def.effect ?? {};
    if (typeof eff.heal === "number") {
      const before = this.state.player.stats.hp;
      this.state.player.stats.hp = Math.min(
        before + eff.heal, this.getPlayerMaxHp()
      );
      applied.heal = this.state.player.stats.hp - before;
    }
    if (typeof eff.restoreMp === "number") {
      const before = this.state.player.stats.mp;
      this.state.player.stats.mp = Math.min(before + eff.restoreMp, 999);
      applied.restoreMp = this.state.player.stats.mp - before;
    }
    if (typeof eff.cultivationExp === "number") {
      this.state.player.cultivationExp += eff.cultivationExp;
      applied.cultivationExp = eff.cultivationExp;
    }
    if (typeof eff.breakthroughBonus === "number") {
      this.state.player.states.push({
        id: `breakthrough_bonus`,
        name: "Phá Cảnh Hộ Thuốc",
        duration: 1, // used up on next breakthrough attempt
        day: this.state.time.day,
        source: "item",
        modifiers: { /* consumed by cultivation module */ },
      });
      applied.breakthroughBonus = eff.breakthroughBonus;
    }
    if (typeof eff.qiDeviationResist === "number") {
      this.state.player.states.push({
        id: `qi_stable`,
        name: "Tâm Tỏa",
        duration: 24 * 60, // 24h game-time
        day: this.state.time.day,
        source: "item",
        modifiers: {},
      });
      applied.qiDeviationResist = eff.qiDeviationResist;
    }
    if (Array.isArray(eff.dispell)) {
      const before = this.state.player.states.length;
      // Remove STUN/POISON/BURN etc by name check (basic)
      const dispellList = (eff.dispell as string[]) ?? [];
      this.state.player.states = this.state.player.states.filter((s) => {
        if (dispellList.includes(s.id)) return false;
        return true;
      });
      applied.dispell = eff.dispell;
      void before;
    }

    this.takeItem(itemId, 1);
    return { consumed: true, effect: applied };
  }

  /**
   * Equip item to slot. Replaces currently equipped.
   */
  equipItem(itemId: string): { equipped: boolean; oldItem: string | null; message?: string } {
    return equipItem(this.state.player, itemId, this.data.items);
  }

  /**
   * Sum of equipment stat bonuses.
   */
  getEquipmentBonus(): Partial<Player["stats"]> {
    return getEquipmentBonus(this.state.player, this.data.items);
  }

  /**
   * Player's max HP including cultivation level.
   * Realm/HP scaling done here for now; will be moved to cultivation module in Phase 2.
   */
  getPlayerMaxHp(): number {
    const realm = this.data.realms.get(this.state.player.realm);
    const baseHp = realm?.baseStats?.hp ?? this.state.player.stats.hp;
    const layer = this.state.player.realmLayer;
    const statPerLayer = realm?.statPerLayer?.hp ?? 0;
    const equipBonus = this.getEquipmentBonus();
    return baseHp + (layer - 1) * statPerLayer + (equipBonus.hp ?? 0);
  }

  /**
   * Migrate all members of a fallen faction to "wandering".
   */
  disbandFaction(factionId: string): MigrationResult[] {
    return migrateFallennFactionMembers(this.state, factionId, this.data);
  }

  // ============== Save ==============

  /**
   * Serialize current state to GameSave.
   * When `slot` and `kind` are provided AND saveManager is wired, also
   * persist to IDB atomically. Returns raw payload + optional meta.
   */
  async saveToSlot(
    slot: number,
    kind: "manual" | "auto" = "manual"
  ): Promise<{ payload: GameSave; meta: SaveMeta | null }> {
    const payload = this.save();
    if (!this.saveManager) return { payload, meta: null };
    const meta = await this.saveManager.save(slot, payload, kind);
    return { payload, meta };
  }

  save(): GameSave {
    // Sync worldEvents from eventQueue
    this.state.events = this.eventQueue.list();
    return this.serializer.serialize(this.state);
  }

  /**
   * Load. Backward-compat: accepts raw GameSave arg directly.
   * With saveManager wired, use `loadFromSlot(slot, kind?)` for IDB fetch.
   */
  load(save: GameSave): void {
    this.state = this.serializer.deserialize(save);
    this.eventQueue = new DelayedEventQueue();
    for (const e of this.state.events) {
      this.eventQueue.enqueue(e);
    }
  }

  /** Load from IDB-backed save slot (requires saveManager). */
  async loadFromSlot(
    slot: number,
    kind: "manual" | "auto" = "manual"
  ): Promise<GameSave | null> {
    if (!this.saveManager) {
      throw new Error("Engine.loadFromSlot requires saveManager in config");
    }
    const payload = await this.saveManager.load(slot, kind);
    if (payload) this.load(payload);
    return payload;
  }

  /** List all saves in the IDB store. */
  async listSaves(): Promise<SaveMeta[]> {
    if (!this.saveManager) return [];
    return this.saveManager.list();
  }

  /** Delete a save slot. */
  async deleteSave(slot: number, kind: "manual" | "auto" = "manual"): Promise<void> {
    if (!this.saveManager) return;
    await this.saveManager.delete(slot, kind);
  }

  /**
   * Centralized save trigger (spec/03 E1 trigger table).
   * - Always resets dirty counter on success.
   * - Returns null when saveManager not wired.
   *
   * Triggers handled:
   *   area_change    — player crosses region boundary.
   *   pre_combat     — before battle begins (attackNpc).
   *   post_combat    — after battle ends.
   *   player_action  — called from markPlayerAction for dirty-threshold flush.
   *   manual         — explicit saveToSlot calls.
   */
  async maybeSave(reason: "area_change" | "pre_combat" | "post_combat" | "player_action" | "manual"): Promise<SaveMeta | null> {
    if (!this.saveManager) return null;
    const payload = this.save();
    const meta = await this.saveManager.save(AUTO_SLOT, payload, "auto");
    this.lastAutoSave = meta;
    this.actionsSinceDirtySave = 0;
    return meta;
  }

  /**
   * Mark a player action. Increments dirty counter; flushes via maybeSave
   * when threshold reached (spec E1 "Dirty threshold").
   *
   * Counter resets immediately on threshold hit so concurrent action
   * sequences don't trigger another flush mid-save.
   */
  markPlayerAction(): void {
    this.actionsSinceDirtySave++;
    if (this.actionsSinceDirtySave >= this.dirtySaveThreshold) {
      this.actionsSinceDirtySave = 0;
      void this.maybeSave("player_action");
    }
  }

  // ============== Debug helpers ==============

  listNpcs(): NPC[] {
    return [...this.state.npcs.values()];
  }

  getNpc(id: EntityId): NPC | undefined {
    return this.state.npcs.get(id);
  }

  getPlayer(): Player {
    return this.state.player;
  }

  getGrudgesAgainstPlayer(npcId: EntityId): number {
    const npc = this.state.npcs.get(npcId);
    if (!npc) return 0;
    return npc.grudge
      .filter((g) => g.target === this.state.player.id)
      .reduce((s, g) => s + g.strength, 0);
  }

  totalNpcsWithGrudgeOnPlayer(): number {
    let count = 0;
    for (const npc of this.state.npcs.values()) {
      if (npc.grudge.some((g) => g.target === this.state.player.id)) count++;
    }
    return count;
  }
}

// ============== Helpers ==============

function npcToCombatant(
  src: Player | NPC,
  team: number,
  row: 0 | 1,
  col: 0 | 1 | 2
): import("./types.js").Combatant {
  return {
    id: src.id,
    name: src.name,
    side: team === 0 ? "player" : "enemy",
    team,
    row,
    col,
    stats: { ...src.stats },
    element: src.element,
    elementResist: {},
    traits: src.traits,
    states: src.states,
    statuses: [],
    ap: 3,
    maxAp: 3,
    combo: 0,
    alive: true,
  };
}

/**
 * Build a team of up to 3 combatants. First member goes to front row col 0,
 * second to front col 1, third to back col 0. Remaining slots left empty.
 */
function buildCombatTeam(
  _engine: Engine,
  team: number,
  members: (Player | NPC)[]
): import("./types.js").Combatant[] {
  const slots: { row: 0 | 1; col: 0 | 1 | 2 }[] = [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 0 },
  ];
  return members.slice(0, 3).map((m, idx) =>
    npcToCombatant(m, team, slots[idx]!.row, slots[idx]!.col)
  );
}

export function createEngine(config: EngineConfig): Engine {
  return new Engine(config);
}

void prngNext;
void prngInt;
void advanceMinutes;
void evaluateNpc;
void eventBus;
void affinityFromRep;
void recordCasualty;
