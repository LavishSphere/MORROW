import type { IncomingMessage, ServerResponse } from "node:http";
import {
  barriersInBbox,
  getBarrier,
  listBarriers,
} from "../data/dataset.ts";
import { parseBbox, sendJson } from "../http.ts";

const BARRIER_LIMIT = 100;

export function handleListBarriers(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): void {
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

  const barriers = barriersInBbox(
    bbox.west,
    bbox.south,
    bbox.east,
    bbox.north,
  ).slice(0, BARRIER_LIMIT);

  sendJson(res, 200, {
    source: "bundled",
    tigerData: false,
    barriers,
    count: barriers.length,
    note:
      "Bundled Wellesley demo dataset (in-memory bbox filter). Tiger Data/PostGIS not wired yet.",
  });
}

export function handleGetBarrier(
  _req: IncomingMessage,
  res: ServerResponse,
  id: string,
): void {
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
    tigerData: false,
    mastra: false,
    vultr: process.env.MORROW_HOSTED_ON?.trim().toLowerCase() === "vultr",
  });
}
