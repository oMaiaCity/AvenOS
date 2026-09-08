FROM oven/bun:1.4.2 AS build
WORKDIR /repo
COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
  --mount=type=secret,id=npm_token,required=true \
  printf '@myavenceo:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=%s\n' "$(cat /run/secrets/npm_token)" > "$HOME/.npmrc" \
  && bun install --frozen-lockfile --filter '!./' --filter @avenos/identity \
  && rm -f "$HOME/.npmrc"
RUN bun --cwd services/identity build && cd services/identity && bun build scripts/migrate.ts --target=bun --outdir=build/scripts

FROM oven/bun:1.4.2
ARG OS_SECURITY_REFRESH=local
RUN test -n "$OS_SECURITY_REFRESH" && apt-get update && apt-get upgrade --yes --no-install-recommends && rm -rf /var/lib/apt/lists/*
WORKDIR /repo/services/identity
ENV NODE_ENV=production
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/services/identity/node_modules ./node_modules
COPY --from=build /repo/services/identity/build ./build
COPY --from=build /repo/services/identity/migrations ./migrations
COPY --from=build /repo/services/identity/package.json ./package.json
EXPOSE 3000
USER bun
CMD ["bun", "build/index.js"]
