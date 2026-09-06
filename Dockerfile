# syntax=docker/dockerfile:1

# Manifests are copied before any source, so editing a file does not invalidate the
# install layer. The npm cache is a BuildKit cache mount: it survives builds but never
# reaches the image.
FROM node:24-alpine AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

FROM manifests AS build
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .

RUN npm run build --workspace apps/web

# A second, independent install: only what the server needs at runtime. Scoping it to the
# server workspace keeps the web app's dependencies, Leaflet included, out of the image.
FROM manifests AS runtime-dependencies
RUN --mount=type=cache,target=/root/.npm \
	npm ci --omit=dev --workspace apps/server --include-workspace-root

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# The image runs `node`, never `npm`, and npm's own vendored dependencies were four of the
# six high-severity advisories a scan of this image reports — none of them on a path this
# process can reach, and all of them invisible to `npm audit`, which reads the project's
# tree rather than the image. Removing what is never executed removes them from the artefact.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=runtime-dependencies /app/node_modules ./node_modules
COPY --from=runtime-dependencies /app/package.json ./package.json
COPY apps/server ./apps/server
COPY packages/shared ./packages/shared
COPY --from=build /app/apps/web/dist ./apps/web/dist

USER node
EXPOSE 3000

# Uses the same endpoint a load balancer would, through Node's own fetch, so the image
# needs no curl or wget.
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 CMD \
	node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/server/src/index.ts"]
