import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import markUrl from "../showcase/assets/morrow-logo.png";
import "./city-loader.css";

const LEAVE_MS = 480;

/**
 * The cover plays once per page load. If the city remounts later (for
 * example after the 2D list), it does not flash the cover again.
 */
let coverFinished = false;

export type CityLoaderProps = {
  /** True until the city has painted and the cover can leave. */
  active: boolean;
  reducedMotion?: boolean;
};

/**
 * Full-screen cover while the city first loads: the MORROW logo on black,
 * breathing gently. It fades out once `active` is false.
 */
export function CityLoader({ active, reducedMotion = false }: CityLoaderProps) {
  const [present, setPresent] = useState(() => !coverFinished);

  useEffect(() => {
    const root = document.getElementById("root");
    if (!root || !active || !present) return;
    root.setAttribute("inert", "");
    return () => {
      root.removeAttribute("inert");
    };
  }, [active, present]);

  useEffect(() => {
    if (active || !present) return;
    coverFinished = true;
    const delay = reducedMotion ? 0 : LEAVE_MS;
    const timer = window.setTimeout(() => setPresent(false), delay);
    return () => window.clearTimeout(timer);
  }, [active, present, reducedMotion]);

  if (!present) return null;

  const className = [
    "city-loader",
    reducedMotion ? "is-reduced" : "",
    active ? "" : "is-leaving",
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div className={className} role="status" aria-live="polite" aria-busy={active}>
      <img
        className="city-loader__mark"
        src={markUrl}
        alt=""
        width={2400}
        height={2400}
      />
      <span className="sr-only">Loading the city</span>
    </div>,
    document.body,
  );
}
