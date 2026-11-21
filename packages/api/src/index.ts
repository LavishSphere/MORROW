import { geminiConfigured, geminiModel } from "./draft/gemini.ts";
import {
  databaseUrlConfigured,
  initTiger,
  tigerLive,
} from "./data/tiger.ts";
import { listenApiServer } from "./server.ts";

export { createApiServer, listenApiServer } from "./server.ts";
export { buildTemplateDraft } from "./draft/template.ts";
export { resolveGenerateInput } from "./facts.ts";
export { clearProposals, getProposal, saveProposal } from "./data/proposals.ts";
export {
  closeTiger,
  databaseUrlConfigured,
  initTiger,
  seedBarriersFromBundled,
  tigerLive,
} from "./data/tiger.ts";

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("packages/api/src/index.ts") ||
    process.argv[1].endsWith("packages/api/src/index.js"));

if (isMain) {
  if (databaseUrlConfigured()) {
    const tiger = await initTiger();
    console.log(
      `[@morrow/api] Tiger Data: ${tiger.ok ? "connected (PostGIS)" : `fallback (${tiger.reason})`}`,
    );
  } else {
    console.log(
      "[@morrow/api] Tiger Data: off (DATABASE_URL not set — bundled dataset)",
    );
  }

  const { port, host } = await listenApiServer();
  console.log(`[@morrow/api] listening on http://${host}:${port}`);
  console.log(
    `[@morrow/api] Gemini: ${geminiConfigured() ? `configured (${geminiModel()})` : "template-only (no GEMINI_API_KEY)"}`,
  );
  const hosted = process.env.MORROW_HOSTED_ON?.trim() || "local";
  console.log(
    `[@morrow/api] host=${hosted} tigerLive=${tigerLive()} | Vultr runbook: docs/deploy-api-vultr.md`,
  );
}
