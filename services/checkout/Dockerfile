FROM oven/bun:1.4.2 AS manifests
WORKDIR /repo
COPY . .

FROM manifests AS build
RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
  --mount=type=secret,id=npm_token,required=true \
  printf '@myavenceo:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=%s\n' "$(cat /run/secrets/npm_token)" > "$HOME/.npmrc" \
  && bun install --frozen-lockfile --filter '!./' --filter @avenos/checkout \
  && rm -f "$HOME/.npmrc"
# The pricing + legal SSOT: aven-api syncs its Polar products from the brand's
# plan data (@myavenceo/aven-ceo/pricing) and the id app's layout renders the
# Impressum from @myavenceo/aven-ceo. That package is now a PUBLISHED
# dependency resolved into node_modules by the install above, not a workspace
# source directory, so there is nothing to COPY for it — the .npmrc below tells
# bun which registry to fetch it from.
RUN bun --cwd services/checkout build
# The two checkout entrypoints compose runs inside this image. They are
# bundled for the same reason the server is: a bundle carries its imports, so
# nothing has to resolve a workspace symlink at runtime and no lib source needs
# to be dragged into the runtime stage. That is the rule the brand already
# follows from the other side — shared ACROSS repos becomes a published package,
# shared WITHIN the repo gets bundled here. Nothing resolves source at runtime.
RUN cd services/checkout && bun build \
  scripts/migrate.ts \
  scripts/seed-billing.ts \
  scripts/email-worker.ts \
  scripts/platform-event-worker.ts \
  --target=bun --outdir=build/scripts

FROM manifests AS production-dependencies
RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
  --mount=type=secret,id=npm_token,required=true \
  printf '@myavenceo:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=%s\n' "$(cat /run/secrets/npm_token)" > "$HOME/.npmrc" \
  && bun install --frozen-lockfile --production --filter '!./' --filter @avenos/checkout \
  && rm -f "$HOME/.npmrc"

FROM oven/bun:1.4.2
ARG OS_SECURITY_REFRESH=local
RUN test -n "$OS_SECURITY_REFRESH" && apt-get update && apt-get upgrade --yes --no-install-recommends && rm -rf /var/lib/apt/lists/*
WORKDIR /repo/services/checkout
ENV NODE_ENV=production
COPY --from=production-dependencies /repo/node_modules /repo/node_modules
COPY --from=production-dependencies /repo/services/checkout/node_modules ./node_modules
COPY --from=build /repo/services/checkout/build ./build
COPY --from=build /repo/services/checkout/src ./src
COPY --from=build /repo/services/checkout/migrations ./migrations
COPY --from=build /repo/services/checkout/package.json ./package.json
# The brand SSOT is no longer a workspace directory to copy: @myavenceo/aven-ceo
# arrives through node_modules above, which the production-dependencies stage
# already installs (root node_modules carries bun's store, the service's carries
# the link into it). scripts/ resolve it from there like any other dependency.
EXPOSE 3000
USER bun
HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=30 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "build/index.js"]
