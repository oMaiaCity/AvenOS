FROM oven/bun:1.4.2-alpine
ARG OS_SECURITY_REFRESH=local
RUN test -n "$OS_SECURITY_REFRESH" && apk upgrade --no-cache \
  && apk add --no-cache ca-certificates git \
  && addgroup -g 10003 -S sitehost \
  && adduser -u 10003 -S -D -H -G sitehost sitehost
WORKDIR /app
ENV NODE_ENV=production
COPY services/static-site-host/package.json ./package.json
COPY services/static-site-host/src ./src
USER 10003:10003
EXPOSE 8093
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=12 \
  CMD bun -e "fetch('http://127.0.0.1:8093/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "src/index.ts"]
