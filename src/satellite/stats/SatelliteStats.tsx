import { BeforeAfterCard } from "./BeforeAfterCard";

/** Illustrative modeled trips for the demo pins. Not live measurements. */
const ILLUSTRATIVE_TRIPS: Record<
  string,
  { beforeMeters: number | null; afterMeters: number | null }
> = {
  "wellesley-barrier-campus-path-01": { beforeMeters: null, afterMeters: 180 },
  "illustrative-quad-north": { beforeMeters: 640, afterMeters: 180 },
  "illustrative-east-crossing": { beforeMeters: 890, afterMeters: 240 },
  "illustrative-south-curb": { beforeMeters: 410, afterMeters: 150 },
};

/**
 * Before/after figures for the selected satellite pin.
 * The cost line stays on the local Gemini stub.
 */
export function SatelliteStats({ problemId }: { problemId: string | null }) {
  const trip = problemId ? ILLUSTRATIVE_TRIPS[problemId] : undefined;
  return (
    <BeforeAfterCard
      beforeMeters={trip?.beforeMeters ?? null}
      afterMeters={trip?.afterMeters ?? null}
    />
  );
}
