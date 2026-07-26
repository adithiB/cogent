# syntax=docker/dockerfile:1
#
# Built from the repo root (Render's Docker builds default to the repo root
# as build context) because this is an npm-workspaces monorepo — `npm ci`
# resolves against the root lockfile, which lists every workspace. Only
# apps/api's package.json is needed to satisfy that (it depends on neither
# apps/web nor packages/*), so only that one is copied alongside root config
# — no source for the other workspaces is copied or built.
FROM node:20-alpine AS builder
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci
COPY apps/api ./apps/api
RUN npm run build --workspace=api

# Runtime stage: no dependency-pruning/regeneration step (unlike Atlas's Nx
# build), so there is no risk of the "generated lockfile is internally
# inconsistent" bug Atlas hit on Render (atlas_live_deploy memory) — this
# copies the exact node_modules `npm ci` already validated in the builder
# stage, dev dependencies included. Simplicity over image size for a demo
# deploy (CLAUDE.md priority order); pruning dev deps is a real optimization
# but not one this phase's runway buys back.
FROM node:20-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=builder /workspace/apps/api/dist ./apps/api/dist
EXPOSE 3000
# nest build (no explicit tsconfig `rootDir`) emits dist/src/main.js, not
# dist/main.js — found live by actually running this image, not assumed
# from `start:prod`'s `node dist/main` (which is only correct when run
# from inside apps/api, where `dist/main.js` doesn't exist either — that
# script is untested against this project's actual tsconfig and would have
# been a second surprise at boot).
CMD ["node", "apps/api/dist/src/main.js"]
