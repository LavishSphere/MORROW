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

export function listenApiServer(
  port = Number(process.env.PORT ?? 8787),
  host = process.env.HOST ?? "127.0.0.1",
): Promise<{ server: MorrowApiServer; port: number; host: string }> {
  const server = createApiServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      resolve({ server, port, host });
    });
  });
}
