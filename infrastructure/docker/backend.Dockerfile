# QuickBite backend image — one artifact, two process roles (DEPLOYMENT_SPEC §6–9):
#   API:    node dist/main.js    (default)
#   Worker: node dist/worker.js
#
# Build from the repository root:
#   docker build -f infrastructure/docker/backend.Dockerfile -t quickbite-backend .

ARG NODE_VERSION=22.12.0

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages ./packages
COPY backend ./backend
RUN pnpm install --frozen-lockfile --filter @quickbite/backend...
RUN pnpm --filter @quickbite/backend... build
RUN pnpm deploy --filter @quickbite/backend --prod --legacy /out

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/backend/dist ./dist
COPY --from=build /repo/backend/prisma ./prisma
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
