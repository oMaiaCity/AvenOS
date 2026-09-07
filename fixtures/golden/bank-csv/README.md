# Bank CSV specimens

These eight synthetic exports exercise account-statement recognition without
redistributing customer transactions. They contain fictional payments and familiar
example IBANs, not accounts to pay. The adjacent `cases.json` records source URLs,
source quality, encoding, delimiter, exact cells and independently authored expected
facts. Values were not obtained from a model.

| Example | Source evidence | Important distinction |
| --- | --- | --- |
| ING-DiBa | Historical 2014 importer definition | Repeated currency headers, preamble, German decimals; no own-account identifier |
| Hamburger Sparkasse | Pinned Haspa importer documentation | Own account versus counterparty, booking status, two-digit year ambiguity |
| N26 German | Pinned importer header definition | Counterparty account is not the customer's own account |
| N26 English | Same importer, newer header generation | Booking/value dates, quoted multiline field, UTF-8 BOM, Chinese counterparty and original-currency amount |
| Revolut | Pinned public importer specimen header | Completed versus pending/reverted, start versus completion time; no own-account identifier |
| BNP Paribas | Pinned importer definition | Headerless rows, separate balance preamble, Latin-1, no explicit currency |
| Caisse d'Epargne | Pinned public importer specimen header | Debit/credit columns and three different dates; no explicit currency |
| Rabobank | Issuer's English specification v1.2 | 26 fields, decimal comma inside comma-separated quoted fields, account-scoped sequence numbers and running balances |

N26's [own documentation](https://support.n26.com/en-eu/account-and-personal-details/bank-statements-and-confirmations/how-to-get-bank-statement-n26)
confirms CSV export, but does not guarantee the captured headers. Community importer
definitions are evidence of observed formats, not bank-certified current contracts.
Synthetic BOM, multiline and preamble variations are labelled in the manifest.

Rabobank's [format catalogue](https://www.rabobank.nl/en/business/support/online-bankieren/formats)
links the official specification and a
[downloadable specimen archive](https://media.rabobank.com/m/feb954378e84789/original/voorbeeldbestand-csv-extensie-excel_29933460-zip.zip).
The archive was retrieved and inspected; its SHA-256 and single CSV member are recorded
in `issuerDownloads`. That original specimen is Dutch and dated 2017. The checked-in
synthetic file uses the English specification. Neither establishes current production
coverage for every Rabobank account or export language.

## Recognition and human confirmation

The current detector admits only exact Rabobank English and Haspa column profiles
with one explicit EUR IBAN, unambiguous dates, complete valid rows and no unsupported
FX/reversal fields. It does not guess a currency, century, column mapping or missing
account. A recognized layout does not establish who issued the file or whether it is
authentic. Institution and unstated period balances remain unknown.

Of the eight checked-in exports, only Rabobank passes all current admission checks.
The Haspa file deliberately uses a two-digit year and is blocked; a four-digit-year
variant is covered by a test. The other formats remain negative intake cases until
their missing context and mapping contracts are implemented. They must not be
advertised as supported financial imports simply because their CSV cells decode.

Passing detection only enables a mandatory **document-type** human gate. No statement
candidate, transaction or reconciliation proposal may be produced from that CSV
until an accepted confirmation is committed for its source artifact, content digest,
detector version and detection artifact. Rejection, missing confirmation and failed
publication leave it blocked. Confirming the document does not accept an invoice match.

Limits are 1 MB, 64 columns and 128 transaction records; exceeding a limit rejects the
file, never imports a prefix. Empty exports, mixed accounts/currencies, balance
contradictions and unsupported row states are not admitted. Financial authenticity,
full-period completeness and statistical recognition accuracy are not proven by this
small corpus. Tests are described in the
[build-and-test handbook](../../../docs/operations/build-and-test.md).
