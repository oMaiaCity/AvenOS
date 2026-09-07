# Product model

Status: authoritative

avenOS is the open-source foundation for building and operating an Aven. avenCEO is
the first product composition built on that foundation. This document defines those
names and connects the product purpose to the technical boundaries in this repository.
It does not replace the marketing copy at `aven.ceo` or the procedures in the
[operations handbook](operations/README.md).

## The purpose

An Aven is an AI collaborator intended to work across a person's life, project, or
company while the knowledge and operating history it accumulates remain under that
person's control. It receives material and goals, uses skills to act, stops for human
judgment when required, and preserves enough context and evidence to continue work
later.

An Aven is not a language model, chat session, service process, database, hostname, or
passkey account. Models and service instances may change. The durable value lies in
the working intelligence assembled through use.

## Product and foundation

| Name | Meaning |
| --- | --- |
| Aven | One product-level AI collaborator and the working context it develops |
| avenCEO | The current commercial Aven composition for a person's life and company |
| avenOS | The open-source client, runtime, service contracts, and deployment foundation used to build and operate Avens |
| customer environment | The stable authorization and lifecycle boundary for one entitled product context |
| customer database | The physical database currently holding one customer environment's durable domain data |

A customer environment is not automatically synonymous with an Aven. The current
implementation routes one selected environment at a time and stores its domain state
in one database. Any future mapping that permits several Avens in one environment or
one account to own several environments must be an explicit product contract; it must
not be inferred from an email address, purchased name, database name, or identity
subject.

## Working intelligence

Working intelligence is the durable body of context created while an Aven works. The
product direction requires that body to become portable; the current implementation
defines only part of its representation. Today it includes:

- Intents and their conversations, state, and human decisions;
- source and derived artifacts with lineage and evidence;
- skill definitions, configuration, and selected execution policy;
- Actor runs, checkpoints, attempts, and continuation metadata; and
- the corrections and outcomes that later work can build on.

It is not the weights of a third-party model and it is not an unstructured claim that
the system “learns everything.” Each durable part needs a defined owner, schema,
authorization path, backup behavior, and export representation.

## How work is represented

| Concept | Product role |
| --- | --- |
| Intent | Durable context for one outcome or continuing piece of work |
| Skill | Reusable description of an outcome, policy, and permitted way of working |
| Actor | Independently addressable participant that performs a bounded capability |
| Artifact | Immutable input, result, or evidence that survives a process or Actor instance |
| Run | Durable execution history for a plan, including checkpoints and human continuation |

Text, voice, files, and service events may all contribute to an Intent. A Skill can
select or plan several Actors. Actors publish Artifacts rather than treating private
memory as durable truth. These distinctions let an Aven continue work without being
defined by one interface or model provider.

## Identity, ownership, and authorization

`aven.id` establishes which human subject authenticated and how. It does not own an
Aven, customer entitlement, product name, or customer database. Checkout records the
commercial relationship. `api.aven.ceo` evaluates current product authorization and
routes an admitted operation to one customer environment. Domain services independently
verify their narrower grants before reading or writing that environment.

This separation keeps a passkey account from becoming a universal product capability
and keeps payment data from becoming an authentication credential.

## What “belongs to you” means today

The repository currently provides concrete foundations for customer control:

- the source and service contracts are inspectable;
- customer domain data is placed in a separate customer database;
- services and functions receive narrowly scoped roles;
- identity, commerce, control state, and customer domain state have distinct owners;
- deployment and recovery rebuild hosts from source, encrypted state, and encrypted
  off-host backups; and
- the client and services use explicit, versioned artifact and execution contracts.

These properties improve isolation and operational independence. They do **not** yet
prove all ownership claims made for the finished product. In particular, the current
implementation does not provide:

- client-side end-to-end encryption that prevents infrastructure operators from
  reading customer data;
- a complete, versioned export/import path for all working intelligence;
- a provider-neutral deployment path proven outside the current Hetzner composition;
- server-side OCR and model-backed document understanding equivalent to the client's
  optional vision lane.

Documentation must state these limits beside the stronger product direction. Database
isolation must not be called end-to-end encryption. Source availability must not be
called portability until export and restore into an independently operated system are
tested.

## Where the details live

- [Customer databases as a first-class platform boundary](customer-database-platform.md)
  defines data placement, roles, grants, provisioning, and reconciliation.
- [Skills: from an artifact or desired outcome to a resumable run](actor-skills-and-problem-solving.md)
  explains how an Aven turns source material or an exact outcome into capabilities, a
  plan, and a durable run.
- [Artifact-first semantic enrichment and affordance discovery](artifact-first-semantic-enrichment.md)
  specifies how uploaded documents become typed knowledge and newly available actions.
- [Document ingest system architecture](document-ingest-system.md) maps the current
  document pipeline and its remote-runner boundary.
- [Identity, checkout, facade, and public-web cut](identity-checkout-facade-cut.md)
  defines the public trust boundaries.
- [Operations handbook](operations/README.md) owns setup, deployment, maintenance,
  backup, and recovery procedures.
