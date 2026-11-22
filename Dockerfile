# MORROW proposal API image. Published to ghcr.io/lavishsphere/morrow.
# Pterodactyl egg: pterodactyl/morrow-api.json
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

COPY --chmod=755 start-api.sh /app/start-api.sh

# Inject GEMINI_API_KEY and DATABASE_URL at runtime. Never bake secrets into the image.
# Do not set MORROW_HOSTED_ON. Pterodactyl sets SERVER_PORT to the allocation.
CMD ["/app/start-api.sh"]
