# Production image for vuedo.
# Vite is a devDependency and never loaded at runtime: the production branch of
# src/server.ts loads the pre-built dist/entry-server.js bundle directly.
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# src/server.ts is executed with tsx; NODE_ENV=production selects the dist path.
COPY src ./src
ENV NODE_ENV=production
EXPOSE 8080
CMD ["pnpm", "start"]
