import type { OvertureFootprint } from "./buildingHeight.ts";
import { fetchOvertureBuildings as readHere, type NeighborhoodBox } from "./overtureBuildings.ts";

/**
 * Overture footprints for a box, read in a worker so parquet decoding
 * never blocks a frame. Where workers are missing or fail, it reads on
 * the page as before. Same contract: an empty list means "could not read".
 */

type Reply = { id: number; footprints: OvertureFootprint[] };

let worker: Worker | null = null;
let broken = false;
let nextId = 0;
const waiting = new Map<number, (footprints: OvertureFootprint[] | null) => void>();

function start(): Worker | null {
  if (worker || broken) return worker;
  if (typeof Worker === "undefined") return null;
  try {
    worker = new Worker(new URL("./overtureWorker.ts", import.meta.url), { type: "module" });
  } catch {
    broken = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<Reply>) => {
    const done = waiting.get(event.data.id);
    waiting.delete(event.data.id);
    done?.(event.data.footprints);
  };
  worker.onerror = () => {
    // The worker could not load: answer everyone waiting by reading here.
    broken = true;
    worker?.terminate();
    worker = null;
    for (const done of waiting.values()) done(null);
    waiting.clear();
  };
  return worker;
}

export function fetchOvertureBuildings(box: NeighborhoodBox): Promise<OvertureFootprint[]> {
  const reader = start();
  if (!reader) return readHere(box);
  const id = (nextId += 1);
  return new Promise<OvertureFootprint[] | null>((resolve) => {
    waiting.set(id, resolve);
    reader.postMessage({ id, box });
  }).then((footprints) => footprints ?? readHere(box));
}
