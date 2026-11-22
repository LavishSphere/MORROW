import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "../http.ts";
import {
  createTransitProxy,
  TransitFeedError,
  type TransitProxy,
} from "../transit/proxy.ts";

let proxy: TransitProxy = createTransitProxy();

/** Tests swap in a proxy with a fake fetch and env. */
export function setTransitProxy(next: TransitProxy): void {
  proxy = next;
}

/** GET /api/transit/vehicles?feed=<id> → LiveVehicle[] */
export async function handleTransitVehicles(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  void req;
  const feedId = url.searchParams.get("feed")?.trim() ?? "";
  if (!feedId) {
    sendJson(res, 400, { error: "Missing feed query. Expected feed=<id>." });
    return;
  }
  try {
    const vehicles = await proxy.vehicles(feedId);
    sendJson(res, 200, vehicles);
  } catch (err) {
    if (err instanceof TransitFeedError) {
      sendJson(res, err.status, { error: err.message });
      return;
    }
    console.error("[@morrow/api] transit", err);
    sendJson(res, 502, { error: "Transit feed unavailable" });
  }
}
