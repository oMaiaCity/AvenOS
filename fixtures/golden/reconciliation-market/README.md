# Synthetic market documents

These 13 visibly fictional PDFs exercise documents a German-first reconciliation
workflow encounters: business invoices, a credit note, cash and restaurant receipts,
utility prepayments, an official cost notice, a statement, and Austrian, French,
Dutch, Polish and Chinese documents. They contain no real liabilities or customer
data. Tax rates are fixture values, not current tax guidance.

`cases.json` owns the authored text and expected fields. `build.py` produces the
PDFs without consulting a model. Every page was rendered and visually inspected;
mixed Chinese/Latin text uses separate embedded fonts to preserve both scripts.

Three independent checks cover different claims:

- `market-corpus.test.ts` decodes all 13 PDFs with the production decoder, checks
  every authored line and the statement balance, and exercises seven relationship
  scenarios through the production normalizers and matcher.
- `market-provider.e2e.test.ts` submits all 13 documents to an explicitly configured
  real model. It checks classification and authored financial fields, extraction
  provenance, and no automatic acceptance. The official notice is exploratory:
  preserved reference/amount text and no automatic decision are asserted, not a
  completed official-liability extraction.
- The native journey imports `de-business-invoice.pdf` on both Device and Server
  after confirming the CSV statement. A separate physical review decision must
  accept the invoice relationship with its original evidence still linked.

The seven policy scenarios distinguish exact payment, refund, remaining balance,
two partial payments, original-currency FX, cash without a matching bank entry,
and card payment including a tip. They do not implement allocations, aggregate
partial payments, or invent bank entries for cash. Even an exact pair remains
human-reviewed while direction and statement coverage are unverified.

Missing tax is explicitly different from printed zero: the Chinese private receipt
has unknown tax, while the French invoice prints zero. Expected values must not be
changed merely to make a model response pass.

These are clean, small, single-page documents with authored ground truth, not a
held-out real-world benchmark. They do not establish quarter-level precision/recall,
photo robustness, layout diversity within each market, or official-document support.
See the [public issuer specimens](../public-documents/README.md),
[bank CSV fixtures](../bank-csv/README.md), and
[test procedures](../../../docs/operations/build-and-test.md#use-a-real-document-model-in-the-local-proof).
