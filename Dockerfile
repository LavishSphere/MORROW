# MORROW proposal API image (GHCR → optional Vultr host; see docs/deploy-api-vultr.md).
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages ./packages
COPY shared ./shared
COPY data ./data

RUN npm ci

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
EXPOSE 8787

# Inject GEMINI_API_KEY, DATABASE_URL, and MORROW_HOSTED_ON=vultr at runtime.
# Never bake secrets into the image.
CMD ["npm", "run", "start", "-w", "@morrow/api"]
