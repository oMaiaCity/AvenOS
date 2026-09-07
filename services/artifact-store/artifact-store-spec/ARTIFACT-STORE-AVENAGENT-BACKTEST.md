# Artifact Store avenAgent Implementation Backtest

Status: completed implementation backtest

Date: 22 August 2026

Package: [Artifact Store Specification](README.md)

Specification under test: [ARTIFACT-STORE.md](ARTIFACT-STORE.md)

Related backtests:

- [ARTIFACT-STORE-REPOSITORY-BACKTEST.md](ARTIFACT-STORE-REPOSITORY-BACKTEST.md)
- [ARTIFACT-STORE-AVENOS-UI-BACKTEST.md](ARTIFACT-STORE-AVENOS-UI-BACKTEST.md)

Repository under test: `/home/daniel/src/jaensen/avenAgent`

## Executive verdict

The artifact-store specification survives this implementation backtest. `avenAgent`
does not expose a missing kernel primitive. It supplies strong implementation evidence
for several existing requirements:

- exact, bounded data handling is enforceable when every byte limit and encoding rule
  is explicit;
- immutable local outputs and hashes are useful, but identity, occurrence, provenance,
  and authorization must remain separate;
- a complete agent trace naturally contains both durable facts and operational/debug
  data, and must be decomposed before entering a general artifact store;
- mutable workspace state cannot serve as an exact run input without a content snapshot;
- repeated calls and cached observations are not the same thing as publication
  idempotency;
- an agent's ability to call a tool is separate from authority to publish, broaden
  access, delete retained data, or perform a consequential external action;
- reconciliation candidates, contradictions, coverage evaluations, and exact-match
  conclusions fit the specification's typed decision/evaluation model;
- user conversations, active runs, queues, cache entries, sandbox processes, and live
  SSE tails are application state rather than artifact-store primitives.

The implementation should not be connected to the artifact store by copying its run
directory or treating `trace.jsonl` as a production receipt. The current trace is an
excellent diagnostic record for the local agent protocol, but it lacks exact content
identities for mutable workspace inputs, includes material the spec deliberately says
not to retain as immutable truth, and is not atomically committed with workspace or
external effects.

The most important integration findings are:

1. **Workspace inputs are not snapshotted.** `RUN_START.manifest` records only relative
   path and size. A file can change without changing either, so a later reader cannot
   verify which bytes the model or tool used.
2. **Full traces retain hidden reasoning and complete prompts.** These are valuable
   short-lived diagnostics, not default artifact or production-receipt content. They
   may contain repeated secrets, personal data, untrusted source text, and model-private
   reasoning.
3. **`call_key` is not a publication idempotency key.** It hashes normalized tool name
   and arguments but excludes authenticated principal, authorization decision, exact
   input versions, current workspace state, intended outputs, and effect semantics.
4. **Workspace writes and shell effects have no durable request/receipt contract.** A
   successful tool result says what the tool claims it did; it does not bind the
   resulting file bytes or remote effect to a verifiable receipt.
5. **Session persistence is resumable, not transactional durability.** A `202 queued`
   message first enters an in-memory queue, corrupt JSONL lines are silently skipped on
   reload, and session deletion races active work while recursively removing the run
   record.
6. **The reconciliation map can collapse distinct occurrences.** Invoice number and
   transaction ID/fallback are used as node IDs, and map insertion overwrites on collision.
   Path strings are provenance labels, not exact artifact identities or evidence
   locators.
7. **Reconciliation completeness is closed over parsed inputs, not discovered inputs.**
   Malformed or unknown extraction files are silently ignored by the agent capability;
   the batch CLI logs failures but still produces a report. `complete` can therefore
   describe the accepted subset rather than the intended corpus unless ingestion
   completeness is made an exact input.
8. **The API uses one bearer token, not a principal/scope authorization model.** It is a
   sound local guard but cannot supply the artifact store's publisher, scope,
   declassification, graph, search, and feed policies.

No structural amendment to `ARTIFACT-STORE.md` is required. The implementation instead
needs an explicit adapter that selects durable facts from the agent runtime and
publishes them through the store's normal type, authorization, provenance,
idempotency, and atomic-commit contract.

## Scope and method

This was an implementation backtest. It inspected and exercised:

1. the core run loop, action model, result contract, renderer, tracing, and wind-down;
2. normalized tool-call hashing, cache scopes, invalidation, and offloaded results;
3. read, find, write, edit, and shell behavior;
4. sandbox capability enforcement and visible mounts;
5. the OpenAI-compatible adapter and its recorded model parameters;
6. durable chat sessions, interruption, restart, deletion, and SSE replay;
7. document extraction and invoice/statement reconciliation;
8. the generic knowledge map, matching heuristics, coverage, and provenance labels;
9. the deterministic Scala and web test suites.

Evidence classifications used in this report:

- **Confirmed** — implemented behavior positively supports a spec rule.
- **Useful precursor** — the implementation has part of the right mechanism, but not
  the artifact-store invariant.
- **Integration failure** — directly reusing the implementation as artifact-store
  behavior would fail a spec acceptance test.
- **Operational only** — useful runtime behavior that should remain outside the kernel.
- **Not exercised** — no implementation exists in this repository to test the area.

The repository had pre-existing user changes in `.gitignore` and two untracked design
documents. They were not modified. No network-dependent or live-provider tests were
enabled.

## Verification performed

The following local suites were executed:

- `sbt "testOnly *"`: 241 total, 239 passed, 2 opt-in live tests skipped, 0 failed;
- `web` Vitest suite: 7 files, 24 tests passed, 0 failed.

The two skipped Scala tests are explicitly environment-gated live model/extraction
smokes. They were not counted as passes. The web build emitted two Svelte warnings about
capturing the initial `sessionId`; those warnings do not affect the artifact-store
findings.

## Backtest scorecard

| Specification area | Result | avenAgent evidence | Consequence |
| --- | --- | --- | --- |
| Exact bounded bytes/text | Confirmed | UTF-8 scalar checks, byte-based limits, streaming reads, output/store quotas | Reuse the discipline and golden tests, not the local formats |
| Blob identity versus artifact identity | Confirmed by mismatch | `agent://out/N.txt` is a per-run sequence path, while hashes cover selected strings | Publish retained output bytes as blobs behind independent artifact occurrences |
| Immutable artifact occurrence | Useful precursor | Trace/results/contexts/offloads use exclusive create | Add registered types, occurrence IDs, digests, scopes, attribution, and database immutability |
| Immutable type versions | Not exercised | Tool schemas and render versions are versioned in code, not registered artifact types | Keep procedure/tool schemas in implementation receipts; register durable output types separately |
| Exact production inputs | Integration failure | Workspace manifest is `path:size`; reads reference live mutable paths | Capture exact input bytes/artifact IDs and mutable external snapshots |
| Production implementation receipt | Useful precursor | Model/provider/endpoint/sampling, prompt/tool hashes, raw hashes, timings, and tokens are traced | Select a bounded non-sensitive subset and pin every effective procedure dependency |
| Atomic multi-output publication | Not exercised | Files and trace lines are written in separate filesystem operations | Durable outputs and run receipt must publish in one store transaction |
| Publication idempotency | Integration failure if reused | `call_key` covers tool + normalized args only | Use the store's semantic request hash and principal-bound idempotency record |
| Operational cache | Confirmed outside kernel | Tagged cache scopes and invalidation are well tested | Keep cache state out of artifacts and production truth |
| Change feed | Integration failure if reused | SSE tails JSONL files and in-memory counters | Consume/store publication commits with sealed cursors and recovery epochs |
| Human decisions | Not exercised directly | Agent capability policy authorizes tools; no general HITL decision publication | Do not infer human approval from user text or tool availability |
| External effects | Strong pressure | Write/edit mutate workspaces; shell can mutate broadly and optionally use network | Model consequential effects as authorized request/executor receipt flows |
| Authorization | Useful local precursor | Bearer, Host, Origin, allowlisted workspace/mounts, sandbox enforcement | Map authenticated principals and scopes; a global token is insufficient |
| Search projection | Not exercised | `find` is a bounded live filesystem scan, not artifact search | Do not use the tool cache or find results as the store index |
| Evidence locators | Integration failure | Finance provenance is a source/detail string | Use exact artifact inputs and typed page/text/table/JSON locators |
| Retention and erasure | Strong negative test | Session deletion recursively removes active run state with no retention plan/fence | Use privileged, policy-aware purge for retained artifacts |
| Backup/restore | Integration failure if reused | Resume reloads loose files and silently skips malformed lines | Artifact truth needs transactional backup, verification, and fail-closed restore |
| Candidate/evaluation model | Strongly confirmed | Exact/candidate/contradiction and completeness are separate outputs | Publish typed evaluations; never mutate source invoice/transaction facts |

## Reconstructed avenAgent persistence model

The implemented runtime is approximately:

```text
session directory
├── meta.json                         mutable session configuration/title
├── conversation.jsonl                append-only-ish user/assistant view
├── workspace/ or allowlisted host dir
│   ├── user/agent files              mutable application/external state
│   └── *.extracted.json              mutable derived files
└── runs/<run-name>/
    ├── trace.jsonl                    flushed event stream
    ├── results/<step>.txt             exact inline Result.output seen by model
    ├── contexts/<step>.txt            exact rendered prompt in Full mode
    └── out/<seq>.txt                  full offloaded tool output
```

The core creates a new run store, emits a random run ID, renders the evolving context,
asks the model for one action, executes a tool, records the result, and repeats until
finish or budget wind-down
([run loop](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/RunLoop.scala#L52)).
The session layer reuses a persistent mutable workspace across fresh runs and appends a
compact assistant turn when no newer user message superseded it
([worker loop](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/api/SessionManager.scala#L263)).

This is coherent for an agent harness. It is not an immutable artifact graph:

- paths are local names rather than artifact identities;
- files may be overwritten in place;
- trace events, outputs, and effects are not committed atomically;
- run inputs are not closed over exact bytes;
- no registered artifact schemas or structural references exist;
- authorization is process/session policy rather than per-artifact scope;
- deletion is direct filesystem removal;
- the run record mixes durable facts, UI diagnostics, hidden reasoning, and cache state.

The correct integration is decomposition, not importing each run directory as one
opaque artifact.

## Detailed findings

### 1. Byte discipline strongly validates the spec's bounded-content requirements

The core consistently measures limits in UTF-8 bytes, rejects unpaired Unicode
surrogates, clips on scalar boundaries, and uses strict decoding for file content
([UTF-8 utilities](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/text.scala#L6)).
The run configuration bounds model output, action size, individual offloads, total run
store, reads, writes, shell output, workspace size, search traversal, and time
([configuration](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/model.scala#L140)).
Read windows are streamed and never load the whole source merely to return a bounded
slice
([read implementation](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/tools/read/Read.scala#L8)).

This is positive evidence for the specification's insistence on explicit blob, JSON,
string, batch, graph, and query limits. The implementation also shows that “bounded” is
not one maximum request size; it is a set of limits at allocation, decoding, rendering,
execution, and storage boundaries.

The reusable assets are the test philosophy and byte-accounting discipline. The local
canonical JSON function is not automatically the artifact store's canonicalizer. It is
designed for tool-call keys, operates over `ujson.Num`/JVM `Double`, and does not express
the spec's full type-definition dependency closure, canonicalization version, domain
tags, or cross-language golden-vector contract
([canonical JSON](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/text.scala#L63)).

### 2. Exclusive create is useful but does not make a local file an artifact-store artifact

The JSONL trace, step outputs, exact prompts, and offloaded outputs use `CREATE_NEW` or
exclusive creation
([trace files](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/trace.scala#L24),
[offload](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/registry.scala#L81)).
This successfully prevents accidental in-place overwrite inside one run directory.

The local identifiers nevertheless have different semantics from store artifacts:

- `agent://out/0.txt` is a sequential run-local address, not a content or occurrence
  identity;
- `trace://results/3.txt` is the inline result shown to the model, not necessarily the
  complete underlying output;
- a trace records the hash of the inline output, while the full offload is not named by
  or checked against that hash;
- files have no immutable registered type version, authorization scope, publisher,
  blob binding, artifact digest, or publication commit;
- filesystem exclusive-create is not database-enforced immutability across all
  application roles.

If an offload is independently useful after the run, publish its exact bytes as a blob
on a typed artifact occurrence. If it is only a paging aid for the next model turn, keep
it operational and expire it with the run. The term “artifact” in the harness should
not cause every context/result/offload file to be retained forever.

### 3. The current run manifest is not an exact input manifest

`RUN_START` stores a sorted list of `relative-path:size` values
([manifest](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/LoopTrace.scala#L89)).
That inventory is useful for navigation and debugging. It cannot establish provenance:

- two different byte sequences can have the same size;
- a file can change after run start or between two tool reads;
- allowlisted host workspaces persist and may be edited concurrently;
- extra mounts and their current contents are not represented by exact content
  identities;
- shell can mutate many files without reporting exact changed paths;
- a path may later resolve to different bytes even when its label is unchanged.

For a durable production result, every content-bearing input that affects it must be an
exact artifact occurrence or an `external.capture`-style snapshot. A source-tree-sized
workspace can be represented by a content-digested manifest, but the run need only name
the exact subset it actually consumed when that is knowable. Merely recording the
whole directory's path/size inventory is neither complete nor reproducible.

This finding strongly validates the spec's distinction between a mutable external
record and a captured artifact input.

### 4. The trace contains good receipt fields, but it is not itself a production receipt

`RUN_START` records task, sandbox mode, model identity parameters, selected config,
render version, instruction hash, and tool-schema hash. Model output events add raw
hash, bounded raw text, parsed action, latency, and token counts. Tool events add raw
and normalized arguments, call key, continuation, result code, output hash, cache flag,
change flag, and latency
([trace payloads](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/LoopTrace.scala#L18)).
These are excellent seeds for implementation and parameter receipts.

They are insufficient as the store's immutable production receipt because:

- the exact input artifacts are absent;
- only part of `RunConfig` is emitted;
- enabled capabilities and effective mount/network policy are represented indirectly or
  incompletely;
- the provider deployment/model alias may change behind the recorded name;
- external source captures are absent;
- tool and workspace effects are not atomically bound to the trace;
- the trace is append-flushed, not committed as one valid completed run;
- an interrupted or crashed trace may legitimately end mid-run;
- no authenticated publisher, logical actor, initiator, executor, authorization scope,
  or policy revision is part of the record.

The artifact store should publish a completed production run only with exact inputs and
outputs and a bounded implementation receipt selected from this richer trace. The full
trace may remain a separately retained diagnostic blob under a shorter, stricter
policy. An unfinished trace is an attempt record, not a completed production run.

### 5. Hidden reasoning and full prompts should not become immutable truth by default

The run loop coalesces streamed reasoning into `REASONING` trace events
([reasoning sink](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/RunLoop.scala#L139)).
Session runs use Full verbosity, storing the exact prompt for every model call
([session configuration](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/api/SessionManager.scala#L204)).
Those prompts contain the conversation, file-tree names, recent tool outputs, generated
guidance, and repeated source data.

This is the clearest negative test of the spec's “preserve an audit trail, not hidden
reasoning” boundary. A durable receipt needs what was requested, which implementation
and parameters ran, which exact inputs and policy applied, which outputs were published,
and what externally observable result occurred. It does not need private reasoning
tokens.

Persisting full prompts/reasoning indefinitely would also:

- multiply sensitive content across many steps;
- complicate erasure because the same source text appears in many contexts;
- expose data from read-only mounts or search results outside their original lifecycle;
- make authorization inheritance and declassification harder;
- couple the durable record to provider-specific reasoning formats.

Recommended treatment:

- do not publish reasoning events as artifacts;
- keep full prompt/trace capture opt-in, access-restricted, encrypted as appropriate,
  size-bounded, and short-retained;
- retain hashes and the non-sensitive procedure receipt where verification needs them;
- publish a final user-visible answer only when it is itself a durable product value;
- retain exact citations/evidence rather than hidden chain-of-thought.

### 6. `call_key` validates normalization, not publication idempotency

The core computes:

```text
sha256(tool-name + NUL + canonical-normalized-nondefault-arguments)
```

([normalization](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/normalize.scala#L76)).
This is a good deduplication key for repeated read observations inside one run. Tagged
cache scopes distinguish immutable offloads, individual paths, whole workspaces, and
external reads, and mutation invalidation is well tested
([cache](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/cache.scala#L5),
[dispatch](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/dispatch.scala#L22)).

It must not be reused as an artifact publication or external-action idempotency key. It
does not cover:

- authenticated principal, publisher, initiator, or executor;
- authorization scope or policy revision;
- exact source artifact IDs/digests or current path content;
- procedure/implementation version;
- intended output types and output scopes;
- run receipt, evidence, or structural references;
- effect preconditions or remote target versions.

The same `read {path:"invoice.pdf"}` call before and after a file change shares one
call key; cache invalidation makes that safe for the local runtime but proves that the
key is not an immutable content identity. The artifact store's semantic request hash
must cover the complete canonical publication command, as the spec already requires.

### 7. Runtime caching is a projection/optimization, not historical truth

The cache records read results, continuation, and a scope; write and exec effects drop
affected entries. Missing workspace files may be cached, while missing `agent://` refs
are deliberately not cached because a later offload could create that sequence
([cacheability](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/cache.scala#L29)).

This behavior strongly supports keeping cache state outside the artifact graph. A cache
hit is useful run-receipt metadata, but it does not create a second durable artifact,
prove source immutability, or justify reusing a prior artifact occurrence. If a producer
chooses semantic result reuse, the new run must still name current exact inputs and say
that a prior result was reused, matching the spec.

### 8. Workspace writes need content-bound receipts

`write` creates or truncates a file and returns a textual acknowledgement containing
path and byte count
([write](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/tools/write/Write.scala#L14)).
`edit` reads the current file, requires one exact match, truncates in place, and returns
an acknowledgement
([edit](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/tools/edit/Edit.scala#L13)).

For local scratch work, the existing trace is reasonable. For a consequential durable
effect, it is insufficient:

- the requested new bytes are not a typed artifact occurrence;
- the old file version/digest is not a declared precondition input;
- the post-write bytes/digest are not captured in the result receipt;
- the write and trace are not atomic;
- truncate-in-place can expose partial state if the process or filesystem fails;
- an unconditional overwrite can be repeated against a changed file;
- changed path is an application path, not durable content identity.

A robust integration can publish the intended file content as an artifact, issue a
workspace-write request naming the target and expected prior capture, let a constrained
executor apply it, and publish a receipt with resulting digest/version. For ordinary
agent scratch files, keep the operation outside the durable store and publish only the
final independently useful output.

### 9. Shell confirms why capability is not authority and effects are not exactly once

The shell tool can modify the entire writable workspace, invalidates all mutable cache
entries, and optionally runs with network access depending on configuration
([shell](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/tools/shell/Shell.scala#L5),
[sandbox mounts/network](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/sandbox.scala#L114)).
Its result records exit code and captured streams. It does not enumerate exact file
changes, remote requests, or resulting remote state.

This does not mean every shell command requires a human gate. It means that enabling
the capability is an application policy decision and a successful process exit is not
a universal receipt for every effect the command may have caused. Network-enabled
commands are particularly important: a retry after timeout may duplicate a remote
effect, and a captured stdout string is not authoritative remote state.

Consequential integrations should expose narrow domain executors with request artifact
IDs as remote idempotency keys and typed success/failure receipts. The general shell
can remain a sandboxed operational capability, but its trace should not be presented as
proof that all effects are known or exactly once.

### 10. Interruption proves that conversation visibility and durable effects diverge

When a new message arrives, the active run winds down. If another message is waiting,
the session does not append the interrupted run's assistant reply; the next run starts
from the persistent workspace and updated conversation
([interruption behavior](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/api/SessionManager.scala#L263)).

An interrupted run may already have written files or performed shell effects even
though no assistant turn appears. Its run directory and trace can remain. This is a
valuable backtest of three spec rules:

1. a missing final chat response does not imply that no action occurred;
2. unfinished workflow/run state is not a completed production receipt;
3. each durable effect must have its own committed receipt rather than relying on the
   conversation transcript as the audit log.

If the agent publishes artifacts during a run, each successful publication stands on
its own commit. Interruption cannot roll it back, and the next run should receive those
exact artifact IDs or commit cursor rather than infer work from a prose action summary.

### 11. Session JSONL is resumable application state, not artifact truth

The session manager writes metadata and conversation JSONL to loose files, then rebuilds
in-memory handles at startup
([persistence](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/api/SessionManager.scala#L220),
[reload](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/api/SessionManager.scala#L347)).
Appending a turn to disk before adding it to the in-memory list is a useful local
ordering rule. It is not transactional durability:

- an accepted HTTP message is queued in memory before the worker persists it;
- append does not establish an fsync or transactional commit boundary;
- corrupt JSONL lines are silently skipped on reload;
- malformed metadata falls back to empty defaults;
- there is no checksum chain, commit envelope, recovery epoch, or verified backup;
- conversation and workspace mutations can diverge across a crash.

This is acceptable as an application-specific session mechanism if its loss semantics
are explicit. If a user message starts durable work, publish the utterance/task artifact
before acknowledging durable acceptance or make the queue's at-least-once semantics
explicit. Conversation titles, busy state, inbox position, and current run remain
mutable session projections.

### 12. Session deletion is a concrete retention-race counterexample

Deleting a session sets interruption flags, removes it from memory, and recursively
deletes its directory immediately
([delete](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/api/SessionManager.scala#L238)).
It deliberately preserves an allowlisted host workspace, which is a good ownership
boundary. However, it does not wait for the active worker/tracer to stop before removing
the run directory. An open writer may continue, fail, or recreate subpaths while
deletion is in progress.

This directly validates the artifact spec's retention requirements:

- fence or serialize writers with purge;
- distinguish application/session deletion from legal artifact erasure;
- calculate descendants, referrers, repeated prompt content, and shared blobs;
- remove search/vector projections;
- preserve or remove audit/identity fields according to explicit policy;
- emit a purge commit and invalidate cursors/recovery epochs where history changes.

The current endpoint may remain an application cleanup operation for ephemeral run
directories. It must not be reused as the artifact store's purge implementation.

### 13. SSE replay is useful UI synchronization, not the publication feed

The server authenticates requests and streams conversation lines plus the active run's
trace, rereading files and advancing in-memory counters
([SSE loop](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/api/Server.scala#L183)).
This supplies a responsive diagnostic UI, and the frontend tests confirm replay
deduplication.

It lacks the properties of the artifact-store change feed:

- no atomic multi-resource publication commit;
- no durable consumer checkpoint;
- no sealed cursor bound to principal, scopes, recovery epoch, and retention horizon;
- no race-free bootstrap scan;
- no authorization filtering below a single process-wide bearer token;
- no guarantee that conversation, trace, and workspace updates form one event.

The UI can continue using session SSE. Durable downstream projectors should consume the
artifact store's commit feed instead.

### 14. Local API guards are strong but do not implement artifact authorization

Every API endpoint requires the configured bearer token and validates Host; mutating
requests with an Origin must use an allowlisted origin
([guard](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/api/ApiGuard.scala#L5)).
Workspaces and mounts are server allowlisted, browse paths are confined, read-only
mounts have an enforcement ceiling, and sandboxed mode does not silently downgrade
([workspace/mount model](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentcore/api/ApiTypes.scala#L9)).
These are strong reusable security patterns.

The single bearer token identifies no distinct publisher or reviewer and grants access
to every session endpoint. It cannot answer artifact questions such as:

- which principal published this occurrence;
- which authorization scope may contain the output;
- whether the caller may read every run input and reference target;
- whether a personal result may be declassified to a team scope;
- whether counts, lineage, search snippets, or feed gaps reveal hidden artifacts;
- whether the caller has retention or search-administration authority.

A local single-user deployment can map the process identity to a default scope, as the
spec permits. A multi-user deployment needs real authenticated request context and
database-enforced scope filtering; the agent must not choose publisher or scope IDs in
tool arguments.

### 15. The finance vertical strongly validates typed candidates and evaluations

The reconciliation implementation separates invoices, transactions, exact matches,
candidates, contradictions, unmatched items, coverage, and metrics. Ambiguity is
surfaced rather than guessed, and a payment predating the invoice blocks automatic
acceptance
([matching rules](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentmap/finance/Reconciliation.scala#L77)).
Random input ordering converges to the same exact-match set for the test corpus
([convergence tests](/home/daniel/src/jaensen/avenAgent/src/test/scala/agentmap/ConvergenceSuite.scala#L20)).

This maps cleanly to artifact-store concepts:

```text
source files
  -> extraction runs
  -> invoice-candidate + statement/transaction artifacts
  -> matcher run with exact policy/implementation input
  -> match-candidate / contradiction / coverage-evaluation artifacts
  -> policy or human decision
  -> accepted reconciliation/export/request artifacts
```

“Exact” is the current matcher's conclusion, not eternal business truth. It should be a
typed evaluation produced by a pinned matcher version and policy snapshot. A later
matcher or reviewer may publish a different result without editing the old one.
Coverage is likewise an evaluation over a closed exact corpus, while dashboard metrics
are rebuildable projections unless a downstream decision consumes a frozen evaluation.

### 16. Business identifiers currently collapse distinct artifact occurrences

The knowledge map uses `inv:<invoice-number>` and `txn:<transaction-id>` as node IDs
([identity functions](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentmap/finance/Reconciliation.scala#L27)).
`KnowledgeMap.addNode` updates a Scala `Map` at that key
([map insertion](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentmap/common/KnowledgeMap.scala#L18)).
Consequences include:

- two suppliers can issue the same invoice number;
- a duplicate occurrence of the same invoice is silently collapsed rather than
  represented as a separate observation;
- a corrected or re-extracted invoice can overwrite the earlier candidate;
- transaction IDs may be unique only within one statement/account;
- the fallback `booking-date#index` can collide across statements;
- overwrite depends on ingestion order and discards one provenance label.

The artifact store solves this with independent occurrence UUIDs. Business identifiers
remain typed payload fields and search/projection keys. Semantic duplicate detection can
publish a candidate assertion; it must not determine storage identity. Reconciliation
projection IDs should include exact artifact occurrence IDs, not only invoice or
transaction labels.

Add regression tests with duplicate invoice numbers across suppliers, the same
document arriving twice, repeated transaction IDs across accounts, and re-extraction of
one source with a new model version.

### 17. Path-only provenance is not evidence provenance

Each finance node or edge carries `Provenance(source, detail)`, where examples are
filenames or labels such as `invoices/acme.pdf`
([provenance type](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentmap/common/KnowledgeMap.scala#L8)).
This is helpful UI context but cannot verify:

- which occurrence or bytes were used;
- which page, table row, bounding box, or text range supports a field;
- which extraction/model/schema produced the value;
- whether the path changed after extraction;
- which policy/matcher version produced an edge.

Use exact source artifact IDs as production inputs and add evidence locators for invoice
number, amount, currency, party, dates, and statement rows. Matcher conclusions consume
the extracted occurrences and policy snapshot; their rationale belongs in typed
evaluation payloads and evidence links, not an unversioned `note` string alone.

### 18. Extraction schema and money conversion are not safe to freeze as artifact contracts

The provider tool schema uses nullable JSON `number` for monetary fields
([extraction schema](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentextract/ExtractSchemas.scala#L18)).
Ingest converts a JVM `Double` to cents with `math.round(n * 100.0)`
([ingest conversion](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentmap/finance/Ingest.scala#L15)).
That is adequate for the tested fixtures but unsafe as a digest-bearing financial type:

- decimal values can be inexact as binary floating point;
- there is no explicit scale or rounding mode;
- missing amount becomes zero in several paths;
- currency is an unconstrained string;
- dates are unconstrained strings until matcher parsing;
- the schema has no bounded transaction count or string lengths.

Before publication, validate against a registered bounded domain schema and convert
money using exact decimal parsing or producer-emitted minor units plus ISO currency.
Missing/unparseable values must remain missing/unknown candidates, not silently become a
real zero amount.

### 19. Reconciliation completeness can exclude failed inputs without saying so

The agent capability walks for `*.extracted.json`, silently ignores malformed JSON and
unknown tool names, and reconciles whatever it collected
([capability scan](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentextract/ReconcileCapability.scala#L21)).
The CLI is more visible—it logs per-file failures and the count not reconciled—but still
writes a report over the successful subset
([batch ingestion](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentextract/ReconcileCli.scala#L26)).

`ReconciliationCoverage.isComplete` means every invoice present in the map has an exact
match and at least one invoice exists
([coverage](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentmap/finance/Reconciliation.scala#L165)).
It does not mean every intended source document was read, classified, extracted, and
represented.

A durable completeness evaluation must consume a closed input manifest and report:

- total expected occurrences;
- successfully classified/extracted occurrences;
- failures, unsupported kinds, duplicates, and skipped inputs;
- exact extraction schema/model versions;
- matcher and policy versions;
- whether the corpus changed during evaluation.

If any required input failed, the overall corpus result is incomplete/degraded even if
the parsed invoices all happen to match. This is the same truthfulness rule exposed by
the negative-search case in the AvenOS backtest.

### 20. Derived extraction files are application projections unless deliberately published

The `extract` capability writes `<source>.extracted.json` into the mutable workspace,
overwriting by path if invoked again
([extract output](/home/daniel/src/jaensen/avenAgent/src/main/scala/agentextract/ExtractCapability.scala#L23)).
Those files are convenient interoperability records for the next `reconcile` tool, but
their filenames do not encode model, schema, source digest, or occurrence identity.

For artifact-store integration, publish the extraction candidate and run receipt
directly, then let a workspace projector optionally materialize the JSON file. A rerun
publishes another candidate occurrence. The current/preferred extraction file can be
updated as a projection without losing alternatives.

## Scenario backtests

### Scenario A: a source file changes without changing size

Current behavior: `RUN_START.manifest` is unchanged, the same path-based call key is
generated, and cache invalidation only helps if the change passes through the current
dispatcher. An external editor can replace bytes of the same size.

Required behavior: the durable derivation consumes a content-digested occurrence or
external capture. The new bytes produce a different input artifact even if path and size
are identical.

Result: **spec confirmed; current trace cannot be used as the receipt**.

### Scenario B: a new user message interrupts a run after a file write

Current behavior: workspace mutation remains, interrupted assistant reply may be
omitted, and a fresh run begins.

Required behavior: any durable write/publication already completed retains its own
receipt; the interrupted agent attempt remains operational or separately audited. The
conversation must not be used to infer rollback.

Result: **production runs and conversation projections must remain separate**.

### Scenario C: two identical reads are served from cache

Current behavior: the second result is marked cached and no handler rerun occurs.

Required behavior: this is operational reuse. It neither creates a new artifact nor
proves that a mutable source stayed unchanged outside the cache's invalidation domain.

Result: **cache behavior validates, but does not replace, semantic publication
idempotency**.

### Scenario D: a write times out or crashes around acknowledgement

Current behavior: file mutation and trace/result recording are separate filesystem
operations. Completion may be ambiguous.

Required behavior: reconcile the target's post-state. For consequential external
effects, use a request artifact ID as idempotency key and publish success/failure receipt
only after authoritative observation.

Result: **request/receipt split confirmed**.

### Scenario E: a network-enabled shell command posts twice after retry

Current behavior: the generic shell has no remote idempotency contract and stdout is the
only immediate evidence.

Required behavior: a domain executor accepts an authorized request occurrence, supplies
its ID to the remote system where possible, and publishes a typed receipt or ambiguous
failure requiring reconciliation.

Result: **generic shell cannot prove exactly-once external effects**.

### Scenario F: a large reconciliation report is offloaded

Current behavior: full text is in `out/N.txt`, while the step result contains a banner
and head plus a local ref.

Required behavior: publish the complete independently useful structured report, not the
pagination wrapper. Search mappings may index declared fields; the local continuation
remains operational.

Result: **one primary blob plus structured payload remains sufficient**.

### Scenario G: conversation JSONL contains one corrupt line

Current behavior: reload silently skips it and continues.

Required behavior: artifact truth fails integrity verification or reports an explicit
gap; it cannot silently present a truncated history as complete.

Result: **loose session resume is not an artifact recovery mechanism**.

### Scenario H: two suppliers use invoice number `1001`

Current behavior: both become `inv:1001`; later insertion overwrites the earlier node.

Required behavior: each extracted occurrence has its own UUID and source lineage.
Invoice number is a typed field. Duplicate/equivalence is a candidate evaluation.

Result: **independent logical occurrence identity is essential**.

### Scenario I: one extraction file is malformed, all parsed invoices match

Current behavior: the malformed file is ignored and the parsed subset can report
`complete=true`.

Required behavior: a closed corpus manifest and ingestion report expose the failure;
overall completeness is false or degraded.

Result: **negative/completeness facts require exact corpus accounting**.

### Scenario J: the matcher changes its heuristic

Current behavior: `Matcher.Default` is a code object and the output note names
`matcher:default`; no immutable implementation digest or policy snapshot accompanies
the report.

Required behavior: a rerun consumes the same exact invoice/transaction artifacts with a
new implementation/policy receipt and publishes alternative evaluations. Preferred
results are selected in a projection or adjudication run.

Result: **immutable alternatives and versioned procedure receipts confirmed**.

## Artifact mapping for an avenAgent integration

Not everything in a run should be published. A practical mapping is:

| avenAgent value | Store treatment |
| --- | --- |
| User message that starts/changes durable work | Typed utterance/task artifact; exact run input |
| Session title, busy flag, inbox, active run | Application projection/operational state |
| Conversation transcript view | Projection over retained turns plus ephemeral chat; not necessarily one artifact |
| Workspace file used as durable evidence | `core.file` occurrence or captured external snapshot |
| Source-tree snapshot | Content-digested manifest when an exact frozen tree matters |
| Model/provider/sampling/tool/instruction hashes | Bounded production implementation/parameter receipt |
| Raw model action/tool call | Operational attempt/proposal; not authority or success |
| Streamed reasoning | Short-retained diagnostic only; not an artifact by default |
| Full rendered prompt | Restricted diagnostic capture only when policy requires it |
| Read/find output | Transient observation unless independently useful and deliberately typed |
| `agent://` offload | Operational paging object or typed artifact if retained independently |
| Generated final file/content | Typed artifact output; optional workspace-write request/receipt |
| Tool cache entry/invalidation | Operational state |
| Completed pure transformation | Production run with exact inputs/outputs |
| Interrupted/crashed agent loop | Attempt/diagnostic record, not completed production run |
| Extraction JSON | Typed extraction candidate artifact; workspace file becomes projection |
| Invoice/transaction map node | Typed occurrence artifact, never business-key storage identity |
| Match edge | Typed match evaluation/candidate artifact, not structural reference |
| Coverage metrics | Projection or frozen evaluation when decision-relevant |
| Workspace/network action | Authorized request plus executor receipt where consequential |
| SSE event/tail cursor | UI transport state; durable consumers use publication feed |

## Recommended integration architecture

Keep the agent core and artifact store loosely coupled through a producer/executor
adapter:

```text
user/session application
        |
        +--> mutable conversation, queues, active-run state
        |
        +--> publish durable task/source artifacts
                       |
                       v
                 avenAgent run
                       |
            operational trace/cache/sandbox
                       |
        +--------------+----------------+
        |                               |
        v                               v
typed pure output                 consequential effect proposal
        |                               |
        v                               v
atomic artifact publication       authorized request artifact
with production receipt                 |
                                        v
                                  narrow executor
                                        |
                                        v
                                  receipt artifact
```

The adapter should:

1. resolve authenticated publisher, logical agent actor, human initiator, output scope,
   and policy revision outside model-controlled arguments;
2. provide artifact inputs to the workspace as read-only materializations with a map
   back to exact artifact IDs and digests;
3. capture mutable host files used by a durable result before publication;
4. translate only completed, independently useful results into registered artifact
   types;
5. publish outputs, exact ordered inputs, evidence, and a bounded implementation receipt
   atomically;
6. use a fresh principal-bound idempotency key for the publication command;
7. return artifact IDs and commit cursor to the session projection;
8. keep full reasoning/prompts/tool chatter out of the immutable receipt unless a
   separate explicit diagnostic-retention policy requires a capture;
9. expose narrow effect executors rather than treating general shell success as a
   business receipt;
10. consume publication commits for downstream work rather than tailing agent trace
    files.

The model should never be allowed to choose its own publisher identity, authorization
scope, retention status, declassification flag, or claimed external success.

## Release-blocking acceptance tests derived from avenAgent

Before an avenAgent producer is considered artifact-store compliant, add tests proving:

1. Same path and same size with changed bytes produces a different captured input and
   output derivation identity.
2. An external workspace mutation between read and publish causes revalidation failure
   or pins the earlier captured bytes; it never silently changes the run's input.
3. `call_key` cache hits do not suppress a required new publication receipt.
4. Retrying the same publication key with the same command returns the original artifact
   IDs/commit; changing principal, scope, inputs, outputs, or receipt returns conflict.
5. An interrupted agent run cannot publish a completed production receipt without all
   exact outputs; already committed sub-operations remain discoverable.
6. Full reasoning and prompt bodies are absent from the default production receipt and
   artifact search index.
7. Diagnostic trace access is separately authorized and its retention/purge policy is
   explicit.
8. A write receipt binds target, expected prior version, exact resulting bytes/digest,
   executor, and time.
9. A timed-out external action is reconciled before retry and cannot be represented as a
   successful receipt from stdout alone.
10. Two suppliers with the same invoice number remain distinct occurrences.
11. Duplicate arrival of identical invoice bytes creates distinct file occurrences
    sharing one blob and distinct extraction runs when requested.
12. Repeated transaction IDs in different accounts/statements do not collide.
13. A malformed, skipped, or failed extraction prevents a closed-corpus completeness
    result from claiming success.
14. Money round-trips exactly through canonical JSON/minor-unit representation without
    binary floating-point dependence.
15. Every match/evaluation names exact invoice/transaction occurrences and exact
    matcher/policy versions.
16. A new matcher version publishes alternatives without overwriting prior candidates
    or decisions.
17. Artifact publication is authorized at the database boundary even if the agent
    omits or forges a scope in its tool arguments.
18. Search, lineage, evidence, feed, and counts do not reveal artifacts outside the
    caller's current scopes.
19. Session deletion does not purge retained artifacts; privileged purge fences active
    publishers and handles descendants/referrers/shared blobs.
20. Restoring the store verifies bytes, type definitions, receipts, commits, and
    recovery epoch rather than silently skipping malformed history.

## Recommended implementation priority

The repository suggests the following order for an integration spike:

1. Define a narrow producer SDK boundary around one pure deterministic vertical:
   already-captured invoice/statement artifacts into reconciliation evaluations.
2. Fix occurrence identity, exact money representation, bounded schemas, corpus
   accounting, matcher receipt, and evidence locators before registration.
3. Publish reconciliation outputs and one production run atomically; leave the agent
   session/trace/workspace unchanged.
4. Materialize artifact inputs read-only into a run workspace and preserve an exact
   artifact-ID/path map outside model control.
5. Add extraction publication: raw file input, exact extraction candidate output,
   provider/model/schema receipt, and evidence.
6. Feed published artifact IDs/commit cursors back into the conversation projection.
7. Add a generated-file artifact plus constrained workspace-write request/receipt path.
8. Only then consider broader shell-driven or network effects, each behind a narrow
   domain executor.
9. Add optional restricted diagnostic-trace capture separately from production
   receipts, with explicit retention and purge behavior.

This order uses `avenAgent`'s strongest property—the pure, well-tested reconciliation
core—without making the artifact store responsible for sessions, prompts, tool loops,
caches, or sandbox lifecycle.

## Decisions this repository helps settle

The implementation provides useful evidence for the following spec decisions:

- **Keep production receipts compact and typed.** A full agent trace is too broad,
  sensitive, and operational to be the receipt.
- **Keep one primary blob.** Complete retained output bytes can be one blob; contexts,
  traces, and source bundles are separate values or manifests, not extra blob slots on
  the result artifact.
- **Use independent occurrence IDs.** Business keys and content hashes both collapse
  legitimate observations in the finance vertical.
- **Keep workflow outside the kernel.** Session inboxes, interruptions, retries,
  anti-loop state, and finish-only turns are valuable but application-specific.
- **Keep search/cache separate.** Bounded filesystem `find` and read caching solve agent
  navigation, not durable artifact search.
- **Treat semantic edges as artifacts.** Finance matches and contradictions are claims
  produced by a matcher, not structural composition.
- **Snapshot mutable external data.** Live workspaces and mounts cannot be durable run
  inputs by pathname.
- **Separate capability from authority.** Sandbox/tool availability limits what the
  agent can attempt; authenticated policy decides what may become durable or external.
- **Use request/receipt for effects.** File and network operations show why process exit
  and conversational claims are not authoritative completion.
- **Do not retain hidden reasoning as truth.** The diagnostic implementation makes the
  security, erasure, and duplication costs concrete.

## Final assessment

`avenAgent` is the strongest backtest so far for the specification's boundary between
an execution engine and an artifact store. It has a disciplined, deterministic,
well-tested runtime, but that runtime is intentionally optimized for bounded agent
operation and diagnostics—not immutable, authorized, transactionally published
knowledge.

The spec is sound. Its production-run, exact-input, typed-evaluation, authorization,
request/receipt, retention, and projection rules are precisely what prevent the local
agent concepts—trace events, call keys, path manifests, offload refs, session JSONL, and
knowledge-map IDs—from being mistaken for durable truth.

The recommended path is not to store the whole agent session. Publish only exact source
captures and independently useful typed outputs, with compact receipts and evidence;
keep prompts, reasoning, caches, queues, interruptions, and UI streaming operational;
and put every consequential mutable or remote effect behind an authority-aware
executor receipt.
