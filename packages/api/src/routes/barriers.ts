import type { IncomingMessage, ServerResponse } from "node:http";
import {
  barriersInBbox,
  getBarrier,
  listBarriers,
} from "../data/dataset.ts";
import {
  barriersInBboxFromTiger,
  databaseUrlConfigured,
  getBarrierFromTiger,
  tigerLastError,
  tigerLive,
} from "../data/tiger.ts";
import { parseBbox, sendJson } from "../http.ts";

const BARRIER_LIMIT = 100;

export async function handleListBarriers(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  void req;
  const bboxRaw = url.searchParams.get("bbox");
  if (!bboxRaw) {
    sendJson(res, 400, {
      error: "Missing bbox query. Expected bbox=west,south,east,north (WGS84).",
    });
    return;
  }
  const bbox = parseBbox(bboxRaw);
  if (!bbox) {
    sendJson(res, 400, {
      error: "Invalid bbox. Expected west,south,east,north within WGS84 bounds.",
    });
    return;
  }

  const fromTiger = await barriersInBboxFromTiger(
    bbox.west,
    bbox.south,
    bbox.east,
    bbox.north,
    BARRIER_LIMIT,
  );

  if (fromTiger) {
    sendJson(res, 200, {
      source: "tiger-data",
      tigerData: true,
      barriers: fromTiger,
      count: fromTiger.length,
      note: "Live PostGIS bbox query (Tiger Data).",
    });
    return;
  }

  const barriers = barriersInBbox(
    bbox.west,
    bbox.south,
    bbox.east,
    bbox.north,
  ).slice(0, BARRIER_LIMIT);

  const note = databaseUrlConfigured()
    ? `Bundled Wellesley demo dataset (Tiger Data unavailable${tigerLastError() ? `: ${tigerLastError()}` : ""}).`
    : "Bundled Wellesley demo dataset (in-memory bbox filter). Set DATABASE_URL for Tiger Data/PostGIS.";

  sendJson(res, 200, {
    source: "bundled",
    tigerData: false,
    barriers,
    count: barriers.length,
    note,
  });
}

export async function handleGetBarrier(
  _req: IncomingMessage,
  res: ServerResponse,
  id: string,
): Promise<void> {
  const fromTiger = await getBarrierFromTiger(id);
  if (fromTiger) {
    sendJson(res, 200, fromTiger);
    return;
  }

  const barrier = getBarrier(id);
  if (!barrier) {
    sendJson(res, 404, { error: `Barrier not found: ${id}` });
    return;
  }
  sendJson(res, 200, barrier);
}

export function handleHealth(
  _req: IncomingMessage,
  res: ServerResponse,
): void {
  sendJson(res, 200, {
    ok: true,
    service: "@morrow/api",
    barriers: listBarriers().length,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    tigerData: tigerLive(),
    databaseUrlConfigured: databaseUrlConfigured(),
    tigerError: tigerLive() ? null : tigerLastError(),
    mastra: false,
    vultr: false,
  });
}
