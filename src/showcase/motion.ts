/**
 * Whether the camera is moving, shared by everything that can do less
 * while it does: the shadow map waits, the resolution drops, labels hide,
 * and new map tiles wait to join the city. No React and no three.js, so
 * tests can import it.
 */

/** After this long without a camera change or input, the view counts as resting. */
export const SETTLE_MS = 300;
/**
 * A city rebuild stalls a frame, so it waits this long after the last
 * camera move or input: a pause between two scrolls is not a rest.
 */
export const REBUILD_QUIET_MS = 3000;

export class MotionTracker {
  private last = new Float64Array(16);
  private seen = false;
  /** True when the camera changed in the latest frame. */
  moving = false;
  /** When the camera last changed, or the resident last scrolled, dragged, or pressed a key. */
  lastActiveAt = Number.NEGATIVE_INFINITY;

  /** Feed the camera's world matrix once a frame; true when it changed. */
  update(elements: ArrayLike<number>, now: number): boolean {
    let changed = !this.seen;
    for (let i = 0; i < 16; i += 1) {
      const value = elements[i] ?? 0;
      if (Math.abs(value - this.last[i]!) > 1e-5) changed = true;
      this.last[i] = value;
    }
    this.seen = true;
    this.moving = changed;
    if (changed) this.lastActiveAt = Math.max(this.lastActiveAt, now);
    return changed;
  }

  /** A wheel, drag, or key that moves the camera, even before the camera reacts. */
  input(now: number) {
    this.lastActiveAt = Math.max(this.lastActiveAt, now);
  }

  /** Milliseconds since the camera last moved or was touched. */
  idleFor(now: number): number {
    return now - this.lastActiveAt;
  }

  /** True while moving, and for `settleMs` afterwards. */
  busy(now: number, settleMs = SETTLE_MS): boolean {
    return this.moving || this.idleFor(now) < settleMs;
  }
}

/** The one camera in the city. Times are `Date.now()` milliseconds. */
export const cameraMotion = new MotionTracker();

/**
 * True while a grown city builds in slices. More tiles wait until it is
 * done, so a new batch never throws away a rebuild halfway through.
 */
export const cityBuild = { slicing: false };

/**
 * Run `run` once the camera has rested for `quietMs`, checking every
 * `everyMs`. Returns a cancel function. For work that would stall a
 * frame, like rebuilding the city, so it never lands mid-gesture.
 */
export function whenCameraRests(
  run: () => void,
  quietMs: number,
  everyMs = 500,
  motion: MotionTracker = cameraMotion,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const check = () => {
    timer = null;
    if (motion.idleFor(Date.now()) >= quietMs) run();
    else timer = setTimeout(check, everyMs);
  };
  check();
  return () => {
    if (timer !== null) clearTimeout(timer);
  };
}
