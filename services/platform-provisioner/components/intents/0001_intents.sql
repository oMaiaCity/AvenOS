CREATE TABLE aven_intents.intents (
    id uuid PRIMARY KEY,
    owner_subject_id uuid NOT NULL,
    trigger_kind text NOT NULL CHECK (trigger_kind IN ('human', 'agent', 'skill', 'system')),
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 512),
    intent_type text NOT NULL DEFAULT 'intent' CHECK (char_length(intent_type) BETWEEN 1 AND 128),
    source_label text NOT NULL DEFAULT 'Conversation' CHECK (char_length(source_label) BETWEEN 1 AND 256),
    deadline text CHECK (deadline IS NULL OR char_length(deadline) BETWEEN 1 AND 128),
    routing_summary text NOT NULL CHECK (char_length(routing_summary) BETWEEN 1 AND 1024),
    state text NOT NULL DEFAULT 'working' CHECK (state IN ('working', 'waiting', 'done', 'error', 'archive', 'merged', 'deleted')),
    state_before_archive text CHECK (state_before_archive IS NULL OR state_before_archive IN ('working', 'waiting', 'done', 'error')),
    merged_into_id uuid REFERENCES aven_intents.intents(id) ON DELETE RESTRICT,
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE aven_intents.contributions (
    id uuid PRIMARY KEY,
    intent_id uuid NOT NULL REFERENCES aven_intents.intents(id) ON DELETE RESTRICT,
    sequence bigint NOT NULL CHECK (sequence > 0),
    contributor_kind text NOT NULL CHECK (contributor_kind IN ('human', 'agent', 'skill', 'system')),
    kind text NOT NULL CHECK (char_length(kind) BETWEEN 1 AND 64),
    text text CHECK (text IS NULL OR char_length(text) <= 100000),
    payload jsonb NOT NULL DEFAULT '{}',
    idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 256),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (intent_id, sequence),
    UNIQUE (intent_id, idempotency_key)
);

CREATE TABLE aven_intents.merge_commands (
	command_id uuid PRIMARY KEY,
	target_intent_id uuid NOT NULL REFERENCES aven_intents.intents(id) ON DELETE RESTRICT,
	target_version bigint NOT NULL CHECK (target_version > 0),
	source_versions jsonb NOT NULL,
	created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE aven_intents.merge_relations (
    target_intent_id uuid NOT NULL REFERENCES aven_intents.intents(id) ON DELETE RESTRICT,
    source_intent_id uuid NOT NULL UNIQUE REFERENCES aven_intents.intents(id) ON DELETE RESTRICT,
	command_id uuid NOT NULL REFERENCES aven_intents.merge_commands(command_id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (target_intent_id, source_intent_id),
    CHECK (target_intent_id <> source_intent_id)
);

CREATE INDEX intents_owner_updated_idx
  ON aven_intents.intents(owner_subject_id, updated_at DESC, id);
CREATE INDEX contributions_intent_sequence_idx
  ON aven_intents.contributions(intent_id, sequence);
