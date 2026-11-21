import { BeforeAfterCard } from "./BeforeAfterCard";
import { demoProblem } from "../pins/demoProblems";

/**
 * Before/after figures for the selected satellite pin.
 * The cost line stays on the local Gemini stub.
 */
export function SatelliteStats({ problemId }: { problemId: string | null }) {
  const trip = demoProblem(problemId);
  return (
    <BeforeAfterCard
      beforeMeters={trip?.beforeMeters ?? null}
      afterMeters={trip?.afterMeters ?? null}
    />
  );
}
