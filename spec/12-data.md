# 12 — Data Management

## Static data

Định nghĩa trong `data/*.json`. Không thay đổi runtime.

```
data/
├── traits.json         # static traits catalog
├── states.json         # dynamic states catalog
├── skills.json         # skill definitions
├── realms.json         # tu vi ranks
├── factions.json       # faction definitions
├── items.json          # item catalog
├── elements.json       # elemental system
├── statuses.json       # status effects catalog
├── npcs.json           # NPC templates (per region)
└── maps/               # Tiled JSON files
    ├── region_village.json
    ├── region_forest.json
    └── region_sect.json
```

Mỗi file có `dataVersion: number` ở root.

## Data versioning

```
{
  "dataVersion": 3,
  "items": [...]
}
```

Khi game patch:
- Tăng `dataVersion`.
- Thêm migration trong `save/migration.ts` cho data references.
- Save cũ có `dataVersion` thấp hơn → áp dụng migration hoặc đánh dấu outdated.

## Runtime data

Lưu trong save game:

- Player (stats, position, inventory).
- NPCs (current state, position, HP, MP, states).
- Relations (graph).
- WorldEvents (delayed events queue).
- WorldState (map state, faction rep, flags).
- Inventory (player + NPC inventories).
- Map state (chest opened, NPC killed, etc).

## Static data schemas

### traits.json

```
{
  "dataVersion": 1,
  "traits": [
    {
      "id": "RIGHTEOUS",
      "name": "Chính Nghĩa",
      "modifiers": {
        "hatredMultiplier": 1.5,
        "aggression": 0.3
      },
      "tags": ["moral", "combat"]
    },
    ...
  ]
}
```

### skills.json

```
{
  "dataVersion": 1,
  "skills": [
    {
      "id": "fireball",
      "name": "Hỏa Cầu Thuật",
      "element": "fire",
      "mpCost": 15,
      "apCost": 2,
      "cooldown": 0,
      "range": "single",
      "damage": { "base": 30, "scaling": "attack", "factor": 1.2 },
      "statusEffect": { "type": "BURN", "chance": 0.3, "duration": 3 },
      "learnCost": 1,
      "prerequisite": null
    },
    ...
  ]
}
```

### realms.json

```
{
  "dataVersion": 1,
  "realms": [
    {
      "id": "luyen_khi",
      "name": "Luyện Khí",
      "layers": 9,
      "baseStats": { "hp": 100, "mp": 50, "attack": 10 },
      "statPerLayer": { "hp": 20, "mp": 10, "attack": 2 },
      "breakthroughCost": { "exp": 1000, "items": ["breakthrough_pill_basic"] }
    },
    ...
  ]
}
```

### factions.json

```
{
  "dataVersion": 1,
  "factions": [
    {
      "id": "thanh_van",
      "name": "Thanh Vân Tông",
      "alignment": "righteous",
      "hostileTo": ["demon_sect"],
      "allyTo": ["bai_yun"],
      "regions": ["region_sect_main"],
      "leader": "npc_leader_thanh_van"
    },
    ...
  ]
}
```

### items.json

```
{
  "dataVersion": 1,
  "items": [
    {
      "id": "hp_potion_small",
      "name": "Đan Dược Khôi Phục (Nhỏ)",
      "type": "consumable",
      "rarity": "common",
      "effect": { "heal": { "type": "flat", "value": 50 } },
      "value": 10
    },
    ...
  ]
}
```

### elements.json

```
{
  "dataVersion": 1,
  "elements": [
    { "id": "fire", "name": "Hỏa", "color": "#ff6b35" },
    { "id": "water", "name": "Thủy", "color": "#4a90e2" },
    { "id": "wind", "name": "Phong", "color": "#7ed321" },
    { "id": "lightning", "name": "Lôi", "color": "#9013fe" },
    { "id": "earth", "name": "Thổ", "color": "#8b6f47" },
    { "id": "wood", "name": "Mộc", "color": "#50e3c2" }
  ],
  "matchup": {
    "fire": { "weakness": "water", "strength": "wind" },
    "water": { "weakness": "earth", "strength": "fire" },
    ...
  }
}
```

### statuses.json

```
{
  "dataVersion": 1,
  "statuses": [
    {
      "id": "BURN",
      "name": "Bỏng",
      "icon": "status_burn",
      "duration": 3,
      "tickEffect": { "damage": { "type": "percent_max_hp", "value": 0.10 } },
      "modifier": { "accuracy": -0.10 },
      "dispellable": true
    },
    ...
  ]
}
```

### npcs.json (template)

NPC spawn từ template:

```
{
  "dataVersion": 1,
  "templates": [
    {
      "id": "village_elder",
      "name": "Lão Trưởng Làng",
      "gender": "Male",
      "realm": "luyen_khi_5",
      "stats": { "hp": 500, "mp": 200, "attack": 50, "defense": 30, "speed": 20 },
      "traits": ["RIGHTEOUS", "PROTECTOR"],
      "factionId": "village_council",
      "inventory": ["hp_potion_small", "gold_pouch"],
      "schedule": "elder_default",
      "homeRegion": "region_village",
      "spawnPosition": { "x": 512, "y": 384 }
    },
    ...
  ]
}
```

## Random Seed (PRNG)

### Mục đích

- Reproducible: cùng seed → cùng world state.
- Replay: share seed, bug reproducible.
- Save file nhỏ: lưu seed + initial state thay vì full RNG sequence.

### Implementation

Dùng **Mulberry32** hoặc **sfc32** (small, fast, good distribution):

```
prngInit(seed: number) → state
prngNext(state) → { value: number (0-1), state }
prngInt(state, min, max) → number
prngPick(state, array) → element
prngShuffle(state, array) → array (deterministic)
```

### Seed scope

Mỗi system có seed riêng:
```
seeds: {
  world: number,         # spawn, encounter
  ai: number,             # AI random tie-break
  combat: number,         # damage roll, crit, status chance
  loot: number            # drop table roll
}
```

Master seed = `prngInit(userSeed)` → derive sub-seeds.

### Save

Lưu `prngSeed: number` + `prngState: string` (serialized state) để resume chính xác.

### UI

- New game: cho player nhập seed (random button default).
- Share seed: hiện seed string trong save slot detail.
- Bug report: yêu cầu seed + actions.

## Data validation

Mỗi JSON file validate khi load:
- Required fields present.
- Type check.
- Reference check (skill id tồn tại, faction id tồn tại).
- Nếu fail → throw error + log file path, không load game.

Dev tool: CLI script validate toàn bộ data folder.

## Hot reload (dev)

Static data JSON có thể thay đổi dev. Watch mode tự reload. Không cần restart game. (Trade-off: chỉ static, runtime state vẫn cần restart.)
