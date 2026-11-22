/**
 * Reads Overture building footprints and pier decks off the main thread.
 * Decoding a parquet row group takes hundreds of milliseconds, which on the
 * page would stall the city mid-zoom.
 */
import { fetchOvertureBuildings, type NeighborhoodBox } from "./overtureBuildings.ts";
import { fetchOverturePiers } from "./overtureBase.ts";

type Request = { id: number; box: NeighborhoodBox; kind?: "piers" };

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, box, kind } = event.data;
  if (kind === "piers") {
    fetchOverturePiers(box)
      .then((piers) => self.postMessage({ id, piers }))
      .catch(() => self.postMessage({ id, piers: [] }));
    return;
  }
  fetchOvertureBuildings(box)
    .then((footprints) => self.postMessage({ id, footprints }))
    .catch(() => self.postMessage({ id, footprints: [] }));
};
