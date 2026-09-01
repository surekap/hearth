FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS builder
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Poppler renders selected report pages into rebuildable encrypted clinical
# image assets. Plaintext only exists in a short-lived /tmp directory.
RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY package.json package-lock.json ./
COPY next.config.ts tsconfig.json postcss.config.mjs drizzle.config.ts ./
COPY public ./public
COPY scripts ./scripts
COPY src ./src
COPY docker ./docker

RUN chmod +x /app/docker/start.sh

EXPOSE 3000

CMD ["./docker/start.sh"]
