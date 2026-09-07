# Artifact Store Specification

Status: proposed version-1 specification package

Date: 22 August 2026

This directory contains the cut-down artifact-store specification and the reviewed
design record from which it was derived.

## Normative implementation documents

1. [Core contract](CORE-CONTRACT.md) — kernel persistence, publication, read, and feed
   behavior.
2. [Security and recovery](SECURITY-AND-RECOVERY.md) — trust boundary, database roles,
   integrity handling, and divergent recovery.
3. [SDK contract](SDK-CONTRACT.md) — prepared intents, outbox integration, descriptors,
   clients, and projectors.
4. [Conformance plan](CONFORMANCE.md) — release-blocking fixtures and acceptance tests.

These documents are intended to agree. A conflict is a specification defect rather
than permission for implementations to choose different semantics.

## Design and extension context

- [Minimal implementation plan](../PLAN.md)
- [Reviewed minimal-core design record](ARTIFACT-STORE-MINIMAL-CORE.md)
- [Rationale and condensed application backtests](RATIONALE-AND-BACKTESTS.md)
- [Extension seams](EXTENSION-SEAMS.md)

## Earlier source material

- [Full artifact-store architecture](ARTIFACT-STORE.md)
- [External-interface exploration](ARTIFACT-STORE-EXTERNAL-INTERFACE.md)
- [avenCEO-tools repository backtest](ARTIFACT-STORE-REPOSITORY-BACKTEST.md)
- [AvenOS UI backtest](ARTIFACT-STORE-AVENOS-UI-BACKTEST.md)
- [avenAgent backtest](ARTIFACT-STORE-AVENAGENT-BACKTEST.md)

The source material remains useful rationale, but the focused contracts in this
directory define the proposed version-1 implementation behavior.
