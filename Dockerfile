# Build the TanStack Start application for Nitro's standalone Node server.
FROM node:22-bookworm-slim AS build
WORKDIR /app

# These are public Supabase settings used by Vite at build time.
# Never pass service-role keys or Yandex Pay credentials as build arguments.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
    VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY} \
    VITE_SUPABASE_PROJECT_ID=${VITE_SUPABASE_PROJECT_ID} \
    SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_ID}

RUN npm install --global bun@1.4.5
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
RUN test -n "$VITE_SUPABASE_URL" \
    && test -n "$VITE_SUPABASE_PUBLISHABLE_KEY" \
    && NITRO_PRESET=node-server npm run build \
    && test -f .output/server/index.mjs

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 NITRO_HOST=0.0.0.0 NITRO_PORT=8080
EXPOSE 8080
COPY --from=build --chown=node:node /app/.output ./.output
USER node
CMD ["node", ".output/server/index.mjs"]
