/**
 * Reads Overture building footprints off the main thread. Decoding a
 * parquet row group takes hundreds of milliseconds, which on the page
 * would stall the city mid-zoom.
 */
import { fetchOvertureBuildings, type NeighborhoodBox } from "./overtureBuildings.ts";

type Request = { id: number; box: NeighborhoodBox };

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, box } = event.data;
  fetchOvertureBuildings(box)
    .then((footprints) => self.postMessage({ id, footprints }))
    .catch(() => self.postMessage({ id, footprints: [] }));
};
