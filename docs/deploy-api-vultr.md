# Host the proposal API on Vultr (WHA-9)

GitHub Pages serves only the static Vite app. **Propose** needs a hosted Node API (`packages/api`, root `Dockerfile` → GHCR). This runbook deploys that API on **Vultr** and points Pages at it with `VITE_API_BASE`.

Do **not** invent or commit secret values. Use the placeholder shapes below and inject real credentials only in Vultr / GitHub settings.

## Status / blocker

| Item | Status |
| --- | --- |
| Dockerfile + GHCR workflow | On `main` (`.github/workflows/api-image.yml`) |
| Vultr account / API token / instance | **Blocked** until an operator provides them |
| Live public generate URL | **Not live** until the steps below succeed |
| Pages → API | Set repository variable `VITE_API_BASE` after the API has a public HTTPS origin |

## Prerequisites

1. GHCR image builds on `main` (`ghcr.io/<owner>/morrow` or `ghcr.io/<owner>/MORROW` — match the repository name casing GitHub uses).
2. A Vultr account with permission to create a Cloud Compute instance (or Container).
3. Values you will set **only** in the host environment (never in git):
   - `GEMINI_API_KEY` (optional — template path works without it)
   - `DATABASE_URL` (optional — bundled Wellesley dataset if unset; Tiger Data PR documents PostGIS)
   - `MORROW_CORS_ORIGIN` = the exact GitHub Pages origin (for example `https://<user>.github.io`)

## 1. Confirm the API image

After `Dockerfile` (and API sources) land on `main`, open **Actions → API image** and confirm a push to GHCR. Pull locally if you need to inspect:

```bash
# Replace OWNER/REPO with the GitHub repository path (case as published by GHCR).
docker pull ghcr.io/OWNER/REPO:latest
docker run --rm -p 8787:8787 \
  -e HOST=0.0.0.0 \
  -e PORT=8787 \
  -e MORROW_HOSTED_ON=vultr \
  ghcr.io/OWNER/REPO:latest
curl -s "http://127.0.0.1:8787/api/health"
```

Template generate smoke (no Gemini key required):

```bash
curl -s -X POST "http://127.0.0.1:8787/api/proposals/generate" \
  -H "content-type: application/json" \
  -d '{"scenarioId":"wellesley-demo-01","barrierId":"wellesley-barrier-campus-path-01","interventionId":"wellesley-intervention-ramp-01"}'
```

## 2. Create a Vultr instance

Recommended minimal path for the hackathon:

1. Create an Ubuntu 24.04 Cloud Compute instance (1 vCPU is enough for the demo).
2. Open firewall / Vultr Firewall for **TCP 80** and **TCP 443** (and optionally **22** for SSH).
3. Install Docker on the instance ([Docker Engine install](https://docs.docker.com/engine/install/ubuntu/)).
4. Authenticate to GHCR with a GitHub PAT that can `read:packages` (store the PAT only on the instance or in a secrets manager — never in this repo).
5. Run the container (inject secrets at runtime), then put HTTPS in front of port 8787 (Caddy, nginx, or Vultr Load Balancer + cert). Judges should hit `https://api.example.com`, not raw `:8787`, when possible:

```bash
docker run -d --name morrow-api --restart unless-stopped \
  -p 8787:8787 \
  -e HOST=0.0.0.0 \
  -e PORT=8787 \
  -e MORROW_HOSTED_ON=vultr \
  -e MORROW_CORS_ORIGIN="https://YOUR_PAGES_ORIGIN" \
  -e GEMINI_API_KEY="YOUR_KEY_OR_LEAVE_EMPTY" \
  -e DATABASE_URL="YOUR_TIGER_URL_OR_LEAVE_EMPTY" \
  ghcr.io/OWNER/REPO:latest
```

### Alternative: Vultr Container Registry / VKE

If the team already uses Vultr Kubernetes or a managed container product, deploy the same GHCR image there. The container contract is unchanged: listen on `HOST=0.0.0.0`, `PORT=8787`, inject env at runtime.

## 3. Point GitHub Pages at the API

The Vite client reads `import.meta.env.VITE_API_BASE` (see `src/data/api.ts`). Empty means same-origin / local Vite proxy — which **does not exist** on GitHub Pages.

1. After the API is reachable at a public HTTPS origin, set the repository **Actions variable** (Settings → Secrets and variables → Actions → Variables):

   - Name: `VITE_API_BASE`
   - Value: `https://api.example.com` (no trailing slash) — use your real origin

2. The Deploy workflow passes that variable into the Pages build. Re-run **Deploy** on `main` (or push a no-op) so `dist/` embeds the base.
3. Open the Pages demo → Propose → confirm the UI is not stuck on the bundled “unavailable” path when the API is up (`GET /api/health` from the browser network panel).

Shape-only template (no secrets): see also optional root `.env.example` once that file is on `main`.

| Variable | Where | Secret? |
| --- | --- | --- |
| `VITE_API_BASE` | GitHub Actions **variable** (public URL) | No — it is baked into the static JS |
| `GEMINI_API_KEY` | Vultr container env | Yes |
| `DATABASE_URL` | Vultr container env | Yes |
| `MORROW_CORS_ORIGIN` | Vultr container env | No (Pages origin) |
| `MORROW_HOSTED_ON=vultr` | Vultr container env | No — sets `/api/health` → `vultr: true` |

## 4. Honesty checks

- Do **not** claim Vultr in the README or prize text until `GET /api/health` from the public API returns `"vultr": true` and Pages Propose hits that host.
- If Gemini or Tiger Data are unset, the demo must still export a template proposal and load bundled barriers — that is intentional.
- GitHub Pages remains the reliable static host even if Vultr is down; the UI labels generate / API **unavailable**.

## 5. Rollback

1. Clear or unset the `VITE_API_BASE` variable and re-run Deploy so Pages falls back to bundled/unavailable behavior.
2. Stop the Vultr container (`docker stop morrow-api`).

## Operator checklist

- [ ] GHCR image `latest` (or SHA tag) exists for this repository
- [ ] Vultr instance running the container with `MORROW_HOSTED_ON=vultr`
- [ ] Public HTTPS health check returns `ok: true`
- [ ] `MORROW_CORS_ORIGIN` matches the Pages origin
- [ ] GitHub variable `VITE_API_BASE` set to that HTTPS origin
- [ ] Deploy workflow rebuilt Pages
- [ ] Judge path: Explore → Improve → Compare → Propose → Export PDF works against the live API (template path acceptable without `GEMINI_API_KEY`)
