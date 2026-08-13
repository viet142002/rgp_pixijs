/**
 * Tutorial system — guided onboarding for new players.
 *
 * Each step has:
 * - id (unique)
 * - trigger (when to fire)
 * - title (Vietnamese)
 * - body (Vietnamese instruction)
 * - requires (state predicate)
 *
 * Steps progress in order. Current step stored on engine.state.tutorial.
 * Once all steps complete, tutorial.disabled = true.
 */

import type { EngineState } from "../types.js";

export type TutorialTrigger =
  | "on_start"
  | "on_first_move"
  | "on_first_combat"
  | "on_first_item"
  | "on_first_quest"
  | "on_first_dialogue"
  | "on_first_faction"
  | "on_first_meditation"
  | "on_first_breakthrough"
  | "on_first_cultivation_real"
  | "on_realm_linh_khi"
  | "on_realm_truc_co"
  | "on_realm_kim_dan";

export interface TutorialStep {
  id: string;
  trigger: TutorialTrigger;
  title: string;
  body: string;
  /** Optional hint command e.g. "press E to meditate" */
  hint?: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    trigger: "on_start",
    title: "Chào mừng đến Bát Hoang!",
    body: "Di chuyển bằng phím mũi tên. Gặp NPC, chiến đấu, tu luyện để thăng cấp.",
    hint: "WASD hoặc ↑↓←→ để di chuyển",
  },
  {
    id: "first_combat",
    trigger: "on_first_combat",
    title: "Giao chiến đầu tiên",
    body: "Đánh vào NPC để bắt đầu combat 3v3. Back row có cover giảm sát thương.",
    hint: "Nhấn A để tấn công",
  },
  {
    id: "first_dialogue",
    trigger: "on_first_dialogue",
    title: "Đối thoại",
    body: "Nói chuyện với NPC để nhận quest và tăng danh tiếng phe phái.",
    hint: "Nhấn T để nói chuyện",
  },
  {
    id: "first_quest",
    trigger: "on_first_quest",
    title: "Nhiệm vụ đầu tiên",
    body: "Mở Quest Log (Q) để xem mục tiêu. Hoàn thành để nhận thưởng.",
  },
  {
    id: "first_meditation",
    trigger: "on_first_meditation",
    title: "Thiền định",
    body: "Nhấn M để bắt đầu tu luyện. Mỗi phút thiền tăng kinh nghiệm cảnh giới.",
    hint: "Nhấn M",
  },
  {
    id: "first_breakthrough",
    trigger: "on_first_breakthrough",
    title: "Đột phá cảnh giới",
    body: "Khi đủ EXP, thử đột phá. Tỉ lệ thành công tùy căn cơ và tâm trạng.",
  },
  {
    id: "realm_linh_khi",
    trigger: "on_realm_linh_khi",
    title: "Linh Khí Cảnh",
    body: "Bạn đã bước vào Linh Khí Cảnh. Hấp thụ linh khí thiên địa nhanh hơn.",
  },
  {
    id: "first_faction",
    trigger: "on_first_faction",
    title: "Gia nhập phe phái",
    body: "Danh tiếng đủ cao (≥50) có thể gia nhập phe. Phe cho quest riêng + buff.",
  },
  {
    id: "first_item",
    trigger: "on_first_item",
    title: "Vật phẩm",
    body: "Nhận đan dược, trang bị. Mở Inventory (I) để trang bị.",
  },
];

export interface TutorialState {
  /** Index of next step to fire (0-based). */
  currentIdx: number;
  /** IDs of steps already shown. */
  completed: string[];
  /** True when all steps fired. */
  done: boolean;
}

/**
 * Find next pending step that matches trigger AND has its prerequisite state.
 */
export function getNextStep(
  state: EngineState,
  trigger: TutorialTrigger
): TutorialStep | null {
  const tut = state.tutorial;
  if (tut.done) return null;
  for (let i = tut.currentIdx; i < TUTORIAL_STEPS.length; i++) {
    const step = TUTORIAL_STEPS[i]!;
    if (step.trigger !== trigger) continue;
    if (tut.completed.includes(step.id)) continue;
    return step;
  }
  return null;
}

/**
 * Mark step as completed; advance cursor to next.
 */
export function completeStep(state: EngineState, stepId: string): void {
  const tut = state.tutorial;
  if (!tut.completed.includes(stepId)) {
    tut.completed.push(stepId);
  }
  // Advance cursor to first not-completed step
  while (
    tut.currentIdx < TUTORIAL_STEPS.length &&
    tut.completed.includes(TUTORIAL_STEPS[tut.currentIdx]!.id)
  ) {
    tut.currentIdx++;
  }
  if (tut.currentIdx >= TUTORIAL_STEPS.length) {
    tut.done = true;
  }
}

/**
 * Pending steps count (for UI badge).
 */
export function pendingCount(state: EngineState): number {
  return TUTORIAL_STEPS.length - state.tutorial.completed.length;
}