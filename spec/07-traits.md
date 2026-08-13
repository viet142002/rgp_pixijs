# 07 — Trait System

## Mục tiêu

Traits định nghĩa "tính cách" NPC, ảnh hưởng behavior, combat, social reaction. Hai loại:
- **Static**: định sẵn trong data, không đổi.
- **Dynamic**: xuất hiện trong runtime do sự kiện.

## Static Traits

Định nghĩa trong `data/traits.json`. Mỗi NPC chọn 1-3 traits khi spawn.

### Trait schema

```
Trait {
  id: string               # unique, stable
  name: string             # hiển thị
  
  modifiers: {
    # Combat
    damageMultiplier?: number
    defenseMultiplier?: number
    speedMultiplier?: number
    critRateBonus?: number
    
    # Behavior
    aggression?: number         # -1 đến 1, bias vào Attack action
    cowardice?: number          # 0 đến 1, ngưỡng bỏ chạy
    loyalty?: number            # 0 đến 1, willingness giúp friend
    
    # Social
    hatredMultiplier?: number   # 0.5 đến 2.0, scale hatred nhận
    grudgeStrength?: number     # bonus strength grudge
    forgiveRate?: number        # decay rate multiplier
    
    # Special
    skillAffinity?: string[]    # skill id buff
    elementalResist?: Record<Element, number>
  }
  
  tags: string[]           # dùng cho filter/group
}
```

### Ví dụ traits (tu tiên setting)

| id | name | Effect |
|---|---|---|
| `RIGHTEOUS` | Chính Nghĩa | hatredMultiplier 1.5, aggression +0.3 |
| `COWARD` | Nhát Gan | cowardice 0.8, bỏ chạy khi HP < 50% |
| `BLOODTHIRSTY` | Huyết Chiến | damageMultiplier 1.2, aggression +0.5 |
| `COMPASSIONATE` | Từ Bi | forgiveRate 2.0, ít grudge |
| `CUNNING` | Xảo Quyệt | critRateBonus 0.15, dùng skill thay attack |
| `IRON_WILL` | Sắt Ý | resist debuff, status duration -50% |
| `GREEDY` | Tham Lam | rob nhiều hơn, ít tha |
| `PROTECTOR` | Hộ Vệ | loyalty 0.9, xả thân cứu ally |
| `VINDICTIVE` | Hay Trả Thù | grudgeStrength 1.5, không forgive |

## Dynamic States

State là flag runtime, lưu trong save, có duration hoặc vĩnh viễn.

### State schema

```
State {
  id: string               # unique
  name: string             # hiển thị
  
  duration?: number        # game-second, nếu undefined = vĩnh viễn
  source?: string          # ai/sự kiện gây ra (NPC id hoặc "system")
  day: number              # ngày áp dụng
  
  modifiers?: {...}        # tương tự trait modifiers
  
  triggers?: StateTrigger[]  # event hook
}
```

### Common states

| id | name | Effect |
|---|---|---|
| `BLOOD_FEUD` | Huyết Cừu | Bắt buộc tấn công target khi thấy. +30% damage. |
| `DEBT_OF_GRATITUDE` | Ân Tình | Sẵn sàng giúp/che chở source. Không tấn công source. |
| `INNER_DEMON` | Tâm Ma | -20% accuracy, +10% crit damage, mất kiểm soát. |
| `BROKEN` | Tuyệt Vọng | Bỏ chạy khi HP < 70%, không counter-attack. |
| `ENLIGHTENED` | Khai Ngộ | +15% exp gain, +10% skill effectiveness. |
| `POSSESSED` | Bị Khống Chế | AI override bởi possessor. |
| `PROTECTED` | Được Hộ Vệ | Guard bởi protector NPC. |
| `INJURED` | Bị Thương | -20% speed, -10% attack. |

## Resolver

M�i tick, behavior engine gọi `resolveModifiers(npc)`:
1. Load static traits → apply modifiers.
2. Load active dynamic states → apply modifiers (stack nếu khác field).
3. Trả về flat modifier object dùng cho AI evaluation và combat calculation.

Modifier stacking rule:
- Cùng field, nhiều source → cộng (additive), không multiply.
- Exception: explicit multiply trong trait definition (`damageMultiplier`).

## State lifecycle

- **Apply**: thêm vào `npc.states[]`, set `day` và optional `duration`.
- **Tick**: mỗi world tick, giảm duration nếu có. Duration ≤ 0 → remove.
- **Stack**: state cùng id → refresh duration, không stack.
- **Override**: state đặc biệt (POSSESSED) → disable AI gốc.

## State trigger

State có thể attach event hook:
```
StateTrigger {
  on: "TICK" | "COMBAT_START" | "WITNESS_DEATH" | ...
  action: "DAMAGE_SELF" | "HEAL_SELF" | "ADD_STATE" | "DISPEL" | ...
  value?: number
}
```

Ví dụ `INNER_DEMON` có trigger `on: TICK, action: DAMAGE_SELF, value: 1` (tự gây thương mỗi giây).

## Data location

- `data/traits.json`: static traits catalog.
- `data/states.json`: dynamic states catalog.
- Runtime: `npc.states[]` trong save.
