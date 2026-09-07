use aven_artifact_store_contract::{parse_canonical, TypeDefinition};

pub const CORE_FILE: &str = "core.file";
pub const CORE_BUNDLE: &str = "core.bundle";
pub const CORE_FILE_INSPECTION: &str = "core.file-inspection";
pub const DOCS_PAGE: &str = "docs.page";
pub const CORE_CONTENT_CLASSIFICATION: &str = "core.content-classification";
pub const CORE_CONTENT_DESCRIPTION: &str = "core.content-description";
pub const DOCS_EXTRACTED_TEXT: &str = "docs.extracted-text";
pub const DOCS_TEXT_LAYOUT: &str = "docs.text-layout";
pub const CORE_DOCUMENT_CLASSIFICATION: &str = "core.document-classification";
pub const BOOKKEEPING_INVOICE_CANDIDATE: &str = "bookkeeping.invoice-candidate";
pub const BOOKKEEPING_INVOICE_VALIDATION: &str = "bookkeeping.invoice-validation";
pub const BOOKKEEPING_OPEN_ITEM: &str = "bookkeeping.open-item";
pub const BANKING_STATEMENT: &str = "banking.statement";
pub const BANKING_TRANSACTION: &str = "banking.transaction";
pub const RECONCILIATION_MATCH_CANDIDATE: &str = "reconciliation.match-candidate";

const CORE_FILE_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/core.file.v1.json");
const CORE_BUNDLE_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/core.bundle.v1.json");
const CORE_FILE_INSPECTION_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/core.file-inspection.v1.json");
const CORE_FILE_INSPECTION_V2_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/core.file-inspection.v2.json");
const DOCS_PAGE_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/docs.page.v1.json");
const CORE_CONTENT_CLASSIFICATION_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/core.content-classification.v1.json");
const CORE_CONTENT_DESCRIPTION_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/core.content-description.v1.json");
const DOCS_EXTRACTED_TEXT_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/docs.extracted-text.v1.json");
const DOCS_TEXT_LAYOUT_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/docs.text-layout.v1.json");
const CORE_DOCUMENT_CLASSIFICATION_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/core.document-classification.v1.json");
const BOOKKEEPING_INVOICE_CANDIDATE_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/bookkeeping.invoice-candidate.v1.json");
const BOOKKEEPING_INVOICE_CANDIDATE_V2_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/bookkeeping.invoice-candidate.v2.json");
const BOOKKEEPING_INVOICE_VALIDATION_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/bookkeeping.invoice-validation.v1.json");
const BOOKKEEPING_INVOICE_DETAILS_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/bookkeeping.invoice-details.v2.json");
const BANKING_ACCOUNT_STATEMENT_CANDIDATE_JSON: &[u8] = include_bytes!(
    "../../../conformance/fixtures/protocol/banking.account-statement-candidate.v2.json"
);
const BANKING_STATEMENT_VALIDATION_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/banking.statement-validation.v1.json");
const BOOKKEEPING_OPEN_ITEM_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/bookkeeping.open-item.v1.json");
const BANKING_STATEMENT_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/banking.statement.v1.json");
const BANKING_TRANSACTION_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/banking.transaction.v1.json");
const RECONCILIATION_MATCH_CANDIDATE_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/reconciliation.match-candidate.v1.json");
const RECONCILIATION_MATCH_CANDIDATE_V2_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/reconciliation.match-candidate.v2.json");
const INTENT_DECLARATION_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/intent.declaration.v1.json");
const RECONCILIATION_DECISION_JSON: &[u8] =
    include_bytes!("../../../conformance/fixtures/protocol/reconciliation.decision.v1.json");

/// Exact source-controlled built-ins registered by the first migration.
///
/// # Errors
///
/// Returns an error if a source fixture is not valid Artifact JSON or does not match
/// the closed type-definition DTO.
pub fn builtin_type_definitions() -> Result<Vec<TypeDefinition>, crate::CoreError> {
    [
        CORE_FILE_JSON,
        CORE_BUNDLE_JSON,
        CORE_FILE_INSPECTION_JSON,
        CORE_FILE_INSPECTION_V2_JSON,
        DOCS_PAGE_JSON,
        CORE_CONTENT_CLASSIFICATION_JSON,
        CORE_CONTENT_DESCRIPTION_JSON,
        DOCS_EXTRACTED_TEXT_JSON,
        DOCS_TEXT_LAYOUT_JSON,
        CORE_DOCUMENT_CLASSIFICATION_JSON,
        BOOKKEEPING_INVOICE_CANDIDATE_JSON,
        BOOKKEEPING_INVOICE_CANDIDATE_V2_JSON,
        BOOKKEEPING_INVOICE_VALIDATION_JSON,
        BOOKKEEPING_INVOICE_DETAILS_JSON,
        BANKING_ACCOUNT_STATEMENT_CANDIDATE_JSON,
        include_bytes!("../../../conformance/fixtures/protocol/banking.csv-statement-detection.v1.json"),
        include_bytes!("../../../conformance/fixtures/protocol/banking.csv-statement-confirmation.v1.json"),
        BANKING_STATEMENT_VALIDATION_JSON,
        BOOKKEEPING_OPEN_ITEM_JSON,
        BANKING_STATEMENT_JSON,
        BANKING_TRANSACTION_JSON,
        RECONCILIATION_MATCH_CANDIDATE_JSON,
        RECONCILIATION_MATCH_CANDIDATE_V2_JSON,
        RECONCILIATION_DECISION_JSON,
        INTENT_DECLARATION_JSON,
    ]
    .into_iter()
    .map(|bytes| {
        let canonical = parse_canonical(bytes, true)?;
        let normalized = canonical.canonical_bytes();
        Ok(serde_json::from_slice(&normalized)?)
    })
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use aven_artifact_store_contract::TypeKey;

    #[test]
    fn reconciliation_payloads_validate_against_registered_builtins() {
        let catalog = crate::TypeCatalog::from_definitions(builtin_type_definitions().unwrap())
            .expect("built-ins should register");
        let samples: [(&str, &[u8]); 4] = [
            (
                BOOKKEEPING_OPEN_ITEM,
                br#"{"amountDueMinor":1200,"amountPaidMinor":null,"businessKey":"invoice:acme:re42","businessKeyBasis":"supplier-invoice-number","currency":"EUR","direction":"unknown","documentKind":"invoice","dueDate":"2026-08-30","grossMinor":1200,"invoiceNumber":"RE-42","issueDate":"2026-08-15","orderNumber":null,"references":["RE-42"],"summary":"Invoice RE-42.","supplierIbans":[],"supplierName":"ACME GmbH","validationStatus":"consistent"}"#,
            ),
            (
                BANKING_STATEMENT,
                br#"{"accountHolder":"Aven GmbH","accountIdentityBasis":"iban","accountRef":"iban:DE89","closingBalanceMinor":8800,"coverage":"verified","currency":"EUR","institutionName":"Example Bank","openingBalanceMinor":10000,"periodEnd":"2026-08-31","periodStart":"2026-08-01","statementKind":"monthly-statement","summary":"August statement.","transactionCount":1,"validationStatus":"consistent"}"#,
            ),
            (
                BANKING_TRANSACTION,
                br#"{"accountRef":"iban:DE89","amountMinor":-1200,"balanceAfterMinor":8800,"bookingDate":"2026-08-18","counterpartyIban":null,"counterpartyName":"ACME GmbH","dedupBasis":"provider-id","dedupKey":"provider:iban:DE89:tx42","description":"Invoice RE-42","exchangeRate":null,"foreignExchangeFeeBps":null,"fxSurchargeMinor":null,"originalAmountMinor":null,"originalCurrency":null,"providerTransactionId":"tx42","sourceOrdinal":0,"sourceRow":17,"statementCoverage":"verified","statementValidationStatus":"consistent","title":"SEPA transfer","valueDate":"2026-08-18","currency":"EUR"}"#,
            ),
            (
                RECONCILIATION_MATCH_CANDIDATE,
                br#"{"amountDistanceMinor":0,"amountMatchBasis":"account","blockers":["open-item-direction-unknown"],"counterpartyMatch":"exact","dueDateDistanceDays":12,"duplicateCount":1,"ibanMatch":false,"issueDateDistanceDays":3,"matchedTransactionAmountMinor":-1200,"matchedTransactionCurrency":"EUR","matcherVersion":"invoice-transaction-v1","openItemBusinessKey":"invoice:acme:re42","pairEligible":false,"rank":1,"rankScore":8250,"reasons":["exact-account-amount"],"recommendation":"review","referenceMatch":"exact","signMatch":"unknown","transactionDedupKey":"provider:iban:DE89:tx42"}"#,
            ),
        ];

        for (type_key, bytes) in samples {
            let key = TypeKey::new(type_key).expect("sample type key should be valid");
            let registered = catalog.get(&key, 1).expect("sample built-in should exist");
            let payload = parse_canonical(bytes, true).expect("sample payload should be canonical");
            catalog
                .validate_payload(registered, &payload)
                .unwrap_or_else(|error| panic!("{type_key} sample failed validation: {error}"));
            if type_key == RECONCILIATION_MATCH_CANDIDATE {
                let current = catalog
                    .get(&key, 2)
                    .expect("current match schema should exist");
                let mut value: serde_json::Value = serde_json::from_slice(bytes).unwrap();
                value["matcherVersion"] = "invoice-transaction-v2".into();
                let missing_ordinal =
                    parse_canonical(&serde_json::to_vec(&value).unwrap(), true).unwrap();
                assert!(catalog.validate_payload(current, &missing_ordinal).is_err());
                value["transactionInputOrdinal"] = 0.into();
                let current_payload =
                    parse_canonical(&serde_json::to_vec(&value).unwrap(), true).unwrap();
                catalog
                    .validate_payload(current, &current_payload)
                    .expect("current match requires exact occurrence ordinal");
            }
        }
    }
}
