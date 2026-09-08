FROM postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73

ARG OS_SECURITY_REFRESH=local
RUN test -n "$OS_SECURITY_REFRESH" && apk upgrade --no-cache && apk add --no-cache ca-certificates restic tzdata jq

WORKDIR /operations
COPY deploy/operations/backup.sh deploy/operations/restore.sh deploy/operations/entrypoint.sh deploy/operations/healthcheck.sh ./
RUN chmod 0555 ./*.sh

USER 65532:65532
ENTRYPOINT ["/operations/entrypoint.sh"]
