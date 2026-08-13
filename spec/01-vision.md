# 01 — Tầm nhìn & MVP

## Product Vision

**Tu Tiên Bát Hoang** là game web RPG 2D theo phong cách tu tiên sandbox, lấy cảm hứng từ *Quỷ Cốc Bát Hoang (Tale of Immortal)*. Trọng tâm không nằm ở cốt truyện tuyến tính hay combat, mà ở **Mạng lưới Nhân - Quả (Social Graph Simulation)**.

Mỗi NPC có quan hệ, cảm xúc, tính cách, mục tiêu, ký ức. Mọi hành động người chơi tạo chuỗi phản ứng lan truyền trong xã hội NPC, sinh câu chuyện tự phát (Emergent Storytelling).

## Phân phối

- **Offline First**: chơi không cần Internet.
- Toàn bộ game logic chạy trong trình duyệt.
- Dữ liệu lưu cục bộ trên máy người chơi.
- Có thể đóng gói thành desktop app bằng Electron sau này.

## MVP Scope

**Chứng minh 4 hệ thống cốt lõi:**

1. Thế giới 2D có NPC (tile-based, có thời gian, NPC di chuyển)
2. Combat turn-based JRPG (position, cover, combo, element, status)
3. Social Graph + Hatred Propagation (witness, faction, decay)
4. Save/Load cục bộ (IndexedDB, 3 slot + auto, version migration)

**Ngoài MVP:**

- Multiplayer, backend, cloud save
- Marketplace, PvP
- Quest hệ thống phức tạp
- Tu luyện / đột phá / tông môn (defer sang v0.4+)

## Gameplay Loop

```
Khám phá
  → Gặp NPC
  → Tương tác (dialog / trade / attack)
  → Quan hệ thay đ�i
  → Xung đột / Hợp tác
  → Combat turn-based
  → Post-combat choice (Kill/Spare/Rob)
  → Hatred Propagation lan truyền
  → World State thay đổi
  → Auto-save + manual save
  → Tiếp tục khám phá
```

## Nguyên tắc thiết kế

| Nguyên tắc | Áp dụng |
|---|---|
| Determinism | Cùng seed → cùng output. Replay/share seed. |
| Engine ≠ UI | Game Engine không phụ thuộc React. Test được độc lập. |
| Emergent > Scripted | Câu chuyện phát sinh từ tương tác hệ thống, không hard-code. |
| Offline-capable | Mọi tính năng chạy local. Không phụ thuộc network. |
| Data-driven | Balance dữ liệu qua JSON, không hardcode trong code. |
