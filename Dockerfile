# MORROW proposal API image (GHCR). Does not claim Vultr hosting.
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

# GEMINI_API_KEY is injected at runtime; never bake secrets into the image.
CMD ["npm", "run", "start", "-w", "@morrow/api"]