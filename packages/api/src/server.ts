import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { applyCors, sendJson } from "./http.ts";
import {
  handleGetBarrier,
  handleHealth,
  handleListBarriers,
} from "./routes/barriers.ts";
import {
  handleGenerateProposal,
  handleGetProposal,
} from "./routes/proposals.ts";
import { handleTransitVehicles } from "./routes/transit.ts";

export type MorrowApiServer = ReturnType<typeof createServer>;

function matchPath(
  pathname: string,
  pattern: RegExp,
): RegExpMatchArray | null {
  return pathname.match(pattern);
}

async function dispatch(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  applyCors(res, req.headers.origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `http://${host}`);
  const { pathname } = url;

  if (req.method === "GET" && pathname === "/api/health") {
    handleHealth(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/barriers") {
    await handleListBarriers(req, res, url);
    return;
  }

  const barrierMatch = matchPath(pathname, /^\/api\/barriers\/([^/]+)$/);
  if (req.method === "GET" && barrierMatch) {
    await handleGetBarrier(req, res, decodeURIComponent(barrierMatch[1] ?? ""));
    return;
  }

  if (req.method === "GET" && pathname === "/api/transit/vehicles") {
    await handleTransitVehicles(req, res, url);
    return;
  }

  if (req.method === "POST" && pathname === "/api/proposals/generate") {
    await handleGenerateProposal(req, res);
    return;
  }

  const proposalMatch = matchPath(pathname, /^\/api\/proposals\/([^/]+)$/);
  if (req.method === "GET" && proposalMatch) {
    await handleGetProposal(req, res, decodeURIComponent(proposalMatch[1] ?? ""));
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

export function createApiServer(): MorrowApiServer {
  return createServer((req, res) => {
    void dispatch(req, res).catch((err: unknown) => {
      console.error("[@morrow/api]", err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Internal server error" });
      } else {
        res.end();
      }
    });
  });
}

/**
 * Pterodactyl sets SERVER_PORT to the allocation and starts the process with
 * cwd /home/container. That port wins over PORT. When it is set and HOST is
 * not, bind 0.0.0.0 so nginx on the VPS can reach the container.
 */
export function resolveListenAddress(
  env: Record<string, string | undefined> = process.env,
): { port: number; host: string } {
  const serverPort = env.SERVER_PORT?.trim() ?? "";
  const raw = serverPort || env.PORT?.trim() || "8787";
  const parsed = Number(raw);
  const port =
    Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : 8787;
  const host = env.HOST?.trim() || (serverPort ? "0.0.0.0" : "127.0.0.1");
  return { port, host };
}

export function listenApiServer(
  port?: number,
  host?: string,
): Promise<{ server: MorrowApiServer; port: number; host: string }> {
  const resolved = resolveListenAddress();
  const bindPort = port ?? resolved.port;
  const bindHost = host ?? resolved.host;
  const server = createApiServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(bindPort, bindHost, () => {
      resolve({ server, port: bindPort, host: bindHost });
    });
  });
}
