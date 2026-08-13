# 13 — MVP Acceptance Criteria

## Quy tắc

Mỗi tiêu chí phải **pass rõ ràng** (yes/no, có output kiểm chứng). Không "gần xong".

Mỗi mục kèm **cách kiểm tra** để QA/PM dùng verify.

---

## A. World

### A1. Có tile map render được

- [ ] Map 1 region load từ Tiled JSON.
- [ ] Render tile ground + terrain + objects layer.
- [ ] Player sprite hiển thị.
- [ ] Camera follow player khi di chuyển.

**Verify**: Mở game → thấy map + player + đi quanh được.

### A2. NPC di chuyển

- [ ] ≥ 20 NPC spawn trong map.
- [ ] NPC di chuyển theo schedule (đổi location theo hour).
- [ ] NPC có animation walk/idle.
- [ ] Off-screen NPC vẫn update (verify bằng pause + check state).

**Verify**: Để game chạy 1 game-day, NPC di chuyển giữa các location.

### A3. Thời gian chảy

- [ ] Day/Hour/Minute hiển thị HUD.
- [ ] World tick advance time mỗi giây thật = 1 game-phút (configurable).
- [ ] Time pause khi menu mở hoặc combat.
- [ ] Day change qua midnight có event.

**Verify**: Đợi 5 phút thật = 5 game-hour đã qua.

### A4. Encounter

- [ ] Đi vào region có encounter zone → roll random combat trigger.
- [ ] Safe zone (town) không trigger encounter.
- [ ] Encounter rate tunable trong data.

**Verify**: Đi 100 bước trong forest → ≥ 1 combat trigger.

---

## B. Combat

### B1. Combat bắt đầu và kết thúc đúng

- [ ] Combat khởi tạo với player + enemy squad (1-6 enemy).
- [ ] Turn order sort theo initiative.
- [ ] Victory/defeat/escape có state cuối rõ ràng.
- [ ] World time pause trong combat.

**Verify**: Trigger combat → chơi đến cuối → world resume.

### B2. Action library hoạt động

- [ ] Attack deal damage đúng formula.
- [ ] Skill consume MP, có cooldown.
- [ ] Defend tăng defense trong turn.
- [ ] Escape có success rate, fail → free attack.
- [ ] Item dùng trong combat (heal potion test).

**Verify**: Mỗi action test thành công, log hiện đúng damage/result.

### B3. Element system

- [ ] 6 element implement.
- [ ] Matchup table đúng (fire weak to water).
- [ ] Weakness 1.5x, strength 0.5x damage.
- [ ] Resist từ trait áp dụng.

**Verify**: 2 enemy: 1 weak với fire, 1 resist → fire skill damage khác nhau đúng multiplier.

### B4. Status effect

- [ ] ≥ 5 status implement (stun, poison, burn, freeze, silence).
- [ ] Apply có chance, duration đếm turn.
- [ ] Status modify stat đúng.
- [ ] Dispell (item hoặc skill) gỡ status.

**Verify**: Apply BURN 3 turn → quái mất HP/turn, sau 3 turn hết.

### B5. Position + Cover

- [ ] Battle grid 6 slot 2 row mỗi bên.
- [ ] Front row có cover bonus vs back row attack.
- [ ] Swap skill đổi vị trí.
- [ ] Flanking khi cả front+back bị target.

**Verify**: Player ở back row, enemy melee front row → attack miss hoặc giảm damage.

### B6. Combo

- [ ] Combo counter hiển thị.
- [ ] Combo tăng damage theo tier.
- [ ] Combo break khi stun hoặc bị turn xen vào.
- [ ] Combo 4 unlock finisher option.

**Verify**: Attack liên tiếp 5 turn → combo counter tăng, damage bonus áp dụng.

---

## C. Social Graph

### C1. Relation hiển thị

- [ ] Relationship Graph render node + edge.
- [ ] Color theo relation type (8 type).
- [ ] Zoom, pan, search NPC.
- [ ] Click node hiện detail panel.

**Verify**: Vào graph → thấy ≥ 20 NPC node, edge giữa NPC quen nhau.

### C2. Affinity change

- [ ] Tặng item → affinity +.
- [ ] Đánh NPC → affinity -.
- [ ] Cứu NPC → affinity +30.
- [ ] Affinity hiển thị trong tooltip.

**Verify**: Tặng quà 5 lần → affinity + đúng theo bảng delta.

### C3. Hatred Propagation

- [ ] Giết NPC A → witness trong 8 tile nhận hatred.
- [ ] Relation cascade (family x3, friend x2).
- [ ] Faction cascade (faction member).
- [ ] Grudge persist trong save.

**Verify**: Giết trưởng lão làng → kiểm tra grudge list, ≥ 5 NPC có hatred.

### C4. Grudge decay

- [ ] Grudge strength giảm mỗi game-day.
- [ ] Strength ≤ 0 → grudge xóa.
- [ ] Trait COMPASSIONATE decay nhanh gấp đôi.

**Verify**: Đợi 30 game-day sau khi gây thù → grudge biến mất.

### C5. Ally reinforcement

- [ ] NPC ally (affinity ≥ 70) join combat khi player bị attack.
- [ ] Max 2 ally MVP.
- [ ] Ally AI auto-play.
- [ ] Loot share cho ally nếu affinity > 90.

**Verify**: Setup ally affinity 80 → trigger combat → ally join.

---

## D. Event Queue

### D1. Event log hiển thị

- [ ] Panel event log trong HUD.
- [ ] ≥ 10 event type show đúng.
- [ ] Filter theo category.
- [ ] Last 5 line preview + scroll full history.

**Verify**: Làm action → log hiện dòng mô tả.

### D2. Delayed event

- [ ] Kill NPC leader → schedule REVENGE_ATTACK 3 game-day.
- [ ] Đúng ngày → NPC enemy xuất hiện truy sát.
- [ ] Cancel nếu NPC chết trư�c ngày đến hạn.

**Verify**: Kill leader → skip 3 day → NPC attack player.

### D3. Pub/sub working

- [ ] Listener register cho event type hoạt động.
- [ ] UI update real-time khi event fire.
- [ ] Engine module decouple (không gọi trực tiếp).

**Verify**: Code review — module A emit event, module B consume mà không import A.

---

## E. Persistence

### E1. Save thành công

- [ ] Save slot 1, 2, 3 hoạt động.
- [ ] Auto save mỗi 30 game-second.
- [ ] Save trigger: area change, pre/post combat, manual.
- [ ] File size < 5MB cho 1 hour gameplay.

**Verify**: Save → check IndexedDB → file có data đầy đủ.

### E2. Load khôi phục đúng

- [ ] Load slot → world state giống hệt lúc save.
- [ ] NPC position, HP, MP, states đúng.
- [ ] Relations graph đúng.
- [ ] Delayed event queue đúng.
- [ ] PRNG state resume → tiếp tục deterministic.

**Verify**: Save tại state X → load → verify từng field khớp.

### E3. Save slot đầy đủ

- [ ] 3 manual slot + 1 auto slot.
- [ ] Overwrite slot có confirm dialog.
- [ ] Delete slot có confirm dialog.
- [ ] Slot metadata hiển thị (location, day, level).

**Verify**: UI test save/load flow.

### E4. Version migration

- [ ] Save v1 load được trên game v2 (có migration).
- [ ] Migration chain chạy đúng thứ tự.
- [ ] Migration fail → fallback an toàn, không crash.

**Verify**: Tạo save v1, patch game lên v2, load thành công.

### E5. Quota handling

- [ ] Quota check trước save.
- [ ] Quota gần đầy → thông báo user.
- [ ] Suggest xóa slot cũ.

**Verify**: Fill save data đến gần quota → save tiếp → thông báo hiện.

---

## F. Performance

### F1. Frame rate

- [ ] 60 FPS với 100 NPC trong viewport.
- [ ] Không drop frame khi AI tick.
- [ ] Combat animation smooth.

**Verify**: Chrome DevTools Performance tab → 60fps stable.

### F2. Memory

- [ ] Heap < 200MB sau 1 hour gameplay.
- [ ] Không memory leak (heap không tăng đều).
- [ ] PixiJS texture cache bounded.

**Verify**: DevTools Memory → snapshot trước/sau 30min → diff hợp lý.

### F3. Save size

- [ ] Save file < 5MB cho 100 NPC, 200 relations, 50 events.
- [ ] Compressed nếu > 1MB.

**Verify**: Save thật + measure file size.

---

## G. UX

### G1. Control

- [ ] WASD/Arrow di chuyển.
- [ ] Click-to-move.
- [ ] ESC mở menu.
- [ ] Pause/Speed control.

**Verify**: Test từng control.

### G2. Visual feedback

- [ ] Hover NPC → tooltip.
- [ ] Action button feedback instant.
- [ ] Damage number popup.
- [ ] Status icon hover → giải thích.

**Verify**: UX walkthrough.

### G3. Accessibility

- [ ] Color-blind palette option.
- [ ] Text size scale.
- [ ] Auto-pause khi unfocus.
- [ ] Keyboard fully usable.

**Verify**: Option test pass.

---

## Pass criteria

MVP release khi:
- Tất cả A1-A4 pass.
- Tất cả B1-B6 pass.
- Tất cả C1-C5 pass.
- Tất cả D1-D3 pass.
- Tất cả E1-E5 pass.
- F1-F3 đạt target (có thể optimize sau).
- G1-G3 đạt minimum.

Bug P0/P1 = 0. Bug P2 có thể defer.
