//! Transport-neutral Artifact Store v1 application kernel.

mod builtins;
mod prepare;
mod validation;

pub use builtins::{
    builtin_type_definitions, BANKING_STATEMENT, BANKING_TRANSACTION,
    BOOKKEEPING_INVOICE_CANDIDATE, BOOKKEEPING_INVOICE_VALIDATION, BOOKKEEPING_OPEN_ITEM,
    CORE_BUNDLE, CORE_CONTENT_CLASSIFICATION, CORE_CONTENT_DESCRIPTION,
    CORE_DOCUMENT_CLASSIFICATION, CORE_FILE, CORE_FILE_INSPECTION, DOCS_EXTRACTED_TEXT, DOCS_PAGE,
    DOCS_TEXT_LAYOUT, RECONCILIATION_MATCH_CANDIDATE,
};
pub use prepare::{
    prepare_publication, ExistingArtifact, PreparedArtifact, PreparedPublication, PreparedReference,
};
pub use validation::{validate_type_definition, CoreError, Limits, TypeCatalog};
