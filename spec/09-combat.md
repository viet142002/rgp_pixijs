# 09 — Combat Engine

## Mục tiêu

Turn-based JRPG combat với position, cover, combo, element, status effect. Chiến đấu có chiều sâu chiến thuật nhưng vẫn đọc nhanh. Combat là một phần của vòng gameplay, không phải toàn bộ game.

## Trigger

Combat bắt đầu khi:
- Player attack NPC.
- NPC hostile encounter với player (ngoài safe zone).
- Quest/event trigger.
- NPC HELP_ALLY join combat đang diễn ra.

Combat là **instance riêng**, không trong world tick. World time pause khi combat diễn ra (combat dùng turn count).

## State Machine

```
INIT
  → ROLL_INITIATIVE
  → TURN_START (ai tick)
  → ACTION_SELECT (player hoặc AI)
  → ACTION_RESOLVE (apply effect, animation)
  → COMBO_UPDATE
  → CHECK_DEATH
  → CHECK_VICTORY
  → END_TURN
  → STATUS_TICK (decrement duration)
  → (loop until victory/defeat/escape)
  → POST_COMBAT
  → WORLD_RESUME
```

## Battle Grid

### Layout

Mỗi bên có **6 slot** xếp 2 hàng:
```
Player side:
[F1] [F2] [F3]    # Front row (cover provider, melee)
[B1] [B2] [B3]    # Back row (ranged, protected by front)

Enemy side:
[F1] [F2] [F3]
[B1] [B2] [B3]
```

### Position rules

- Front row có cover mặc định: incoming attack từ đối diện phải pass cover check.
- Back row an toàn hơn nhưng limited actions:
  - Melee skill không target được từ back row trừ khi có gap.
  - Ranged skill có penalty nếu bắn xuyên front row (ally挡路).
- Swap skill cho phép đổi front↔back.
- Dead → slot trống → row shift (back lên front nếu front empty).

### Flanking

Nếu enemy bị attack từ 2 hướng (cả front và back vì front bị knock aside):
- Flanking bonus: +20% damage.
- Cover bonus mất hiệu lực khi flanked.

## Initiative

Mỗi actor roll initiative:
```
initiative = speed + random(0, speed/2)
```

Sort descending. Order lưu thành `turnOrder[]`. Actor đầu tiên act trước.

Player turn riêng (chờ input). NPC turn auto-resolve sau delay ngắn (animation).

## Action Points (AP)

Mỗi turn có **3 AP**.

| Action | AP cost |
|---|---|
| Basic Attack | 1 |
| Defend | 1 |
| Move (đổi vị trí row) | 1 |
| Skill (basic) | 2 |
| Skill (ultimate) | 3 |
| Item | 1 |
| Escape | 0 (1 lần/combat) |

AP không carry over. Hết AP → end turn.

## Action library

### Attack

- Target: enemy trong range.
- Range check: melee (cùng row hoặc adjacent), ranged (cùng row đối diện hoặc xuyên row nếu line of sight).
- Damage: `attack * damageMultiplier * elementMultiplier * coverMultiplier - defense`.
- Crit roll: nếu random < critRate → critDamage multiplier.
- Hit roll: nếu random < accuracy - evasion → miss.

### Skill

- Có skill id, MP cost, AP cost, cooldown, range pattern.
- Range patterns:
  - `single`: 1 target.
  - `line`: cả row (front hoặc back).
  - `radial`: 3x3 grid quanh target.
  - `cone`: 3 tile về phía trước.
  - `all_enemies`: toàn bộ enemy side.
  - `all_allies`: toàn bộ ally side (heal/buff).
- Effect: damage, heal, buff, debuff, status apply.

### Defend

- +50% defense trong lượt này.
- +20% resistance status effect.
- AP cost 1.

### Escape

- Combat kết thúc, player rút lui.
- Success rate: `30% + (speed - enemyAvgSpeed)/10`.
- Failure → enemy free attack.
- 1 lần/combat.

## Elemental System

6 element cơ bản:

| Element | id | Weakness | Strength |
|---|---|---|---|
| Hỏa | fire | water | wind |
| Thủy | water | earth | fire |
| Phong | wind | fire | earth |
| Lôi | lightning | earth | water |
| Thổ | earth | wind | lightning |
| Mộc | wood | fire | earth |

Element multiplier:
- Weakness: 1.5x damage taken.
- Strength: 0.5x damage taken.
- Resist (NPC có elementalResist): 0.25x.

Mỗi skill có element. Mỗi NPC có innate element (theo tu luyện path).

## Status Effects

Status tách khỏi state runtime. Có duration theo turn, áp dụng lúc apply.

| Status | Effect | Duration |
|---|---|---|
| `STUN` | Mất lượt | 1 turn |
| `POISON` | -5% max HP/turn | 3 turn |
| `BURN` | -10% max HP/turn, -10% accuracy | 3 turn |
| `FREEZE` | Speed -50%, miss physical attack 30% | 2 turn |
| `SILENCE` | Không dùng skill | 2 turn |
| `TAUNT` | Bắt buộc target user | 2 turn |
| `BLEED` | -3% max HP/turn, crit damage taken +20% | 4 turn |
| `REGEN` | +8% max HP/turn | 3 turn |
| `ATK_UP` / `ATK_DOWN` | ±25% attack | 3 turn |
| `DEF_UP` / `DEF_DOWN` | ±25% defense | 3 turn |
| `SPD_UP` / `SPD_DOWN` | ±20% speed | 3 turn |

Apply rule:
- `chance`: probability apply.
- Nếu NPC có resist (trait IRON_WILL) → chance giảm.
- Stack: cùng status → refresh duration, không stack magnitude.

## Combo System

Counter theo action liên tiếp trong combat:

| Combo tier | Condition | Effect |
|---|---|---|
| Combo 1 | 2 attack liên tiếp | +5% damage |
| Combo 2 | 3 attack liên tiếp | +10% damage, +5% crit |
| Combo 3 | 4 attack liên tiếp | +15% damage, +10% crit |
| Combo 4 | 5+ attack liên tiếp | +20% damage, +15% crit, unlock finisher option |

Combo break khi:
- Bị stun/freezed → reset về 0.
- Dùng skill không phải attack → reset (trừ combo skill).
- Turn đối phương xen vào không attack mình → reset.

Combo chỉ track trên actor đang act (player combo riêng, NPC combo riêng).

## Cover

Front row có cover mặc định trước back row enemy.

Cover calculation:
```
coverBonus = 0.3 (base) + 0.1 per ally in front row adjacent
incomingDamage *= (1 - coverBonus)
```

Flanked (cả front và back cùng bị target) → coverBonus = 0.

Cover không áp dụng cho ranged AoE (radial) hoặc skill line có hit back row.

## Post-Combat

Sau khi victory:

| Choice | Effect |
|---|---|
| Kill | NPC chết. Hatred propagation full. Item drop guaranteed. |
| Spare | Affinity +20. Có thể nhận Ân Tình state. Item random drop. |
| Rob | Affinity -40. Item drop guaranteed. Risk ambush 30% nếu có ally nearby. |

Sau defeat:
- Player HP = 1, về nearest town (lose some item/gold).
- Faction rep giảm với faction đã gây defeat.
- NPC nhớ đã thắng player (grudge +20 nếu hostile).

## Ally Reinforcement

Trong combat, NPC ally có thể join:
- Điều kiện: affinity ≥ 70 với player, distance ≤ 3 tile (world), player hostile encounter.
- Max ally MVP: 2 NPC (player + 2 ally vs enemy squad).
- Ally dùng AI tự động (player không control trực tiếp).

## Loot

Item drop table theo NPC rank + faction.
- Common: 60% drop rate.
- Rare: 15% drop rate.
- Epic: 3% drop rate.

PRNG seeded → drop deterministic theo combat seed.

## Combat Log

Mỗi action ghi log entry:
```
[turn 3] Player dùng Hỏa Cầu Thuật (Hỏa, 2 AP)
  → Lý Thanh Vân nhận 45 sát thương (Hỏa weakness 1.5x)
  → Lý Thanh Vân nhận status BURN (3 turn)
[turn 3] Lý Thanh Vân dùng Kiếm Pháp
  → Player né tránh
```

Log lưu trong combat, hiển thị realtime, persist khi post-combat summary.

## Animation

Mỗi action trigger animation:
- Attack: lunge + slash.
- Skill: cast effect + impact.
- Damage: hit flash + knockback.
- Death: collapse + fade.

PixiJS render. Animation không block logic (parallel).
