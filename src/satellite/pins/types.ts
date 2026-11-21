/**
 * One AI-detected access problem on the satellite frame.
 * These pins are model findings, not verified municipal defects.
 */
export type AiDetectedProblem = {
  id: string;
  /** 0 at the left edge of the frame, 1 at the right. */
  x: number;
  /** 0 at the top of the frame, 1 at the bottom. */
  y: number;
  /** Short name. Shown in white when this pin is selected. */
  label: string;
};
