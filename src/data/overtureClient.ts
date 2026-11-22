import type { OvertureFootprint } from "./buildingHeight.ts";
import { fetchOvertureBuildings as readHere, type NeighborhoodBox } from "./overtureBuildings.ts";
import type { PierDeck } from "./overturePiers.ts";

/** The pier reader on the page, loaded only when the worker cannot answer. */
const readPiersHere = (box: NeighborhoodBox) => import("./overtureBase.ts").then((base) => base.fetchOverturePiers(box));

/**
 * Overture footprints for a box, read in a worker so parquet decoding
 * never blocks a frame. Where workers are missing or fail, it reads on
 * the page as before. Same contract: an empty list means "could not read".
 */

type Reply = { id: number; footprints?: OvertureFootprint[]; piers?: PierDeck[] };

let worker: Worker | null = null;
let broken = false;
let nextId = 0;
const waiting = new Map<number, (reply: Reply | null) => void>();

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
    done?.(event.data);
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

function ask(box: NeighborhoodBox, kind?: "piers"): Promise<Reply | null> | null {
  const reader = start();
  if (!reader) return null;
  const id = (nextId += 1);
  return new Promise<Reply | null>((resolve) => {
    waiting.set(id, resolve);
    reader.postMessage({ id, box, kind });
  });
}

export function fetchOvertureBuildings(box: NeighborhoodBox): Promise<OvertureFootprint[]> {
  const reply = ask(box);
  if (!reply) return readHere(box);
  return reply.then((answer) => answer?.footprints ?? readHere(box));
}

/** Pier decks for a box, read in the worker like the footprints. */
export function fetchOverturePiers(box: NeighborhoodBox): Promise<PierDeck[]> {
  const reply = ask(box, "piers");
  if (!reply) return readPiersHere(box);
  return reply.then((answer) => answer?.piers ?? readPiersHere(box));
}
