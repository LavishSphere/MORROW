import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import markUrl from "../showcase/assets/morrow-logo.png";
import "./city-loader.css";

const LEAVE_MS = 480;

export type CityLoaderProps = {
  /** True until the city has painted and the cover can leave. */
  active: boolean;
  reducedMotion?: boolean;
};

/**
 * Full-screen cover while the city loads.
 * Black field, white type, and the blue mark. It leaves once `active` is false.
 */
export function CityLoader({ active, reducedMotion = false }: CityLoaderProps) {
  const [present, setPresent] = useState(true);

  useEffect(() => {
    const root = document.getElementById("root");
    if (!root || !active) return;
    root.setAttribute("inert", "");
    return () => {
      root.removeAttribute("inert");
    };
  }, [active]);

  useEffect(() => {
    if (active) return;
    const delay = reducedMotion ? 0 : LEAVE_MS;
    const timer = window.setTimeout(() => setPresent(false), delay);
    return () => window.clearTimeout(timer);
  }, [active, reducedMotion]);

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
      <div className="city-loader__lockup">
        <div className="city-loader__mark">
          <img src={markUrl} alt="" width={2400} height={2400} />
          <span className="city-loader__scan" />
        </div>
        <p className="city-loader__word">MORROW</p>
        <p className="city-loader__status">Loading the city</p>
        <div className="city-loader__bars" aria-hidden="true">
          <span className="city-loader__bar" />
          <span className="city-loader__bar" />
          <span className="city-loader__bar" />
        </div>
      </div>
    </div>,
    document.body,
  );
}
