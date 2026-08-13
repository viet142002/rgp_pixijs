/**
 * Core types used across the engine.
 */

// ============== Identity ==============

export type EntityId = string;
export const PLAYER_ID = "player";

// ============== Position ==============

export interface Position {
  x: number;
  y: number;
}

export interface TileCoord {
  tx: number;
  ty: number;
}

export interface Region {
  id: string;
  name: string;
  width: number;   // tiles
  height: number;  // tiles
  tileSize: number; // px, default 32
  encounterRate: number; // 0-1, chance per step
  isSafeZone: boolean;
}

// ============== Stats ==============

export interface Stats {
  hp: number;
  mp: number;
  attack: number;
  defense: number;
  speed: number;
  critRate: number;
  critDamage: number;
  evasion: number;
  accuracy: number;
}

export interface StatsInit {
  hp?: number;
  mp?: number;
  attack?: number;
  defense?: number;
  speed?: number;
  critRate?: number;
  critDamage?: number;
  evasion?: number;
  accuracy?: number;
}

// ============== Element ==============

export type ElementId = "fire" | "water" | "wind" | "lightning" | "earth" | "wood" | "none";

// ============== Time ==============

export interface WorldTime {
  day: number;
  hour: number;
  minute: number;
}

// ============== Relations ==============

export type RelationType =
  | "friend"
  | "enemy"
  | "family"
  | "master"
  | "disciple"
  | "rival"
  | "lover"
  | "sworn_brother";

export interface Relation {
  from: EntityId;
  to: EntityId;
  type: RelationType;
  affinity: number;  // -100 to +100
  strength: number;  // 0-100
  day: number;
  symmetric: boolean;
}

// ============== Traits & States ==============

export interface TraitModifier {
  // Combat
  damageMultiplier?: number;
  defenseMultiplier?: number;
  speedMultiplier?: number;
  critRateBonus?: number;
  // Behavior
  aggression?: number;     // -1 to 1
  cowardice?: number;      // 0 to 1
  loyalty?: number;        // 0 to 1
  // Social
  hatredMultiplier?: number;
  grudgeStrength?: number;
  forgiveRate?: number;
  // Stats
  evasion?: number;
  accuracy?: number;
  hp?: number;
  // Special
  elementalResist?: Partial<Record<ElementId, number>>;
}

export interface Trait {
  id: string;
  name: string;
  modifiers: TraitModifier;
  tags: string[];
}

export interface State {
  id: string;
  name: string;
  duration?: number;  // game-seconds, undefined = permanent
  source?: EntityId | "system";
  day: number;
  modifiers?: TraitModifier;
}

// ============== NPC ==============

export interface ScheduleEntry {
  hour: number;
  location: Position;
  action: string;
}

export interface MemoryEntry {
  day: number;
  type: string;
  actor: EntityId;
  context?: string;
  intensity: number;
}

export interface Grudge {
  target: EntityId;
  type: "killed_friend" | "killed_family" | "attacked" | "robbed" | "insulted" | "witnessed_death";
  strength: number;
  decay: number;
  day: number;
}

export interface NPC {
  id: EntityId;
  name: string;
  gender: "Male" | "Female";
  realm: string;
  stats: Stats;
  factionId: string;
  position: Position;
  homeRegion: string;
  traits: string[];   // trait ids
  states: State[];
  schedule: ScheduleEntry[];
  memory: MemoryEntry[];
  grudge: Grudge[];
  alive: boolean;
  spawnDay: number;
  inventory?: { itemId: string; quantity: number }[];
  element: ElementId;
}

// ============== Player ==============

export interface ItemStack {
  itemId: string;
  quantity: number;
}

export interface Player {
  id: typeof PLAYER_ID;
  name: string;
  realm: string;
  realmLayer: number;
  cultivationExp: number;
  stats: Stats;
  position: Position;
  currentRegion: string;
  traits: string[];
  states: State[];
  skills: string[];  // skill ids
  inventory: ItemStack[];
  equipment?: Record<string, string>;  // slot → itemId
  gold: number;
  factionRep: Record<string, number>; // factionId → rep
  element: ElementId;
  questProgress: import("./quest/quest.js").QuestProgress[];
}

// ============== Combat ==============

export type CombatActionId = "attack" | "skill" | "defend" | "item" | "escape";

export interface Combatant {
  id: EntityId;
  name: string;
  side: "player" | "enemy";
  team: number;        // 0 = player side, 1 = enemy side
  row: 0 | 1;          // 0 = front, 1 = back
  col: 0 | 1 | 2;      // 0-2 within row
  stats: Stats;
  element: ElementId;
  elementResist: Partial<Record<ElementId, number>>;
  traits: string[];
  states: State[];
  statuses: StatusInstance[];
  ap: number;
  maxAp: number;
  combo: number;
  alive: boolean;
}

export interface StatusInstance {
  statusId: string;
  duration: number;  // turns remaining
  source: EntityId;
}

export type StatusId =
  | "STUN" | "POISON" | "BURN" | "FREEZE" | "SILENCE"
  | "TAUNT" | "BLEED" | "REGEN" | "ATK_UP" | "ATK_DOWN"
  | "DEF_UP" | "DEF_DOWN" | "SPD_UP" | "SPD_DOWN";

export interface SkillDef {
  id: string;
  name: string;
  element: ElementId;
  mpCost: number;
  apCost: number;
  cooldown: number;
  range: "single" | "line" | "radial" | "cone" | "all_enemies" | "all_allies";
  damage: { base: number; scaling: "attack" | "magic"; factor: number };
  statusEffect?: { type: StatusId; chance: number; duration: number };
  heal?: { base: number; factor: number };
  buff?: { stat: keyof Stats; value: number; duration: number };
}

export interface BattleState {
  combatants: Combatant[];
  turnOrder: EntityId[];
  currentActorIdx: number;
  round: number;
  log: string[];
  result?: "victory" | "defeat" | "escape";
  escapedBy?: EntityId;
}

// ============== Events ==============

export type EventType =
  | "NPC_DIED" | "NPC_ATTACKED" | "NPC_HELPED" | "NPC_SPARED" | "NPC_ROBBED"
  | "PLAYER_REALM_UP" | "PLAYER_DIED" | "RELATION_CHANGED"
  | "GRUDGE_ADDED" | "GRUDGE_DECAYED" | "HATRED_PROPAGATED"
  | "FACTION_REP_CHANGED" | "WORLD_TIME_TICK" | "DAY_CHANGED"
  | "AREA_ENTERED" | "ENCOUNTER_TRIGGERED" | "COMBAT_ENDED";

export interface GameEvent {
  id: string;
  type: EventType;
  source: EntityId | "system";
  targets: EntityId[];
  data: Record<string, unknown>;
  day: number;
  tick: number;
  timestamp: number;
}

export interface DelayedEvent {
  id: string;
  type: EventType;
  source: EntityId | "system";
  targets: EntityId[];
  data: Record<string, unknown>;
  executeAtDay: number;
  executeAtTick?: number;
}

// ============== Save ==============

export interface GameSave {
  schemaVersion: number;
  dataVersion: number;
  prngSeed: number;
  prngState: Record<string, string>; // sub-seed name → state

  worldTime: WorldTime;
  currentRegion: string;
  player: Player;
  npcs: NPC[];
  relations: Relation[];
  worldEvents: DelayedEvent[];
  worldFlags: Record<string, unknown>;
  factionWars?: FactionWarState[]; // optional for backward compat
}

export const SAVE_SCHEMA_VERSION = 1;

// ============== Engine state ==============

export interface EngineState {
  time: WorldTime;
  tick: number;
  currentRegion: string;
  player: Player;
  npcs: Map<EntityId, NPC>;
  relations: Relation[];
  events: DelayedEvent[];
  flags: Record<string, unknown>;
  factionWars: FactionWarState[];
}

export type FactionRank =
  | "sworn_enemy" | "hostile" | "unfriendly"
  | "neutral" | "friendly" | "ally" | "sworn_ally";

export interface FactionWarState {
  factionA: string;
  factionB: string;
  intensity: number;        // 0-100
  startDay: number;
  casualties: Record<string, number>; // factionId → count
  active: boolean;
}

export const FACTION_RANK_THRESHOLDS: Record<FactionRank, number> = {
  sworn_enemy: -80,
  hostile: -50,
  unfriendly: -20,
  neutral: 20,
  friendly: 50,
  ally: 80,
  sworn_ally: 101, // anything ≥ 80 is ally, ≥ 100 is sworn_ally (capped)
};

export function rankFromRep(rep: number): FactionRank {
  if (rep <= -80) return "sworn_enemy";
  if (rep <= -50) return "hostile";
  if (rep <= -20) return "unfriendly";
  if (rep < 20) return "neutral";
  if (rep < 50) return "friendly";
  if (rep < 80) return "ally";
  return "sworn_ally";
}
