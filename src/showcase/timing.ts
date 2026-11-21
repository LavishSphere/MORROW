/** Shared by the camera descent and the opening stub until brand owns that overlay. */
export const INTRO = {
  hold: 1.55,
  fade: 0.85,
  move: 3.7,
} as const;

export const INTRO_REDUCED = {
  hold: 1.1,
  fade: 0.28,
} as const;

/** Camera holds the underside view, then starts moving as the title fades. */
export const INTRO_MOVE_START = INTRO.hold + INTRO.fade * 0.2;
