import { useEffect, useState } from "react";
import logoUrl from "../assets/morrow-logo.png";
import { INTRO, INTRO_REDUCED } from "../timing";
import type { OpeningSequenceProps } from "../types";

type Phase = "hold" | "fade" | "done";

/** Temporary stand-in for src/brand/OpeningSequence. */
export function OpeningSequence({ reducedMotion = false }: OpeningSequenceProps) {
  const [phase, setPhase] = useState<Phase>("hold");
  const timing = reducedMotion ? INTRO_REDUCED : INTRO;

  useEffect(() => {
    setPhase("hold");
    let cancelled = false;
    const fadeTimer = window.setTimeout(() => {
      if (!cancelled) setPhase("fade");
    }, timing.hold * 1000);
    const doneTimer = window.setTimeout(() => {
      if (!cancelled) setPhase("done");
    }, (timing.hold + timing.fade) * 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [timing.hold, timing.fade]);

  const className = [
    "opening",
    phase === "fade" ? "is-fading" : "",
    phase === "done" ? "is-done" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      style={{ transitionDuration: `${timing.fade * 1000}ms` }}
      aria-hidden={phase === "done"}
    >
      <div className="opening-card">
        <img src={logoUrl} alt="" width={88} height={88} />
        <h1>MORROW</h1>
        <p>Make tomorrow possible</p>
      </div>
    </div>
  );
}
