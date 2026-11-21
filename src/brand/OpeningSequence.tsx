import { useEffect, useRef, useState } from "react";
import { LogoMark } from "./LogoMark";
import { BRAND_BLACK, TAGLINE, TEXT_WHITE, WORDMARK } from "./palette";

/**
 * How long the scene camera should take to descend after the lockup.
 * Zero means skip that move and cut to the settled view.
 */
export const OPENING_DESCEND_MS = 3600;
export const OPENING_REDUCED_DESCEND_MS = 0;

const STROKE_IN_MS = 1500;
const WORD_DELAY_MS = 1560;
const WORD_IN_MS = 640;
const LINE_DELAY_MS = 2140;
const LINE_IN_MS = 640;
const HOLD_AFTER_LINE_MS = 520;
const MOTION_DESCEND_AT_MS = LINE_DELAY_MS + LINE_IN_MS + HOLD_AFTER_LINE_MS;
const MOTION_FADE_MS = 720;

const REDUCED_HOLD_MS = 1400;
const REDUCED_FADE_MS = 180;

export type DescentSignal = {
  /** Leave the opening and move the camera down onto the island. */
  mode: "descend";
  /**
   * Suggested length of that camera move.
   * `0` skips the long fly-in.
   */
  durationMs: number;
  reducedMotion: boolean;
};

export type OpeningSequenceProps = {
  /**
   * When true, the mark, wordmark, and tagline appear in place and the
   * descent signal uses a zero duration. When omitted, follows the
   * `prefers-reduced-motion` media query.
   */
  reducedMotion?: boolean;
  /** Fired once, after the lockup has been shown, to start the camera descent. */
  onDescend?: (signal: DescentSignal) => void;
  /** Fired once the overlay has finished fading and can unmount. */
  onComplete?: () => void;
  className?: string;
};

type Phase = "play" | "exit" | "done";

function systemReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const OPENING_CSS = `
.morrow-opening {
  position: absolute;
  inset: 0;
  z-index: 8;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  margin: 0;
  padding: 8vh 6vw 10vh;
  background: ${BRAND_BLACK};
  color: ${TEXT_WHITE};
  overflow: hidden;
  pointer-events: auto;
}
.morrow-opening--exit {
  pointer-events: none;
  animation: morrow-opening-fade ${MOTION_FADE_MS}ms ease forwards;
}
.morrow-opening--reduced.morrow-opening--exit {
  animation-duration: ${REDUCED_FADE_MS}ms;
}
.morrow-mark {
  display: block;
  width: min(36vmin, 220px);
  height: auto;
  overflow: visible;
}
.morrow-word,
.morrow-line {
  margin: 0;
  color: ${TEXT_WHITE};
  font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-weight: 600;
}
.morrow-word {
  margin-top: 1.35rem;
  font-size: clamp(2.25rem, 6.4vw, 4.6rem);
  line-height: 1;
  letter-spacing: 0.36em;
  padding-left: 0.36em;
}
.morrow-line {
  margin-top: 0.95rem;
  font-size: clamp(1rem, 2.3vw, 1.4rem);
  font-weight: 400;
  letter-spacing: 0.06em;
  line-height: 1.3;
}
.morrow-opening--motion .morrow-mark {
  transform-origin: center;
  animation: morrow-mark-in ${STROKE_IN_MS}ms cubic-bezier(0.16, 1, 0.3, 1) 80ms both;
}
.morrow-opening--motion .morrow-word {
  animation: morrow-rise ${WORD_IN_MS}ms cubic-bezier(0.16, 1, 0.3, 1) ${WORD_DELAY_MS}ms both;
}
.morrow-opening--motion .morrow-line {
  animation: morrow-rise ${LINE_IN_MS}ms cubic-bezier(0.16, 1, 0.3, 1) ${LINE_DELAY_MS}ms both;
}
@keyframes morrow-mark-in {
  0% {
    opacity: 0;
    transform: translate3d(0, -46vh, 0) scale(0.42);
  }
  38% { opacity: 1; }
  100% {
    opacity: 1;
    transform: none;
  }
}
@keyframes morrow-rise {
  from {
    opacity: 0;
    transform: translate3d(0, 0.7rem, 0);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes morrow-opening-fade {
  from { opacity: 1; }
  to { opacity: 0; }
}
`;

/**
 * Full-frame opening over the showcase canvas.
 * Mount it in a positioned frame (the canvas wrapper). It shows the mark,
 * MORROW, and "Make tomorrow possible", then signals the camera descent.
 * With `reducedMotion`, that fly-in is skipped.
 */
export function OpeningSequence({
  reducedMotion,
  onDescend,
  onComplete,
  className,
}: OpeningSequenceProps) {
  const reduce = reducedMotion ?? systemReducedMotion();
  const [phase, setPhase] = useState<Phase>("play");
  const descendRef = useRef(onDescend);
  const completeRef = useRef(onComplete);
  descendRef.current = onDescend;
  completeRef.current = onComplete;

  useEffect(() => {
    let cancelled = false;
    setPhase("play");
    const descendAt = reduce ? REDUCED_HOLD_MS : MOTION_DESCEND_AT_MS;
    const fadeMs = reduce ? REDUCED_FADE_MS : MOTION_FADE_MS;
    const signal: DescentSignal = {
      mode: "descend",
      durationMs: reduce ? OPENING_REDUCED_DESCEND_MS : OPENING_DESCEND_MS,
      reducedMotion: reduce,
    };

    const descendTimer = setTimeout(() => {
      if (cancelled) return;
      setPhase("exit");
      descendRef.current?.(signal);
    }, descendAt);

    const doneTimer = setTimeout(() => {
      if (cancelled) return;
      setPhase("done");
      completeRef.current?.();
    }, descendAt + fadeMs);

    return () => {
      cancelled = true;
      clearTimeout(descendTimer);
      clearTimeout(doneTimer);
    };
  }, [reduce]);

  if (phase === "done") return null;

  const rootClass = [
    "morrow-opening",
    reduce ? "morrow-opening--reduced" : "morrow-opening--motion",
    phase === "exit" ? "morrow-opening--exit" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClass}
      role="region"
      aria-label={`${WORDMARK}. ${TAGLINE}`}
      aria-hidden={phase === "exit" ? true : undefined}
      data-reduced-motion={reduce ? "true" : "false"}
    >
      <style>{OPENING_CSS}</style>
      <LogoMark decorative />
      <h1 className="morrow-word">{WORDMARK}</h1>
      <p className="morrow-line">{TAGLINE}</p>
    </div>
  );
}
