# Incident response

Status: authoritative

Keep incident response small and evidence-driven. One person leads. A second person
records the timeline when available. Use the restricted observation and deployment
rails; do not improvise a permanent repair on a failed host.

## First ten minutes

1. Open the failed GitHub operations or deployment run.
2. Select the affected target's Pulumi stack and run
   `./tools/stack-observe/run.sh <identity|platform> status`.
3. Capture relevant fixed-scope logs before restarting or replacing anything.
4. Classify the event: availability, security, data integrity, capacity, or provider.
5. Record detection time, affected surfaces, current customer impact, and the person
   making containment decisions.

## Contain safely

- For an availability failure without integrity risk, correct forward and redeploy the
  last verified ref.
- If a process is causing continuing damage, stop ingress or only the named workload.
- For a credential incident, rotate the smallest affected provider or generated
  credential and redeploy.
- For uncertain database integrity, close routing and restore only into a fresh target.
- For a lost or suspect host, provision a replacement. Do not return a contaminated
  host to service.

The deploy identity can invoke only the fixed deploy and restore wrappers through
sudo. There is no general remote root shell. If OS-level forensics is unavoidable, use
the Hetzner rescue console, preserve evidence first, and replace the host afterwards.

## Diagnose

Use [Maintenance](maintenance.md#observe-status-and-logs) for Compose state, recent
logs, disk use, and backup freshness. Use the restricted database tunnel only with a
separate read-only SQL role.

Check the narrowest owning boundary:

- identity and passkeys: `aven.id` and the identity database;
- checkout, email, billing, and Polar: the affected environment's checkout workers
  and checkout database;
- authorization or routing: the affected environment's facade and platform control
  database;
- one customer's product data: that customer database and component schema;
- public site: managed site state, Git source/artifact revisions, and Caddy.

Check whether the failure is limited to `next`, limited to production, or shared
through `aven.id`. Do not copy data or credentials between platform environments to
make one appear healthy.

Do not put tokens, cookies, passkey challenges, database URLs, raw email, provider
secrets, or customer documents/chat content into incident notes.

## Recover

- Application regression: deploy a previously verified compatible ref.
- Failed migration: correct forward; do not reverse shared database state.
- Lost host or corrupt data: follow [Fresh-host disaster recovery](backup-and-recovery.md#fresh-host-disaster-recovery).
- Public-site failure: verify the Git source and managed artifact, then republish DNS;
  do not restore a legacy host.
- Provider failure: keep internal state durable, disable the affected integration if
  necessary, and resume idempotent workers after recovery.

Before reopening traffic, verify public health and the affected user journey. For data
recovery, include checkout, passkey, native-device, and exact customer-data smoke
checks.

## Close the incident

Record:

- impact and duration;
- detection and containment times;
- decisions and people involved;
- credentials rotated;
- selected recovery point and manifest digest, if restored;
- smoke-test evidence;
- remaining customer or legal communication; and
- one concrete prevention or detection improvement with an owner.

Do not turn every incident into new infrastructure. Add paging, centralized logs, or
failover only when the measured triggers in
[Capacity and growth](maintenance.md#capacity-and-growth-triggers) are crossed.
