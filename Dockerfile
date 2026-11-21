FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install --global bun@1.4.5
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
RUN NITRO_PRESET=node-server npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
COPY --from=build --chown=node:node /app/.output ./.output
USER node
CMD ["node", ".output/server/index.mjs"]
