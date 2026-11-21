import { useRef } from "react";
import { nextProblemId } from "./cycle";
import { ProblemPin } from "./ProblemPin";
import type { AiDetectedProblem } from "./types";
import "./pins.css";

export type ProblemPinsProps = {
  problems: readonly AiDetectedProblem[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  id?: string;
};

const ARROW_KEYS = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"] as const;

type ArrowKey = (typeof ARROW_KEYS)[number];

function isArrowKey(key: string): key is ArrowKey {
  return (ARROW_KEYS as readonly string[]).includes(key);
}

/** Logo-blue pins for every AI-detected problem in the frame. */
export function ProblemPins({
  problems,
  selectedId = null,
  onSelect,
  id,
}: ProblemPinsProps) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  const cycleFromKey = (key: ArrowKey) => {
    const backward = key === "ArrowLeft" || key === "ArrowUp";
    const ordered = backward ? [...problems].reverse() : problems;
    const nextId = nextProblemId(ordered, selectedId);
    if (nextId == null) return;
    onSelect(nextId);
    buttons.current.get(nextId)?.focus();
  };

  return (
    <div
      id={id}
      className="satellite-pins__layer"
      role="group"
      aria-label="AI-detected problems"
      onKeyDown={(event) => {
        if (!isArrowKey(event.key)) return;
        event.preventDefault();
        cycleFromKey(event.key);
      }}
    >
      {problems.map((problem) => (
        <ProblemPin
          key={problem.id}
          problem={problem}
          selected={problem.id === selectedId}
          onSelect={onSelect}
          buttonRef={(node) => {
            if (node) buttons.current.set(problem.id, node);
            else buttons.current.delete(problem.id);
          }}
        />
      ))}
    </div>
  );
}
