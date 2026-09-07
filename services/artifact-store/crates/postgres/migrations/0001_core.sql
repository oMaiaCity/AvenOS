CREATE TABLE artifact_store.store_state (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    store_epoch uuid NOT NULL,
    write_mode text NOT NULL CHECK (write_mode IN ('normal', 'reconciling')),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE artifact_store.artifact_scopes (
    id uuid PRIMARY KEY,
    next_sequence bigint NOT NULL DEFAULT 0 CHECK (next_sequence >= 0)
);

CREATE TABLE artifact_store.artifact_type_versions (
    type_key text NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    schema_profile_id text NOT NULL,
    payload_schema jsonb NOT NULL,
    blob_policy text NOT NULL CHECK (blob_policy IN ('forbidden', 'optional', 'required')),
    reference_rules jsonb NOT NULL,
    type_definition_sha256 char(64) NOT NULL CHECK (type_definition_sha256 ~ '^[0-9a-f]{64}$'),
    created_at timestamptz NOT NULL,
    PRIMARY KEY (type_key, version),
    UNIQUE (type_key, version, type_definition_sha256)
);

CREATE TABLE artifact_store.artifact_blobs (
    sha256 char(64) PRIMARY KEY CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    length bigint NOT NULL CHECK (length >= 0),
    bytes bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK (octet_length(bytes) = length),
    UNIQUE (sha256, length)
);

CREATE TABLE artifact_store.upload_claims (
    claim_id uuid PRIMARY KEY,
    scope_id uuid NOT NULL REFERENCES artifact_store.artifact_scopes(id) ON DELETE RESTRICT,
    publisher_issuer text NOT NULL,
    publisher_subject text NOT NULL,
    blob_sha256 char(64) NOT NULL,
    blob_length bigint NOT NULL CHECK (blob_length >= 0),
    declared_media_type text NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_publication_id uuid,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (blob_sha256, blob_length)
        REFERENCES artifact_store.artifact_blobs(sha256, length) ON DELETE RESTRICT,
    UNIQUE (claim_id, scope_id, publisher_issuer, publisher_subject, blob_sha256, blob_length)
);

CREATE TABLE artifact_store.publications (
    scope_id uuid NOT NULL REFERENCES artifact_store.artifact_scopes(id) ON DELETE RESTRICT,
    publication_id uuid NOT NULL,
    scope_sequence bigint NOT NULL CHECK (scope_sequence > 0),
    committed_store_epoch uuid NOT NULL,
    command_version integer NOT NULL CHECK (command_version = 1),
    kind text NOT NULL CHECK (kind IN ('roots', 'run')),
    publisher_issuer text NOT NULL,
    publisher_subject text NOT NULL,
    root_actor jsonb,
    publication_request_sha256 char(64) NOT NULL CHECK (publication_request_sha256 ~ '^[0-9a-f]{64}$'),
    result_mapping jsonb NOT NULL,
    run_id uuid,
    committed_at timestamptz NOT NULL,
    PRIMARY KEY (scope_id, publication_id),
    UNIQUE (scope_id, scope_sequence),
    UNIQUE (scope_id, publication_id, publication_request_sha256),
    CHECK ((kind = 'roots' AND root_actor IS NOT NULL AND run_id IS NULL)
        OR (kind = 'run' AND root_actor IS NULL AND run_id IS NOT NULL))
);

CREATE TABLE artifact_store.production_runs (
    id uuid NOT NULL,
    scope_id uuid NOT NULL,
    publication_id uuid NOT NULL,
    procedure_key text NOT NULL,
    procedure_version text NOT NULL,
    initiator_actor jsonb NOT NULL,
    executor_actor jsonb NOT NULL,
    parameters jsonb NOT NULL,
    implementation jsonb NOT NULL,
    receipt jsonb NOT NULL,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (scope_id, id),
    UNIQUE (scope_id, publication_id),
    FOREIGN KEY (scope_id, publication_id)
        REFERENCES artifact_store.publications(scope_id, publication_id) ON DELETE RESTRICT
);

CREATE TABLE artifact_store.artifact_records (
    id uuid NOT NULL,
    scope_id uuid NOT NULL,
    publication_id uuid NOT NULL,
    publication_ordinal integer NOT NULL CHECK (publication_ordinal >= 0),
    local_key text NOT NULL,
    producer_run_id uuid,
    output_role text,
    output_ordinal integer CHECK (output_ordinal >= 0),
    created_at timestamptz NOT NULL,
    PRIMARY KEY (scope_id, id),
    UNIQUE (scope_id, publication_id, local_key),
    UNIQUE (scope_id, publication_id, publication_ordinal),
    UNIQUE (scope_id, producer_run_id, output_role, output_ordinal),
    FOREIGN KEY (scope_id, publication_id)
        REFERENCES artifact_store.publications(scope_id, publication_id) ON DELETE RESTRICT,
    FOREIGN KEY (scope_id, producer_run_id)
        REFERENCES artifact_store.production_runs(scope_id, id) ON DELETE RESTRICT,
    CHECK ((producer_run_id IS NULL AND output_role IS NULL AND output_ordinal IS NULL)
        OR (producer_run_id IS NOT NULL AND output_role IS NOT NULL AND output_ordinal IS NOT NULL))
);

CREATE TABLE artifact_store.artifact_contents (
    artifact_id uuid NOT NULL,
    scope_id uuid NOT NULL,
    type_key text NOT NULL,
    type_version integer NOT NULL,
    type_definition_sha256 char(64) NOT NULL,
    payload jsonb NOT NULL,
    blob_sha256 char(64),
    blob_length bigint CHECK (blob_length >= 0),
    artifact_sha256 char(64) NOT NULL CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
    PRIMARY KEY (scope_id, artifact_id),
    UNIQUE (scope_id, artifact_id, artifact_sha256),
    FOREIGN KEY (scope_id, artifact_id)
        REFERENCES artifact_store.artifact_records(scope_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (type_key, type_version, type_definition_sha256)
        REFERENCES artifact_store.artifact_type_versions(type_key, version, type_definition_sha256) ON DELETE RESTRICT,
    FOREIGN KEY (blob_sha256) REFERENCES artifact_store.artifact_blobs(sha256) ON DELETE RESTRICT,
    CHECK ((blob_sha256 IS NULL AND blob_length IS NULL)
        OR (blob_sha256 IS NOT NULL AND blob_length IS NOT NULL))
);

CREATE TABLE artifact_store.artifact_references (
    scope_id uuid NOT NULL,
    source_artifact_id uuid NOT NULL,
    target_artifact_id uuid NOT NULL,
    role text NOT NULL,
    ordinal integer NOT NULL CHECK (ordinal >= 0),
    attributes jsonb NOT NULL,
    target_artifact_sha256 char(64) NOT NULL,
    PRIMARY KEY (scope_id, source_artifact_id, role, ordinal),
    FOREIGN KEY (scope_id, source_artifact_id)
        REFERENCES artifact_store.artifact_records(scope_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (scope_id, target_artifact_id, target_artifact_sha256)
        REFERENCES artifact_store.artifact_contents(scope_id, artifact_id, artifact_sha256) ON DELETE RESTRICT
);

CREATE TABLE artifact_store.artifact_run_inputs (
    scope_id uuid NOT NULL,
    run_id uuid NOT NULL,
    role text NOT NULL,
    ordinal integer NOT NULL CHECK (ordinal >= 0),
    input_artifact_id uuid NOT NULL,
    PRIMARY KEY (scope_id, run_id, role, ordinal),
    FOREIGN KEY (scope_id, run_id)
        REFERENCES artifact_store.production_runs(scope_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (scope_id, input_artifact_id)
        REFERENCES artifact_store.artifact_records(scope_id, id) ON DELETE RESTRICT
);

CREATE TABLE artifact_store.artifact_evidence (
    scope_id uuid NOT NULL,
    run_id uuid NOT NULL,
    output_artifact_id uuid NOT NULL,
    output_locator jsonb NOT NULL,
    input_role text NOT NULL,
    input_ordinal integer NOT NULL,
    input_locator jsonb NOT NULL,
    ordinal integer NOT NULL CHECK (ordinal >= 0),
    PRIMARY KEY (scope_id, run_id, ordinal),
    FOREIGN KEY (scope_id, run_id)
        REFERENCES artifact_store.production_runs(scope_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (scope_id, output_artifact_id)
        REFERENCES artifact_store.artifact_records(scope_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (scope_id, run_id, input_role, input_ordinal)
        REFERENCES artifact_store.artifact_run_inputs(scope_id, run_id, role, ordinal) ON DELETE RESTRICT
);

CREATE TABLE artifact_store.publication_id_exclusions (
    scope_id uuid NOT NULL,
    publication_id uuid NOT NULL,
    publisher_issuer text NOT NULL,
    publisher_subject text NOT NULL,
    publication_request_sha256 char(64) NOT NULL,
    original_store_epoch uuid,
    original_scope_sequence bigint,
    original_result_mapping jsonb NOT NULL,
    reason text NOT NULL,
    reconciled_at timestamptz NOT NULL,
    PRIMARY KEY (scope_id, publication_id)
);

CREATE INDEX publications_feed_idx
    ON artifact_store.publications(scope_id, scope_sequence);
CREATE INDEX artifact_records_publication_idx
    ON artifact_store.artifact_records(scope_id, publication_id, publication_ordinal);

CREATE FUNCTION artifact_store.reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'artifact store history is immutable' USING ERRCODE = '55000';
END;
$$;

DO $$
DECLARE
    relation_name text;
BEGIN
    FOREACH relation_name IN ARRAY ARRAY[
        'artifact_type_versions', 'artifact_blobs', 'publications', 'production_runs',
        'artifact_records', 'artifact_contents', 'artifact_references',
        'artifact_run_inputs', 'artifact_evidence', 'publication_id_exclusions'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER reject_history_mutation BEFORE UPDATE OR DELETE ON artifact_store.%I FOR EACH ROW EXECUTE FUNCTION artifact_store.reject_mutation()',
            relation_name
        );
    END LOOP;
END;
$$;
