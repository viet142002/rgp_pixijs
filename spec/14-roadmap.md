# 14 — Roadmap

## v0.2 (Offline MVP) — Mục tiêu hiện tại

**Scope**: Chứng minh 4 hệ thống cốt lõi.

- World tile-based + NPC + time.
- Combat turn-based JRPG (position, cover, combo, element, status).
- Social Graph + Hatred Propagation (witness, faction, decay).
- Save/Load với IndexedDB + version migration.

**Deliverable**: Game chạy được trong browser, 1 region playable, full combat loop, save/load roundtrip ổn định.

**Duration estimate**: 8-12 tuần (1 dev full-time).

---

## v0.3 — Faction & Reputation

**Thêm vào**:

### Faction system
- Faction có leader, member roster, rank structure.
- Player có reputation per faction (lành/tà trung lập).
- Reputation thay đổi qua quest/kill/help.
- Faction buff/debuff theo rep tier.

### Multi-ally combat
- Max ally tăng từ 2 → 4.
- Ally AI có role (tank, dps, heal, support).
- Formation system cho player chọn vị trí ally.

### Event Queue đầy đủ
- Tất cả event type từ spec implemented.
- Listener hook cho faction/quest/event.
- Event log filter, search, export.

### UI polish
- Mini-map.
- Settings (volume, keybind, language).
- Better animation, particle effect.

**Deliverable**: Faction đầy đà, multi-ally combat tactical hơn, event system hoàn chỉnh.

---

## v0.4 — Tu Luyện & Đột Phá

**Thêm vào**:

### Cultivation
- Player có realm + layer.
- Tu luyện = meditate/consume item → exp.
- Đột phá cảnh giới = mini-encounter (boss fight hoặc event).
- Đột phá fail = debuff nặng tạm thời.

### Dynamic Trait
- Trait có thể thay đổi do sự kiện (giết nhiều người → BLOODTHIRSTY tạm thời).
- Trait evolution: trait hiện có + event → trait mới mạnh hơn.

### Procedural Quest
- NPC đưa quest generate từ template + context.
- Quest reward theo difficulty + faction rep.
- Quest chain (3-5 step) với twist dựa trên player action.

### NPC skill learning
- NPC học skill mới qua combat exp.
- Skill có thể teach player.

**Deliverable**: Game loop dài hơn, player có progression motive.

---

## v0.5 — Tông Môn & Xã Hội

**Thêm vào**:

### Sect system
- Player gia nhập tông môn.
- Rank structure: ngoại môn → nội môn → trưởng lão → tông chủ.
- Sect quest, sect contribution point.
- PvE raid (multi-NPC boss fight).

### Romance / Marriage
- NPC lover system.
- Affinity threshold (90+) → romance quest line.
- Marriage → spouse buff, family mechanic.

### Children & Inheritance
- Player có con (procedural NPC từ parent stats).
- Con thừa kế trait, có thể tu luyện.
- Family tree trong relationship graph.

### Procedural generation
- Region mới generate theo template.
- NPC vãng lai spawn theo faction traffic.
- Event procedural theo world state.

**Deliverable**: Social depth, long-term progression, family gameplay loop.

---

## v0.6 — Crafting & Economy

**Thêm vào**:

### Crafting
- Luyện đan (pill).
- Luyện khí (weapon).
- Trận pháp (formation buff).
- Recipe từ NPC, scroll, exploration.

### Economy
- Merchant NPC với inventory thay đổi theo ngày.
- Black market (illegal item).
- Price fluctuation theo faction war.
- Player craft → bán → affect market.

### Material gathering
- Mining node, herb node.
- Respawn sau N ngày.
- Rare material trong dangerous region.

**Deliverable**: Player có alternate progression path ngoài combat.

---

## v0.7 — Endgame & Boss

**Thêm vào**:

### World boss
- Procedural boss spawn mỗi 30 game-day.
- Boss có mechanic độc (phase, enrage, summon).
- Loot legendary.

### Dungeon
- Procedural dungeon generation.
- Multi-floor, multi-room.
- Boss + miniboss.
- Loot table rare.

### Sect war
- Faction có thể declare war.
- Player chọn side.
- Large-scale NPC combat (background sim).
- Player join hoặc ở ngoài.

**Deliverable**: Long-term goal, world event player chứng kiến.

---

## v1.0 — Full Sandbox

**Polish + content**:

### Sandbox world
- ≥ 5 region (village, town, forest, sect, dungeon).
- ≥ 200 NPC unique.
- ≥ 50 quest (mix hand-crafted + procedural).

### Ecosystem NPC self-running
- Faction tự warfare khi không có player.
- Economy self-balance.
- NPC marry, có con, tạo family tree tự nhiên.

### Emergent storytelling hoàn chỉnh
- Câu chuyện phát sinh từ Nhân - Quả 100%.
- Player là witness, không phải center.
- Replay value cao.

### Packaging
- Electron build cho desktop.
- Steam release (nếu muốn).
- Mobile port (nếu scope cho phép).

**Deliverable**: Game hoàn chỉnh, ready for public.

---

## Milestone summary

| Version | Theme | Duration estimate |
|---|---|---|
| v0.2 | MVP core | 8-12 tuần |
| v0.3 | Faction + multi-ally | 4-6 tuần |
| v0.4 | Tu luyện + quest | 6-8 tuần |
| v0.5 | Tông môn + romance | 8-10 tuần |
| v0.6 | Crafting + economy | 6-8 tuần |
| v0.7 | Endgame | 6-8 tuần |
| v1.0 | Polish + launch | 4-6 tuần |

Tổng estimate: 18-24 tháng (1 dev).

---

## Out of scope (defer hoặc không làm)

- Multiplayer (không phù hợp offline-first vision).
- Backend server (không phù hợp offline-first vision).
- Cloud save (chỉ local save, optional export/import file).
- Marketplace / economy thật (không phải crypto game).
- PvP (game v1 tập trung PvE + emergent NPC drama).
- Mobile-first redesign (responsive UI nhưng không tối ưu touch đầu tiên).
- Voice acting (text-only hoặc simple SFX).
- Cinematic cutscene (sprite dialog đủ).
