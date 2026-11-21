import { useId, useState } from "react";
import { MorrowMark } from "./MorrowMark";
import { ProblemPins } from "./ProblemPins";
import { SeeNextProblem } from "./SeeNextProblem";
import type { AiDetectedProblem } from "./types";
import "./pins.css";

export type SatellitePinsProps = {
  problems: readonly AiDetectedProblem[];
  /**
   * Selected problem. Omit this prop and the overlay keeps the selection
   * itself, starting at the first problem. Pass `null` to select none.
   */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
};

function shownId(
  problems: readonly AiDetectedProblem[],
  selectedId: string | null,
  controlled: boolean,
): string | null {
  if (selectedId != null && problems.some((problem) => problem.id === selectedId)) {
    return selectedId;
  }
  if (controlled) return null;
  return problems[0]?.id ?? null;
}

/**
 * Pins for AI-detected problems, the MORROW mark, and the control that
 * cycles those pins. Drop it over a satellite frame (`position: relative`).
 * `x` and `y` are fractions of that frame. Text is white. Logo blue is
 * only the mark and the pins.
 */
export function SatellitePins({
  problems,
  selectedId,
  onSelect,
  className,
}: SatellitePinsProps) {
  const controlled = selectedId !== undefined;
  const [uncontrolledId, setUncontrolledId] = useState<string | null>(null);
  const requested = controlled ? (selectedId ?? null) : uncontrolledId;
  const activeId = shownId(problems, requested, controlled);
  const groupId = useId();

  const select = (id: string) => {
    if (!controlled) setUncontrolledId(id);
    onSelect?.(id);
  };

  const current = problems.find((problem) => problem.id === activeId) ?? null;
  const index = current == null ? -1 : problems.indexOf(current);
  const live =
    current != null
      ? `AI-detected problem ${index + 1} of ${problems.length}: ${current.label}`
      : problems.length === 0
        ? "No AI-detected problems"
        : `${problems.length} AI-detected problems`;

  const classes = ["satellite-pins", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <header className="satellite-pins__bar">
        <MorrowMark />
        <SeeNextProblem
          problems={problems}
          selectedId={activeId}
          onSelect={select}
          controlsId={groupId}
        />
      </header>
      <p className="satellite-pins__live" aria-live="polite">
        {live}
      </p>
      <ProblemPins id={groupId} problems={problems} selectedId={activeId} onSelect={select} />
    </div>
  );
}
