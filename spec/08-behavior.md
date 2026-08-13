# 08 — Behavior Engine (AI)

## Mục tiêu

NPC tự đưa ra quyết định hợp lý với context xung quanh. Utility AI cho phép:
- Nhiều action cạnh tranh, chọn action có score cao nhất.
- Personality (qua trait) làm lệch score.
- Behavior thay đổi theo state runtime.

## Tick rate

AI evaluation **không chạy mỗi world tick** (1 Hz). Quá tốn cho 100+ NPC.

| Tick | AI chạy? |
|---|---|
| World tick (1 Hz) | Không. Chỉ check event queue, encounter. |
| AI tick (0.2 Hz, 5s/lần) | Có. Evaluate current action. |
| Combat tick | Có, mỗi turn. |

AI tick là "decision moment". Giữa các AI tick, NPC tiếp tục action đã chọn.

## Utility AI

Mỗi action có score function:

```
score(action, npc, context) = Σ (weight * inputValue)
```

NPC chọn action score cao nhất (có tie-break rule ổn định: theo action id alphabetical).

## Action library

### Social actions

| Action | Inputs | Khi nào dùng |
|---|---|---|
| `WANDER` | wanderRange | Không có mục tiêu rõ, default idle |
| `PATROL` | patrolPath | NPC có lịch tuần tra (guard) |
| `SCHEDULE` | scheduleEntry | Theo giờ (đi chợ, về nhà) |
| `APPROACH` | target | Muốn gần NPC khác (bạn, người yêu) |
| `FLEE` | threat | Bỏ chạy khỏi threat |
| `AVOID` | target | Tránh NPC ghét |

### Combat actions

| Action | Khi nào dùng |
|---|---|
| `ATTACK` | Trong combat hoặc hostile encounter |
| `DEFEND` | HP thấp, có threat |
| `SKILL` | Có skill phù hợp, MP đủ |
| `HELP_ALLY` | Ally bị tấn công, loyalty cao |
| `CALL_REINFORCEMENT` | Faction ally trong bán kính |

### Reactive actions

| Action | Trigger |
|---|---|
| `INTERACT` | Player gần NPC interactable |
| `TRADE` | Player muốn mua/bán |
| `DIALOG` | Player chủ động nói chuyện |

## Score formula

Mỗi action có:
```
ActionScore {
  baseInputs: string[]         # input ids cần evaluate
  weights: Record<inputId, number>
  bias: number                 # constant offset
  threshold: number            # min score để action khả thi
}
```

### Inputs

Inputs là giá trị 0-1 (hoặc có range riêng) từ context:

| Input | Range | Mô tả |
|---|---|---|
| `Aggressive` | 0-1 | NPC aggression trait + state BLOOD_FEUD |
| `Cowardice` | 0-1 | NPC cowardice trait + HP ratio thấp |
| `Revenge` | 0-1 | NPC có grudge với target gần |
| `AllyNearby` | 0-1 | Có ally trong bán kính |
| `ThreatNearby` | 0-1 | Có hostile trong bán kính |
| `HealthLow` | 0-1 | HP ratio thấp |
| `ManaHigh` | 0-1 | MP ratio cao |
| `PlayerNearby` | 0-1 | Player trong bán kính |
| `Loyalty` | 0-1 | Trait loyalty với ally |
| `Greed` | 0-1 | Trait greedy + target có item giá trị |

### Ví dụ: ATTACK score

```
ATTACK.score = Aggressive * 1.0
             + Revenge * 0.8
             + AllyNearby * 0.3
             + ThreatNearby * 0.4
             + BLOOD_FEUD_present ? 1.5 : 0
             + 0.2 (base bias)
```

Nếu không có ThreatNearby và Aggressive thấp → score thấp → không tấn công.

### Ví dụ: FLEE score

```
FLEE.score = Cowardice * 1.2
          + HealthLow * 1.0
          + (no AllyNearby ? 0.3 : 0)
          + 0.5
```

HP thấp + Cowardice cao + không có ally → score cao → bỏ chạy.

## Decision flow

```
mỗi AI tick (5 giây):
  for each NPC (sort by id):
    context = collectContext(npc, world)
    modifiers = resolveModifiers(npc)
    for each action in ActionLibrary:
      if action.threshold check fail: skip
      action.lastScore = score(action, npc, context, modifiers)
    best = argmax(action.lastScore, tieBreak: id)
    npc.currentAction = best
```

## Action execution

Mỗi world tick, NPC execute current action:
- `WANDER`: pick random tile trong wanderRange, di chuyển.
- `PATROL`: move tới next waypoint.
- `SCHEDULE`: query schedule entry for current hour, move tới location.
- `APPROACH`: move tới target, stop khi trong interaction range.
- `FLEE`: move away from threat (vector ngược).
- `ATTACK`: trigger combat (chỉ khi player hostile encounter hoặc NPC hostile NPC).
- `HELP_ALLY`: nếu ally trong combat, join.
- `INTERACT`: nếu player trigger, queue dialog.

## Performance

- 100 NPC × (10 actions × 10 inputs) = 10,000 score eval mỗi AI tick (5s).
- Average: nhẹ. Worst case (combat): 2000 score eval/tick.
- Optimization: cache context snapshot, skip NPC ngoài player radius (sleep).

## Sleep optimization

NPC xa player (>20 tile, không trong same region) → skip AI tick, chỉ chạy schedule. Khi player vào region → wake up.

## Determinism

- NPC list sorted by id.
- Action library sorted by id.
- Tie-break theo alphabetical id.
- PRNG seed cố định → wander, schedule variation giống nhau mỗi replay.
