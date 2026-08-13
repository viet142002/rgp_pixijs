# 06 — Relationship & Hatred Propagation

## Relation Model

```
Relation {
  from: string               # entity id (NPC id hoặc "player")
  to: string                 # entity id
  type: "friend" | "enemy" | "family" | "master" | "disciple" | "rival" | "lover" | "sworn_brother"
  
  affinity: number           # -100 đến +100
  strength: number           # 0-100, độ sâu quan hệ
  
  day: number                # ngày hình thành
  symmetric: boolean         # nếu true, relation tự mirror (friend, family)
}
```

- Quan hệ lưu bằng **id**, không lồng object.
- `affinity` âm = thù, dương = hảo cảm.
- `strength` ảnh hưởng tốc độ thay đổi affinity và mức lan truyền.
- `symmetric: true` cho quan hệ tự nhiên (family, friend). Hệ thống tự tạo relation ngược.

## Symmetric relation

Khi A kết bạn B (symmetric):
- Tạo `Relation{from:A, to:B, type:friend, ...}`
- Tự động tạo `Relation{from:B, to:A, type:friend, ...}` mirror.

Asymmetric (master-disciple): chỉ một chiều.

## Affinity change

| Hành động | Delta |
|---|---|
| Tặng quà giá trị | +5 đến +20 (theo giá trị) |
| Cứu mạng | +30 |
| Giúp đánh | +10 |
| Đánh thương | -15 |
| Cướp | -40 |
| Giết người thân | -100 |
| S� nhục công khai | -20 |

Strength ảnh hưởng tốc độ: `effectiveDelta = baseDelta * (strength/100)`.

## Hatred Propagation

Khi một actor (player hoặc NPC) thực hiện hành vi tiêu cực, hệ thống tính hatred lan truyền tới nhiều đối tượng.

### Trigger events

- `NPC_DIED` (killed by actor)
- `NPC_ATTACKED` (severity theo damage)
- `NPC_ROBBED`
- `NPC_HUMILIATED` (combat escape, dialog insult)

### Propagation algorithm

**Bước 1: Witness scan**
Tìm NPC trong bán kính `witnessRadius` (default 8 tile) tại thời điểm event:
- Witness là NPC có line-of-sight tới actor.
- Witness thêm `witnessed_*` memory entry.
- Witness nhận hatred với actor:
  ```
  witnessHatred = baseHatred * traitMultiplier
  baseHatred = 20
  ```

**Bước 2: Relation cascade**
Từ victim → relation graph → tất cả NPC có relation với victim:
```
victimRelationHatred = |affinity| * strength * 0.5 * traitMultiplier
```
- NPC có relation `family` → hatred x3.
- NPC có relation `friend` → hatred x2.
- NPC có relation `rival` → hatred x0.5 (hả hê).

**Bư�c 3: Faction cascade**
Nếu victim thuộc faction → tất cả faction member nhận faction-wide hatred:
```
factionHatred = 30 (flat)
```
NPC faction leader nhận x2.

**Bước 4: Grudge write**
Mỗi NPC nhận hatred lưu thành `Grudge{type, strength}`:
- Strength = hatred value.
- Decay rate = 1 strength/day (default).

### Witness line-of-sight

Tile raycast từ actor → witness candidate. Nếu gặp terrain collision tile → blocked.

### Hatred decay

Mỗi game-day:
```
grudge.strength -= decay
nếu strength <= 0: xóa grudge
```

Player có thể làm hòa (gift, time skip) → giảm nhanh hơn.

### Example

Player giết NPC A (Lý trưởng làng X):
1. Witness: 5 NPC trong bán kính → mỗi NPC +20 hatred.
2. Relation: A có family (con A1, vợ A2) → x3 → +60 hatred. A có friend (B, C) → x2 → +40 hatred.
3. Faction: A thuộc phái Thanh Vân → 30 faction member, mỗi người +30 hatred.
4. Tổng: 5 + 3 + 2 + 30 = 40 NPC có grudge với player.

→ Player cảnh giác khi vào làng X hoặc vùng Thanh Vân trong vài chục game-day.

## Relationship Graph UI

Render graph bằng React Flow hoặc Cytoscape.js:
- Node: NPC (avatar, tên, realm).
- Edge: relation (color theo type, thickness theo strength).
- Click node: focus + hiện chi tiết NPC + grudge list.
- Filter: theo faction, theo relation type, theo grudge.

Hỗ trợ zoom, pan, search.
