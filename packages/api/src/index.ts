import { geminiConfigured, geminiModel } from "./draft/gemini.ts";
import { listenApiServer } from "./server.ts";
import { mastraConfigured } from "./workflow/proposal.ts";

export { createApiServer, listenApiServer } from "./server.ts";
export { buildTemplateDraft } from "./draft/template.ts";
export { resolveGenerateInput } from "./facts.ts";
export { clearProposals, getProposal, saveProposal } from "./data/proposals.ts";
export {
  mastraConfigured,
  proposalWorkflow,
  runProposalWorkflow,
} from "./workflow/proposal.ts";

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("packages/api/src/index.ts") ||
    process.argv[1].endsWith("packages/api/src/index.js"));

if (isMain) {
  const { port, host } = await listenApiServer();
  console.log(`[@morrow/api] listening on http://${host}:${port}`);
  console.log(
    `[@morrow/api] Gemini: ${geminiConfigured() ? `configured (${geminiModel()})` : "template-only (no GEMINI_API_KEY)"}`,
  );
  console.log(
    `[@morrow/api] Mastra: ${mastraConfigured() ? "proposal workflow wired" : "off"}`,
  );
  console.log(
    "[@morrow/api] Tiger Data / Vultr: not claimed in this build (see WHA-9).",
  );
}
