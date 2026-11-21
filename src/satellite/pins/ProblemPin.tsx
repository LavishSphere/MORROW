import type { AiDetectedProblem } from "./types";
import "./pins.css";

export type ProblemPinProps = {
  problem: AiDetectedProblem;
  selected: boolean;
  onSelect: (id: string) => void;
  buttonRef?: (node: HTMLButtonElement | null) => void;
};

/** One AI-detected problem, drawn as a logo-blue diamond on the frame. */
export function ProblemPin({ problem, selected, onSelect, buttonRef }: ProblemPinProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={selected ? "satellite-pin is-selected" : "satellite-pin"}
      style={{ left: `${problem.x * 100}%`, top: `${problem.y * 100}%` }}
      aria-pressed={selected}
      aria-label={`AI-detected problem: ${problem.label}`}
      data-problem-id={problem.id}
      data-selected={selected ? "true" : "false"}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(problem.id);
      }}
    >
      <span className="satellite-pin__ring" aria-hidden="true" />
      <span className="satellite-pin__diamond" aria-hidden="true" />
      {selected ? (
        <span className="satellite-pin__caption">
          <span className="satellite-pin__kicker">AI-detected</span>
          {problem.label}
        </span>
      ) : null}
    </button>
  );
}
