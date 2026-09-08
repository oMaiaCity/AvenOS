FROM rust:1.93.1-bookworm AS build

WORKDIR /repo
COPY .cargo .cargo
COPY services/artifact-store services/artifact-store

WORKDIR /repo/services/artifact-store
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/repo/target/rust \
    cargo build --locked --release -p aven-artifact-store-server --bin aven-artifact-store \
    && cp /repo/target/rust/release/aven-artifact-store /tmp/aven-artifact-store

FROM debian:bookworm-slim AS runtime

ARG OS_SECURITY_REFRESH=local
RUN test -n "$OS_SECURITY_REFRESH" && apt-get update \
    && apt-get upgrade --yes --no-install-recommends \
    && apt-get install --yes --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --no-create-home artifact-store

COPY --from=build /tmp/aven-artifact-store /usr/local/bin/aven-artifact-store

USER 10001:10001
EXPOSE 8087 8088
ENV ARTIFACT_STORE_HEALTH_PORT=8087
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=30 \
  CMD curl --fail --silent --show-error "http://127.0.0.1:${ARTIFACT_STORE_HEALTH_PORT}/health/ready" >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/aven-artifact-store"]
CMD ["serve"]
