# Invoice reconciliation implementation review

Review date: 2026-09-05. Reviewed snapshot: `6f4047a6863105323af7dc2bd683df51f996c468`, fetched from `origin/main` for this review.

Status: review report. This is an assessment of that snapshot, not a replacement for the [reconciliation design](invoice-statement-reconciliation.md) or the operational handbook. No implementation code was changed.

Snapshot boundary: the findings below describe the reviewed commit, not the subsequent
shared-solver implementation in this worktree. Current behavior, addressed matching
defects and remaining validation limits are documented in
[the executable flow](invoice-statement-reconciliation.md#current-executable-flow-and-validation-boundaries).

## Assessment

The implementation is a useful foundation for preserving invoice and statement facts and explaining comparisons between supplied candidates. It does not yet deliver the original user journey: import an invoice and a statement, find the corresponding booking, and retain a confirmed relationship. The design paper acknowledges this boundary accurately. The production document coordinator stops after normalization and transaction publication; retrieval, matching orchestration, decisions, allocation state, and review interaction remain unimplemented.

The most important work before exposing matching is to make transaction identity and invoice amount semantics dependable. Today, the ranker can hide a legitimate second payment as a duplicate, choose contradictory observations according to input order, and compare against an amount whose meaning changes between paid and partially paid invoices. These are observable behavior in the existing functions, independent of whether an automatic decision service exists.

The automatic-eligibility fields also need tightening before any downstream consumer trusts them. A long customer reference can count as invoice-specific evidence, opposite booked and original FX signs are not treated as a contradiction, and an offer can pass the current pair gate. These do **not** establish that the deployed system makes incorrect automatic decisions: there is no decision path, document-derived direction stays unknown, and statement coverage stays unverified. They establish that adding the missing direction and coverage producers would expose more permissive behavior than a consumer might expect from `pairEligible`.

The architecture is worth extending. Keep immutable occurrences, separate comparison from acceptance, preserve original-currency amounts, and build the missing customer-scoped search and review path. Resolve the semantic issues before accumulating allocation state on top of the current keys and amounts.

## Scope and method

I expanded the review beyond the scoring function to include the normalizers, extraction and validation contracts, document coordinator, Actor interfaces, publication facade, Artifact Store schemas, test corpus, and the matching experience in the supplied `avenCEO-tools` checkout. This matters because a correct comparator cannot recover a discarded transaction, an ambiguous amount, or a missing search result.

The review used source tracing, the existing tests, and an isolated diagnostic harness calling the actual normalizers and ranker. The harness used invented financial data and made no external requests. It is available locally at `/tmp/reconciliation-review-scenarios.ts`; its inputs and important outputs are summarized below so the findings do not depend on retaining that temporary file.

No live bank, production customer data, model provider, or running customer stack was exercised. A full stack cannot currently demonstrate the missing reconciliation journey without implementing new orchestration. The runtime and publication tests still help establish the boundaries that do exist. The observed PDF failure is a local bundle-test result, not a claim that a deployed service was tested and failed.

Throughout this report:

- **Observed** means a scenario or existing test was executed in the reviewed worktree.
- **Source finding** means the behavior follows from inspected code and contracts.
- **Extension requirement** means an explicitly missing feature or a design obligation for a later slice.
- **High priority** means resolve before depending on the affected matching behavior. It does not imply a current automatic accounting write.

## What actually runs today

| Step | Current behavior | Boundary |
| --- | --- | --- |
| Import an invoice | Extract candidate/details, validate the compact candidate, publish an open item | Direction is always `unknown`; details are not validated by the invoice validator |
| Import a statement | Extract at most 128 rows, validate, publish a canonical statement and transactions in batches of 64 | Coverage is `unverified`, or `row-limit-reached` at the ceiling |
| Compare an invoice with transactions | An exported function and Actor rank a caller-supplied set | No production customer-wide search supplies that set |
| Publish candidates | The facade accepts the named client procedure and validates its publication shape | There is no application flow that invokes this for imported invoice/statement pairs |
| Accept a relationship | Proposed in the paper | No production reconciliation decision, accepted allocation projection, or review UI was found |
| Repeat automatically | Proposed in the paper | No reconciliation commit-feed consumer, job queue, or rematching loop was found |

Evidence: [document runtime](../libs/aven-document-ingest/src/runtime.ts), lines 438–562; [Actor registry](../libs/aven-document-ingest/src/actors/registry.ts), lines 60–98; [ranker Actor](../libs/aven-document-ingest/src/actors/reconciliation-ranker/index.ts), lines 20–47; [publication procedures](../services/aven-api/src/lib/server/artifacts/service.ts), lines 609–657.

For either import order—statement then invoice, or invoice then statement—the current runtime produces facts for each document but does not retrieve the other side or invoke the ranker. The app's “Ranking reconciliation candidates” stage label is presentation support, not evidence that such a stage is scheduled.

## Findings requiring attention

### F1. Fingerprint equality removes legitimate payment candidates

**High priority · observed current ranking defect.**

The statement normalizer hashes account, booking date, booked amount, currency, counterparty IBAN/name, and description when a provider transaction ID is missing. The ranker then reduces all rows with the same `dedupKey` to one representative. It does this for both provider IDs and fingerprints.

Two separate €100 transfers to the same supplier on the same date with the same description therefore become one candidate. In the executed case, the two rows had different source positions, titles, and running balances. Both transaction artifacts can still be published; it is the candidate set that loses an independent payment. The result was one candidate with `duplicateCount: 2`.

This contradicts the paper's explicit rule that a fingerprint is only a duplicate candidate. It can conceal a double payment or leave two invoices competing for what appears to be one transaction. Conversely, minor extraction changes to description or counterparty spelling can keep two observations of one real payment separate.

Preserve occurrence identity until a separate resolution step proves equivalence. Exact repeated observation of a trusted, account-scoped provider ID is a different case from two equal-looking rows. Treat fingerprint groups as unresolved relationships and retain all members. Simply adding the row ordinal to the cross-statement hash would prevent one collision while breaking overlap matching; occurrence identity and business identity need separate representations.

Evidence: [statement normalizer](../libs/aven-document-ingest/src/actors/statement-normalizer/index.ts), lines 74–89; [ranker](../libs/aven-document-ingest/src/reconciliation.ts), lines 219–231. Required test: two genuinely distinct equal-looking payments and two overlapping observations of one payment must produce different resolution outcomes.

### F2. Account-number identity is not scoped to an institution

**Medium priority · observed identity defect.**

With no IBAN, `accountRef` is `account:` plus the compacted printed account number. The institution does not participate. Two banks can have the same local account number. If their printed transaction IDs also agree, the normalizer creates the same transaction key.

The scenario used account number `12345` at Bank A and Bank B and the same provider transaction ID. Both `accountRef` and `dedupKey` were identical. When neither account number nor IBAN exists, the fallback based on institution, holder, and product also cannot distinguish two accounts with the same holder and product.

A later connector should provide a canonical account resource scoped to the connection/provider and customer. Document account identifiers should resolve to that resource with an explicit confidence and identity basis. A bare domestic account number or masked number should remain unresolved until its institution and account context are established.

Evidence: [statement normalizer](../libs/aven-document-ingest/src/actors/statement-normalizer/index.ts), lines 54–70 and 87–89. This is an identity collision within supplied data, not a demonstrated customer-database isolation failure.

### F3. Conflicting duplicate observations are silently selected by order

**High priority · observed current ranking defect.**

Representative selection prefers the lower `sourceOrdinal`; equal ordinals retain whichever observation came first. A row ordinal is local to a statement and says nothing about freshness, corrections, validation strength, or authority across statements.

For two observations with the same provider key and ordinal, one said −€100 and the other −€200. Against a €100 invoice, changing only input order changed `pairEligible` from `true` to `false`. Neither result reported a conflicting duplicate. A similar ordering choice can hide contradictory coverage or validation observations.

Define resolution over all observations: identical facts can coalesce; incompatible facts require a conflict or an explicit supersession relationship. Stable sorting alone would make the wrong choice reproducible without making it correct. Preserve every supporting and contradictory observation and make eligibility depend on the resolved state.

Evidence: [ranker](../libs/aven-document-ingest/src/reconciliation.ts), lines 219–231; [candidate evidence selection](../libs/aven-document-ingest/src/actors/reconciliation-ranker/index.ts), lines 48–81. Required tests include permutation invariance and correction/validation conflicts, not just repeated identical rows.

### F4. `amountDueMinor` mixes original total, outstanding balance, and matching target

**High priority · observed semantic defect in canonical output.**

The normalizer uses a nonzero printed outstanding amount, otherwise the gross amount. It preserves `amountPaidMinor` but does not use it to establish the remaining obligation. A €100 invoice marked fully paid with zero outstanding becomes an open item with `amountDueMinor: 10000` and `amountPaidMinor: 10000`.

Using the gross total can be useful when locating the historical payment for a paid invoice. The problem is that the field is also described as the remaining settlement obligation, and for partial invoices it switches meaning. A €100 invoice with €40 paid and €60 outstanding compares against €60; the €40 historical booking is no longer an exact match. If the outstanding field is absent, the same document compares against €100. The current normalization test explicitly expects the paid invoice's zero outstanding amount to become its gross total, so it protects this ambiguity.

Represent at least the original obligation, observed payments, and remaining obligation separately. The matching request must specify whether it is explaining historical settlement or locating payment against an outstanding balance. Only derive a missing remainder when the document's totals and payment semantics support that calculation. Partial payments and paid receipts should not require overloading a single amount field.

Evidence: [open-item normalizer](../libs/aven-document-ingest/src/actors/open-item-normalizer/index.ts), lines 38–43 and 78–80; [amount comparator](../libs/aven-document-ingest/src/reconciliation.ts), lines 136–157; [existing normalization test](../libs/aven-document-ingest/tests/reconciliation.test.ts), lines 117–162.

### F5. Reference length is used as a substitute for invoice-specific meaning

**High priority before automatic eligibility is consumed · observed pair-gate defect.**

The normalizer flattens the invoice number, order number, every reference-entry value, and payment references into strings. It drops the reference kind and label. The ranker considers a matched string sufficiently specific when its compacted form has six characters, or four characters containing letters and digits.

An ordinary customer number, recurring mandate, or shared order reference can pass that test. In the executed case, matching `CUSTOMER-123456` made a transaction eligible even though its description named another invoice and its counterparty was an unrelated supplier. The gate has no representation of a conflicting invoice reference. Name/IBAN mismatches remove supporting points but do not produce contradiction blockers.

Preserve typed references and their source locations. Distinguish invoice identifiers, shared account/customer references, mandate identifiers, payment identifiers, and order identifiers. Determine support and contradiction independently. A shared mandate or order can help retrieval but cannot establish invoice uniqueness without additional evidence and allocation context.

Evidence: [open-item normalizer](../libs/aven-document-ingest/src/actors/open-item-normalizer/index.ts), lines 51–59; [reference comparison and eligibility](../libs/aven-document-ingest/src/reconciliation.ts), lines 192–208 and 235–249. Document imports currently remain review-only through other gates; this finding does not imply an existing automatic decision.

### F6. FX sign and credit-note semantics are under-specified

**Medium priority now; required before new direction/connector producers · observed.**

Sign comparison uses whichever amount won the amount comparison. For an original-currency match, it uses the original amount's sign rather than checking the booked cash movement and the relationship between both signs.

For a payable USD 100 invoice, a booked **incoming** €90 transaction with original amount **−USD 100** passed the pair gate. The reverse inconsistency—booked −€90 with original +USD 100—was marked as a sign conflict. The latter is useful evidence of a connector contract mismatch when a provider prints original amounts unsigned; the former shows why contradictory signed fields need an explicit blocker rather than selection of the convenient sign.

The ranker also ignores `documentKind` and the sign of the invoice obligation when determining expected cash flow. A supplier credit note with a negative total and `direction: payable` rejects an incoming refund. This can be resolved by defining `direction` as expected cash movement and reversing it in a domain resolver, or by retaining party role and explicit expected cash direction separately. At present there is no such resolver, and the type does not settle that ambiguity.

Evidence: [amount/sign comparison](../libs/aven-document-ingest/src/reconciliation.ts), lines 147–189 and 263; [open-item normalizer](../libs/aven-document-ingest/src/actors/open-item-normalizer/index.ts), lines 69–70. Add tests for incoming/outgoing FX, unsigned provider originals, contradictory signs, supplier credit notes, customer credit notes, and refunds.

### F7. Invoice business keys lose supplier identity for non-Latin names

**Medium priority · observed canonical-key collision.**

The business-key normalizer removes every character outside ASCII letters and digits. Two different Chinese supplier names with invoice `INV-2026-42` both yielded `invoice::inv202642`. It also lacks the ranker's accent decomposition: names can acquire different identity behavior during normalization and matching.

Even for ASCII names, supplier-name plus invoice-number is only a duplicate hint. Reused annual numbering, corrected documents, multiple legal entities with the same trading name, and invoices versus credit notes need explicit resolution. When both components disappear, the fallback hashes no source identity; it compacts a summary that can recur across documents.

Keep a source occurrence identifier and a separate proposed business key. Preserve Unicode and resolve stable parties where possible. Document the normalization version and never use this current string as the sole uniqueness constraint for allocations.

Evidence: [open-item normalizer](../libs/aven-document-ingest/src/actors/open-item-normalizer/index.ts), lines 13–17 and 61–68; [ranker normalization](../libs/aven-document-ingest/src/reconciliation.ts), lines 72–86.

### F8. Validation status does not establish the facts the ranker consumes

**Medium priority · observed upstream limitation with consequences for future eligibility.**

Invoice validation checks identity presence and net-plus-tax arithmetic on the compact candidate. It does not consume invoice details, even though normalization uses details for outstanding amount, payment observations, bank accounts, issue date, and references. An arithmetic mismatch is `UNKNOWN`, not `FAIL`; it becomes insufficient coverage. That may accommodate adjustments, but it does not validate an adjustment explanation.

Statement validation can report `consistent` when only period ordering is known. The executed case had null transaction amount and missing balances but an ordered period; the result was `consistent`, `coverageBps: 3333`, and an `UNKNOWN` hard balance check. Canonicalization copies the summary status and the ranker does not inspect individual checks or field evidence.

Separate “no contradiction detected” from “the fields required for this match have been verified.” Add detail-level consistency checks and required-evidence checks for the enabled policy. Preserve check results or exact validation references that the decision evaluator can inspect. The current unverified statement coverage correctly prevents these document examples from becoming eligible on that basis alone.

Evidence: [invoice validator](../libs/aven-document-ingest/src/actors/invoice-validator/index.ts), lines 20–47; [statement validator](../libs/aven-document-ingest/src/actors/statement-validator/index.ts), lines 26–62; [eligibility checks](../libs/aven-document-ingest/src/reconciliation.ts), lines 199–207.

### F9. Date handling can turn invalid dates into supporting evidence

**Medium priority · observed comparison defect and missing policy.**

Date comparison truncates a string to ten characters and passes it to JavaScript's date parser. Canonical schemas impose a string-length bound but no valid civil-date constraint. The scenario `2026-02-30` against `2026-03-02` returned a distance of zero because the parser normalized the impossible date.

Dates are absolute distances, so prepayment and late payment lose their directional distinction. `valueDate` is retained but unused. Missing dates and a payment from 2020 for a 2026 invoice do not block pair eligibility; the latter passed when its other fields matched. A bounded retrieval policy is the intended place for a search window, but no such production stage exists yet.

Validate calendar dates without rollover, retain signed distances where temporal meaning matters, and record the policy/window that admitted the pair. Missing dates may remain useful for review but should not silently count as verified temporal context.

Evidence: [date comparator](../libs/aven-document-ingest/src/reconciliation.ts), lines 88–95 and 261–262; [transaction schema](../services/artifact-store/conformance/fixtures/protocol/banking.transaction.v1.json), date properties.

### F10. Ranking differs materially from the prior tool's amount-first behavior

**Medium priority product decision · observed behavior; not necessarily an algorithmic bug.**

The prior tool orders by amount distance, then date distance. The new ranker sums amount, reference, IBAN, name, date, and sign points, then uses amount distance only as a tie-breaker. A near-amount row can therefore outrank an exact-amount row.

Against a €100 invoice, a −€99.75 transaction with matching reference/name/date scored 6,612, while an exact −€100 transaction without those fields scored 4,250. Both correctly remained in review in this example. This may improve relevance when remittance data is strong, but it changes a behavior the user specifically valued in the prior tool. It needs validation against real reviewed pairs.

All supplied transactions receive a candidate, including weak or unrelated rows; the declared `reject` recommendation is never produced. The amount allowance used for scoring is hard-coded to the larger of 100 minor units and 2%, whose economic size differs by currency exponent. This is a ranking allowance, not an automatic amount tolerance—the exactness blocker still applies.

Use an explicit, versioned ranking policy and evaluate candidate recall and reviewer selection. Consider separate exact-amount and plausible-exception groups if that makes review clearer. Do not label the 0–10,000 score as confidence.

Evidence: [scoring and sort](../libs/aven-document-ingest/src/reconciliation.ts), lines 272–348. Prior source: `/home/daniel/src/jaensen/avenCEO-tools/src/lib/server/db.ts`, especially lines 1310–1400.

### F11. Bundled PDF decoding fails in the reviewed local test composition

**High priority ingestion verification issue · observed, upstream of matching.**

The full document-ingest suite ran 39 tests: 34 passed, three failed, and two provider tests were skipped. All failures were the production-bundled PDF decoder cases. Their temporary bundle could not resolve `@napi-rs/canvas`; execution then failed with `ReferenceError: DOMMatrix is not defined`. The worker-presence assertion passed. Running that test file alone reproduced all three failures, so the observation does not depend on concurrent test files in the full suite.

The server imports PDF.js before importing the module intended to install canvas globals. The canvas module's own comment says it must evaluate before PDF.js. That ordering is a concrete investigation lead, but this review did not patch it or establish the complete production-container failure mechanism. Source decoder tests passing does not establish bundle behavior, because dependency resolution and evaluation context differ.

Reproduce this in the actual service build/runtime layout and repair the import/bundling boundary before relying on server PDF ingestion evidence. Keep an isolated executable test that starts with no previously initialized canvas globals. Do not describe the current full ingestion suite as green based only on the focused reconciliation tests.

Evidence: [bundle test](../libs/aven-document-ingest/tests/server-decoder-bundle.test.ts), lines 13–49; [server entry](../libs/aven-document-ingest/src/server.ts), lines 13–20; [canvas initialization](../libs/aven-document-ingest/src/server-pdf-canvas.ts), lines 11–21.

## Scenario results

Amounts below are human-readable equivalents of integer minor-unit test values. Unless noted otherwise, eligibility probes supplied a synthetic known direction and verified coverage to reach the pair gate. Those values are deliberately stronger than current document normalization produces. “Eligible” always means the comparator's output, never a persisted acceptance.

| Scenario | Actual result or source trace | Assessment |
| --- | --- | --- |
| Exact ordinary document-derived invoice and booking | Score 8,175, exact amount/reference, review with unknown-direction and unverified-coverage blockers | Correct abstention when invoked directly; production imports do not schedule this comparison |
| Exact pair with synthetic known direction and verified coverage | Score 8,425, eligible | Positive control for the current rule set |
| Two distinct equal-looking transfers without bank IDs | One candidate, duplicate count two | Defect: F1 |
| Same provider ID in two institutions with the same local account number | Same account and transaction keys | Defect: F2 |
| Corrected amount for the same key and row ordinal | Input reversal changes amount distance from zero to €100 and flips eligibility | Defect: F3 |
| Paid €100 invoice, printed outstanding zero | Canonical amount due is €100 | Semantic defect: F4; historical payment matching still needs the gross amount separately |
| €100 invoice, €40 paid, €60 outstanding | Comparator targets €60; €40 booking has €20 distance | Partial-settlement history is not modeled |
| Same partially paid invoice with outstanding omitted | Comparator targets €100 | Missing-value behavior changes meaning |
| Shared customer reference and a different invoice in the remittance | Eligible, despite unrelated counterparty | Defect: F5 |
| FX debit −€90 with original +USD 100 | Original-amount match, sign conflict | Requires signed/unsigned provider semantics |
| FX credit +€90 with original −USD 100 for a payable | Eligible | Contradictory cash signs are not blocked: F6 |
| Supplier credit note −€100 and incoming €100 refund, direction payable | Sign conflict | Expected-cash-direction contract is missing |
| Offer with otherwise matching fields | Eligible in the synthetic known-direction case | Future policy must gate document kinds; normalization alone is not an obligation decision |
| Two non-Latin suppliers using the same invoice number | Identical business key | Defect: F7 |
| Invalid civil date `2026-02-30` | Zero days from `2026-03-02` | Defect: F9 |
| Matching payment six years before invoice | Eligible, with no date support | Retrieval/policy window absent |
| Invoice reference `INV-2026-42`, remittance `INV202642` | No exact reference match | Recall limitation; boundary rules preserve spaces introduced by punctuation |
| Near amount with rich evidence versus exact amount with sparse evidence | Near row ranks first, 6,612 versus 4,250 | Prior-tool behavior changed: F10 |
| Zero-value invoice with a one-cent payment | Review; nonzero amount difference blocks eligibility | Useful conservative control |
| One Actor request containing 65 candidates | Error: requires 1–64 transaction candidates | Hard comparison boundary; no search/paging coordinator |
| Statement with unknown amounts/balances but ordered period | `consistent`, coverage 3,333 basis points | Validation status is insufficient: F8 |
| 65 statement rows | Existing runtime test passes two publications, 64 plus one, with stable replay identities | Good batching proof, not a 65-candidate reconciliation proof |
| 128 extracted rows | Existing test records `row-limit-reached` | Good conservative signal; source coverage beyond the limit remains unresolved |
| Invoice number `12` inside remittance `3129` | Existing test prevents a reference match | Useful boundary behavior to preserve |
| Supplier IBAN alone or short reference alone | Existing tests keep pair in review | Useful abstention to preserve |
| Import invoice before statement or after statement | Source trace ends at separate canonical facts | Missing product orchestration |
| Two invoices competing for one transaction | Independent comparisons can both look eligible; no acceptance layer exists | Assignment/uniqueness is an extension requirement |
| Batch, split payment, fee, discount, processor payout, or cash receipt | No allocation topology/solver; ordinary pair comparisons only | Must remain explicitly unsupported for automatic settlement |

## Extensibility assessment

### Preserve the current separation of responsibilities

The split into extraction, normalization, fan-out, comparison, and eventual decisions is appropriate. Pure comparison is inexpensive to test. Immutable source occurrences and run inputs make replay and explanation possible. Booked and original monetary values, currency, value date, fees, and source position are retained instead of being reduced to a single score. The API's procedure allowlist and bounded publication shapes are useful constraints.

Continue to keep bank collection and external accounting effects outside the ranker. The HTTP-resource design's captured responses are suitable evidence inputs for bank-specific parsers. Account identity, pagination completion, posted/pending status, and freshness must be proved by those parsers and capture manifests; an HTTP success or cached page cannot establish them by itself. Unattended credential use remains a separate authority from comparing already stored facts.

### Canonical types need another domain pass before becoming allocation keys

The current open item drops buyer identity, reference kinds, individual payment amounts/dates, and much of the payment-state context. A receivable requires matching the paying customer, while the ranker currently compares `supplierName` and supplier IBANs. Flipping `direction` alone will not provide that counterparty model.

The transaction type also lacks explicit provider namespace, posted/pending/reversed status, and structured end-to-end/mandate/creditor references. These become important when importing a bank API in addition to PDFs. Model-generated transaction IDs should not automatically acquire the same identity authority as stable provider-supplied IDs merely because they populate the same string field.

Use separate entities for source occurrence, resolved business transaction, settlement obligation, and allocation. Record resolution provenance and contradictions. Keep signed cash movement distinct from invoice accounting sign, and retain both original obligation and remaining amount. A collection of typed references is more extensible than a flat string list.

### The 64/128 limits belong to ingestion/publication, not finance identity

The ranker Actor accepts 1–64 transactions, fan-out admits offsets only through 127, the facade only accepts offsets 0 and 64, and `banking.transaction@1` caps `sourceOrdinal` at 127. These limits align with the initial PDF extraction protocol but make the supposedly canonical transaction type awkward for a connector capture containing thousands of rows.

A connector could publish bounded segments with local ordinals, but that requires explicit segment identity and a manifest proving completeness. It cannot simply reuse this fan-out over an arbitrary result set. A search coordinator also needs a defined empty result and a complete candidate set: splitting 100 candidates into unrelated 64-row rankings produces multiple rank-one results and loses cross-batch ambiguity/deduplication information.

Separate pair feature computation from ranking a recorded candidate set. Persist a search result with scope, generation, counts, limits, ordered members, and completeness. Publication chunking can then remain a transport concern.

### Generic Actor registration is not yet executable composition

The production ranker reads top-level `payload.openItem` and `payload.transactions` and returns a document-publication result. The generic executor supplies an `ActorStepPayload` with `inputs`, `parameters`, and `configuration`, and parses a generic Actor step result. The production server document skill uses its own document coordinator. Merely registering the finance Actors in a generic registry will not bridge these contracts.

The historical reconciliation E2E uses actors and schemas in `testing.enrichment`, including a different reconciliation predicate. It demonstrates the framework's concept, not execution of these production normalizers/ranker through the generic planner. Build and test the adapter explicitly, including how a `many` transaction input is hydrated and how emitted candidate bindings are associated with each exact transaction.

Evidence: [generic executor](../libs/aven-actors/src/executor.ts), lines 489–510; [production ranker](../libs/aven-document-ingest/src/actors/reconciliation-ranker/index.ts), lines 20–48; [historical E2E](../services/actor-runner/tests/artifact-first-enrichment.e2e.test.ts), its test schema declarations and actors.

### Provenance must explain features, trust, and the whole search

Run-level input lineage exists, which is valuable. Candidate evidence currently maps the whole candidate to the open item and only `/transactionDedupKey` to one transaction's `/dedupKey`. It does not identify which reference matched, which fields support a score, or which duplicate observations conflicted. Fan-out evidence maps the row, while inherited account currency and validation status come from other locations. Those dependencies can be reconstructed from run inputs, but the feature explanation is not complete by itself.

Add structured feature evidence with exact input occurrences and paths, plus links to validation and the search result. Preserve all duplicate observations used in a resolution. Current domain-key strings and schemas with empty `referenceRules` do not replace artifact identity or navigational references.

The facade validates a client publication's allowed shape and attaches server-owned attribution; it does not rerun the financial comparison. Therefore a `deterministic` provenance flag describes the declared procedure, not independent verification of its result. A future authoritative decision should verify its required inputs and policy predicates in the admitted execution path. This is a trust-design observation; no intrusion or publication-forgery test was performed.

Evidence: [ranker evidence](../libs/aven-document-ingest/src/actors/reconciliation-ranker/index.ts), lines 48–81; [fan-out evidence](../libs/aven-document-ingest/src/actors/statement-transaction-fanout/index.ts), lines 46–58; [client publication](../services/aven-api/src/lib/server/artifacts/service.ts), lines 1000–1083.

### Make versioning and replay support corrections deliberately

The ranker records `invoice-transaction-v1`, and its schema fixes that value with `const`. The document coordinator's publication identity includes source, stage, inputs, and `procedureVersion`, whose current choices are `client-v1` and `server-v1`. Normalization, identity resolution, and ranking do not have independently represented policy/configuration versions.

An implementation update that changes output for the same inputs needs a new semantic version in the publication identity. Otherwise a legitimate correction can reuse an identity intended for replay of the old result. Add normalizer, resolver, matcher, and decision-policy versions where their semantics differ, with tests proving same-version replay and intentional new-version recomputation. Plan schema migrations before introducing typed references or removing the source-ordinal ceiling.

Evidence: [publication identity](../libs/aven-document-ingest/src/runtime.ts), lines 656–662; [candidate schema](../services/artifact-store/conformance/fixtures/protocol/reconciliation.match-candidate.v1.json), `matcherVersion`.

### Allocation, concurrency, and review must share a durable decision model

The paper correctly identifies global assignment and separate decisions. Implementing a maximum-weight matching function alone will not prevent two workers from accepting the same money. Acceptance needs a transactionally enforced claim on current open-item and transaction versions, explicit allocated amounts, idempotent publication, and recoverable projection updates. Account for crashes between publication and projection and for stale UI submissions.

Model rejection and supersession as durable, version-scoped decisions. Support review from either the invoice or bank-row perspective, show exact sources, and preserve the distinction between document attachment, reconciled settlement, and external booking. Partial and batch allocations need conservation of amounts and currency, not repeated full-amount links. Refunds/reversals need separate events rather than deletion of an old match.

These are extension requirements, not findings that the current code already violates an implemented allocation invariant. No allocation layer exists to test yet.

## What to retain from avenCEO-tools

The supplied prototype is ahead in the practical review journey even though its storage approach is less suited to immutable provenance.

| Prior behavior | Current implementation | Recommendation |
| --- | --- | --- |
| Compare account and original-currency amounts and expose the basis | Retained in the comparator and candidate payload | Keep; strengthen signed FX semantics |
| Order by amount distance, then date distance | Replaced by a weighted score | Treat as a deliberate product experiment and compare with reviewed data |
| Start from a bank row and list candidate documents | Current comparator starts from an invoice; no product retrieval flow | Support both directions over one candidate/decision model |
| Preview source, compare fields, select documents | Proposed but not implemented | Restore this as the first useful user journey |
| Group related documents and suppress groups already attached to the selected transaction | Only transaction-key grouping exists; no attachment/acceptance projection | Retain the practical filtering through explicit resolution and allocation state |
| Richer document duplicate hint using kind, reference, date, party, amount, currency; source ID fallback | Current business hint uses supplier name and invoice number, summary fallback | Preserve richer evidence without treating either heuristic as proof of identity |

Prior files inspected: `/home/daniel/src/jaensen/avenCEO-tools/src/lib/server/db.ts`, lines 1199–1428; `/home/daniel/src/jaensen/avenCEO-tools/src/lib/components/transactions/StagedDocumentPicker.svelte`. This comparison refers to the local checkout supplied for prior art, not a separately verified release.

## Validation evidence and remaining uncertainty

| Executed check | Result | What it establishes |
| --- | --- | --- |
| Document-ingest package, Vitest 4.1.10 | 34 passed, 3 failed, 2 skipped out of 39 | All 12 existing reconciliation cases pass; bundled PDF cases fail as described in F11 |
| Application document Actors, Bun test | 14 passed | Coordinator behavior, synthetic model paths, publication batching and replay with a recording gateway |
| API artifact tests, Vitest 4.1.10 | 7 passed | Allowed publication shape and attribution using the test backend |
| Historical Actor enrichment E2E, Vitest 4.1.10 | 3 passed | Test-actor planning/affordance behavior and failure handling |
| Temporary scenario harness against actual functions | Completed successfully, including assertions for the documented counterexamples | Concrete financial-logic behavior; not a measurement of population accuracy |

Dependencies were installed from the frozen lockfile in the isolated review worktree, with install scripts disabled. Generated Svelte configuration was created for test setup. An initial app test invocation used the wrong runner; it is not counted as a product failure. The final application result above uses `bun test`, as its imports require. No tracked implementation or lockfile changed.

The current corpus is primarily hand-authored regression data. It has no demonstrated distribution of real reviewed invoice/booking pairs, no held-out accuracy set, and no end-to-end accepted allocation flow. Provider goldens are optional and cover an invoice and receipt, not a bank-statement-to-invoice reconciliation pair. I did not rerun Rust schema tests, full platform E2E, a provider-backed extraction, or a live review journey. Schema acceptance alone would not establish semantic identity or money conservation.

The diagnostic scenarios are deliberately discriminating counterexamples; they do not establish how frequently these problems occur in customer data. In particular, eligible synthetic fixtures do not demonstrate that current document imports auto-accept anything.

### Tests that would most improve confidence

1. Preserve two legitimate equal-looking payments, coalesce only proven repeated observations, and reject unresolved contradictory observations. Shuffle input and arrival order and assert the same resolved outcome.
2. Cover paid invoices, deposits, partial payments, supplier/customer credit notes, cash receipts, and payment receipts. Assert original amount, remaining obligation, expected cash direction, and allocated amount separately.
3. Use typed references with shared mandates/customer numbers, conflicting invoice identifiers, invoice-number reuse, Unicode suppliers, domestic/masked accounts, and multiple institutions.
4. Prove the real product path: persist an invoice and statement through the facade and Artifact Store, retrieve the candidates, invoke the production ranker, review a choice, persist a decision, and reload it. Test both import orders and a result set exceeding one batch.
5. Once decisions exist, race two workers, reject stale reviews, crash around publication/projection, and replay corrections and matcher upgrades. Assert allocation conservation and one current answer.
6. Maintain a separate reviewed corpus for retrieval recall at a chosen candidate count, ranking quality, abstention, and eventual automatic precision. Split related documents and duplicate observations together so the evaluation set does not repeat the same business cases from development.

The documented [test constraints](invoice-statement-reconciliation.md#current-validation-corpus-and-constraints) remain broadly accurate. This review adds counterexamples showing that the next investment should include semantic tests, not simply more variants of the existing happy path.

## Recommended order of work

First, resolve F1–F4 and F7 in the domain model: occurrence versus resolved identity, contradictions, account scope, and the distinction between original and outstanding amounts. Confirm F11 in the production build layout so ingestion has dependable evidence. These changes prevent downstream state from being built on ambiguous facts.

Next, build a bounded customer-scoped search result and the smallest complete manual review journey, including durable acceptance and rejection. Preserve the useful amount/currency/date display and preview behavior from `avenCEO-tools`. Prove that journey with actual persistence and the production Actors.

Then tighten references, cash-direction semantics, validation evidence, temporal scope, and document-kind policy. Keep `pairEligible` explicitly narrower than an acceptance decision, and test every condition the policy claims to enforce. Introduce global allocation and concurrency constraints before allowing automatic acceptance.

Finally, evaluate on reviewed data and run the intended automatic policy in observation-only mode before enabling it. Connector automation and richer allocation topologies can then extend the same evidence and decision model without changing what “this booking settled this invoice” means.
