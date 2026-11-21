import { useState } from "react";
import demoDataset from "../../../data/wellesley/demo-dataset.json";
import { DEMO_PROBLEMS, type DemoProblem } from "./demoProblems";
import { nextProblemId } from "./cycle";

const seeded = demoDataset.barriers[0];
const [seedLongitude, seedLatitude] = seeded.coordinates;

const PROBLEMS: readonly DemoProblem[] = DEMO_PROBLEMS.map((problem) =>
  problem.id === seeded.id
    ? { ...problem, longitude: seedLongitude, latitude: seedLatitude }
    : problem,
);

/** Demo detection the satellite town reads until a live model is connected. */
export function useAiDetection() {
  const [selectedId, setSelectedId] = useState<string | null>(PROBLEMS[0]?.id ?? null);

  return {
    phase: "ready" as const,
    problems: PROBLEMS,
    selectedId,
    seeNextProblem() {
      setSelectedId((current) => nextProblemId(PROBLEMS, current));
    },
    selectProblem(id: string) {
      setSelectedId(id);
    },
    sourceLabel: "Illustrative AI-detected problems",
  };
}
