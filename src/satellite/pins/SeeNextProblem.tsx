import { nextProblemId } from "./cycle";
import type { AiDetectedProblem } from "./types";
import "./pins.css";

export type SeeNextProblemProps = {
  problems: readonly AiDetectedProblem[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  /** Id of the pin group this control cycles. */
  controlsId?: string;
  className?: string;
};

/** Cycles AI-detected problem pins, one step at a time, then wraps. */
export function SeeNextProblem({
  problems,
  selectedId = null,
  onSelect,
  controlsId,
  className,
}: SeeNextProblemProps) {
  const classes = ["satellite-pins__next", className].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={classes}
      disabled={problems.length === 0}
      aria-controls={controlsId}
      onClick={(event) => {
        event.stopPropagation();
        const nextId = nextProblemId(problems, selectedId);
        if (nextId != null) onSelect(nextId);
      }}
    >
      See next problem
    </button>
  );
}
