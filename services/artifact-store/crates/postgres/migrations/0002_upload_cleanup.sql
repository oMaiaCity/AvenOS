DROP TRIGGER reject_history_mutation ON artifact_store.artifact_blobs;

CREATE INDEX upload_claims_expiry_idx
    ON artifact_store.upload_claims(expires_at);

CREATE INDEX artifact_contents_blob_idx
    ON artifact_store.artifact_contents(blob_sha256)
    WHERE blob_sha256 IS NOT NULL;

CREATE FUNCTION artifact_store.cleanup_expired_uploads()
RETURNS TABLE(deleted_claims bigint, deleted_blobs bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, artifact_store
AS $$
DECLARE
    claim_count bigint;
    blob_count bigint;
BEGIN
    DELETE FROM artifact_store.upload_claims
    WHERE consumed_publication_id IS NULL
      AND expires_at + interval '24 hours' <= clock_timestamp();
    GET DIAGNOSTICS claim_count = ROW_COUNT;

    DELETE FROM artifact_store.artifact_blobs blob
    WHERE NOT EXISTS (
        SELECT 1 FROM artifact_store.artifact_contents content
        WHERE content.blob_sha256 = blob.sha256
    ) AND NOT EXISTS (
        SELECT 1 FROM artifact_store.upload_claims claim
        WHERE claim.blob_sha256 = blob.sha256
    );
    GET DIAGNOSTICS blob_count = ROW_COUNT;

    RETURN QUERY SELECT claim_count, blob_count;
END;
$$;

REVOKE ALL ON FUNCTION artifact_store.cleanup_expired_uploads() FROM PUBLIC;
