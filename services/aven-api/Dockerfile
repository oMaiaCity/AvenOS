FROM oven/bun:1.3.13 AS build
WORKDIR /repo
COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
  --mount=type=secret,id=npm_token,required=true \
  printf '@myavenceo:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=%s\n' "$(cat /run/secrets/npm_token)" > "$HOME/.npmrc" \
  && bun install --frozen-lockfile --filter '!./' --filter @avenos/aven-api \
  && rm -f "$HOME/.npmrc"
RUN bun --cwd services/aven-api build
FROM oven/bun:1.3.13
RUN apt-get update && apt-get upgrade --yes --no-install-recommends && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /repo/services/aven-api/build ./build
COPY --from=build /repo/services/aven-api/migrations ./migrations
COPY --from=build /repo/node_modules /repo/node_modules
ENV NODE_ENV=production
USER bun
CMD ["bun", "build/index.js"]
