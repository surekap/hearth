FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

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
