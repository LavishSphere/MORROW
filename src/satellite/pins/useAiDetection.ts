import { useState } from "react";
import demoDataset from "../../../data/wellesley/demo-dataset.json";
import { nextProblemId } from "./cycle";

type DetectedProblem = {
  id: string;
  longitude: number;
  latitude: number;
  title: string;
};

const seeded = demoDataset.barriers[0];
const [seedLongitude, seedLatitude] = seeded.coordinates;

/**
 * Illustrative findings spread across the Wellesley frame.
 * The first pin is the checked-in barrier. The rest are demo stops so
 * See next problem can move the camera. They are not live model output.
 */
const ILLUSTRATIVE_PROBLEMS: readonly DetectedProblem[] = [
  {
    id: seeded.id,
    longitude: seedLongitude,
    latitude: seedLatitude,
    title: "Missing curb ramp",
  },
  {
    id: "illustrative-quad-north",
    longitude: -71.3051,
    latitude: 42.2954,
    title: "Broken sidewalk",
  },
  {
    id: "illustrative-east-crossing",
    longitude: -71.3012,
    latitude: 42.2947,
    title: "Blocked crossing",
  },
  {
    id: "illustrative-south-curb",
    longitude: -71.3038,
    latitude: 42.2918,
    title: "Steep curb",
  },
];

/** Demo detection the satellite town reads until a live model is connected. */
export function useAiDetection() {
  const [selectedId, setSelectedId] = useState<string | null>(
    ILLUSTRATIVE_PROBLEMS[0]?.id ?? null,
  );

  return {
    phase: "ready" as const,
    problems: ILLUSTRATIVE_PROBLEMS,
    selectedId,
    seeNextProblem() {
      setSelectedId((current) => nextProblemId(ILLUSTRATIVE_PROBLEMS, current));
    },
    selectProblem(id: string) {
      setSelectedId(id);
    },
    sourceLabel: "Illustrative AI-detected problems",
  };
}
