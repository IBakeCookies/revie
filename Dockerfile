# syntax=docker/dockerfile:1

# The build output is not standalone — build/server/chunks/*.js import svelte and
# @sveltejs/kit as bare specifiers and both are devDependencies — so the runtime stage
# ships build/ plus the FULL node_modules out of the builder. `npm ci --omit=dev`
# there breaks the image rather than shrinking it.

FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY .npmrc package.json package-lock.json ./
COPY svelte.config.js vite.config.ts tsconfig.json ./
COPY src ./src
COPY static ./static
COPY messages ./messages
COPY project.inlang ./project.inlang

# Sources are on disk before npm ci because `prepare` fires paraglide's compiler, which
# reads messages/ and project.inlang/. The vite plugin compiles them again at build;
# both spell the same strategy, the repo's third sanctioned duplication.
RUN npm ci && npm run build

FROM node:22-bookworm-slim

WORKDIR /app

# HOST and PORT mirror adapter-node's own defaults. DASHBOARD_CONFIG is a container path
# convention rather than a secret — the systemd unit bakes it for the same reason.
# ORIGIN, DASHBOARD_ADMIN_TOKEN and every DASHBOARD_SECRET_<NAME> stay UNSET: they name
# this deployment, so they pass through -e / --env-file at run time.
ENV HOST=0.0.0.0 \
    PORT=3000 \
    DASHBOARD_CONFIG=/config/config.json

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node

EXPOSE 3000

# bookworm-slim ships neither curl nor wget, so the check is node's own fetch; r.ok is
# 200-299 only, which maps /api/health's 503 (config unreadable) to exit 1. Exec form,
# so no shell quoting sits between the check and the JS.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT ["node", "build"]
