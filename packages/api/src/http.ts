import type { IncomingMessage, ServerResponse } from "node:http";

export type JsonBody = Record<string, unknown> | unknown[] | string | number | boolean | null;

export function sendJson(
  res: ServerResponse,
  status: number,
  body: JsonBody,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

export function sendText(
  res: ServerResponse,
  status: number,
  body: string,
  contentType = "text/plain; charset=utf-8",
): void {
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
}

export async function readJsonBody(
  req: IncomingMessage,
  maxBytes = 16_384,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw Object.assign(new Error("Request body too large"), { status: 413 });
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) return null;
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw Object.assign(new Error("Invalid JSON body"), { status: 400 });
  }
}

export function applyCors(res: ServerResponse, originHeader: string | undefined): void {
  const allowed = process.env.MORROW_CORS_ORIGIN?.trim();
  if (!allowed) {
    res.setHeader("access-control-allow-origin", "*");
  } else if (originHeader && originHeader === allowed) {
    res.setHeader("access-control-allow-origin", allowed);
    res.setHeader("vary", "Origin");
  } else if (allowed === "*") {
    res.setHeader("access-control-allow-origin", "*");
  }
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader(
    "access-control-allow-headers",
    "content-type, accept",
  );
}

export function parseBbox(
  raw: string | null,
): { west: number; south: number; east: number; north: number } | null {
  if (!raw) return null;
  const parts = raw.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return null;
  }
  const [west, south, east, north] = parts as [number, number, number, number];
  if (west > east || south > north) return null;
  if (west < -180 || east > 180 || south < -90 || north > 90) return null;
  return { west, south, east, north };
}
