/**
 * How sharp the canvas renders, from how fast frames come. No React and
 * no three.js, so tests can import it.
 */

/** Frames slower than this on average (about 50 fps) count as struggling. */
export const SLOW_FRAME_MS = 20;

/**
 * Average frame time over the last `size` frames, and whether it is too
 * slow. Once slow it stays slow: the resolution it lowers is what made
 * frames fast again, so fast frames afterwards prove nothing.
 */
export class FramePace {
  private times: number[] = [];
  slow = false;
  private size: number;
  private limitMs: number;
  constructor(size = 40, limitMs = SLOW_FRAME_MS) {
    this.size = size;
    this.limitMs = limitMs;
  }

  add(ms: number): boolean {
    // A frame after a tab switch or a rebuild says nothing about the GPU.
    if (!(ms > 0) || ms > 250) return this.slow;
    this.times.push(ms);
    if (this.times.length > this.size) this.times.shift();
    if (this.times.length === this.size) {
      const mean = this.times.reduce((sum, t) => sum + t, 0) / this.size;
      if (mean > this.limitMs) this.slow = true;
    }
    return this.slow;
  }
}

/**
 * Pixel ratio for this frame: `sharp` at rest, 1 while moving when moving
 * frames are slow, and 1 at rest too when even resting frames are slow.
 * Changing it resizes the canvas, which costs a frame, so a fast machine
 * never switches.
 */
export function pickDpr(options: { sharp: number; busy: boolean; slowMoving: boolean; slowResting: boolean }): number {
  if (options.slowResting) return 1;
  return options.busy && options.slowMoving ? 1 : options.sharp;
}
