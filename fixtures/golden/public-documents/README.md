# Public issuer specimens

These seven issuer-published examples add layouts and failure cases that our own
synthetic documents cannot supply. They are public specimens, not a customer's
completed accounting quarter. The PDFs are downloaded separately and are not
redistributed in this repository; availability does not imply a redistribution licence.

`cases.json` pins the exact source URL, SHA-256, page count and reviewed scope.
All 17 pages were rendered and visually reviewed. The local cache is ignored by Git.

| Source | What makes the specimen useful | Executable coverage |
| --- | --- | --- |
| Berlin justice cost notice | Empty principal; conditional late fee must not become a liability | Checksum, decoding, two pages; live model must not invent an open item |
| Telekom mobile | Repeated annotated page miniatures, placeholder dates, printed gross/tax that should not be silently corrected | Checksum, decoding, three pages only |
| Telekom business | Placeholder totals mixed with concrete examples elsewhere in the guide | Checksum, decoding, five pages only |
| Toll Collect | Trip charges, cancellation and credit detail; not a bank statement | Checksum, decoding, three pages only |
| Austrian WKO | Subsidy-adjusted payment differs from invoice value | Checksum, decoding, one page only |
| Shanghai tax authority VAT form | Blank supplier and monetary fields | Checksum, decoding, one page; live extraction must preserve unknowns and create no open item |
| Shanghai electronic invoice forms | Ordinary and special blank forms in one document | Checksum, decoding, two pages only |

The two live negative tests cannot pass merely because extraction failed. They
allow normalization to stop for missing finance fields, but require preceding
stages to finish; invoice classification must produce an invoice candidate. Blank
money remains null, never zero. No bank transaction or reconciliation decision may
be emitted. The other five specimens are **not** financial extraction goldens yet.

The downloader accepts only these explicit sources, checks a 16 MB size limit and
30-second download deadline, verifies the reviewed hash, and refuses to overwrite
mismatched cached bytes. A changed upstream document needs a new human review, not
an automatic checksum refresh. Running the ordinary suite does not download or send
anything to a model. See the [opt-in test procedures](../../../docs/operations/build-and-test.md#use-a-real-document-model-in-the-local-proof).
