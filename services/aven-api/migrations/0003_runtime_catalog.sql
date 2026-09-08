-- Runtime catalogs are retained with their release, independent of the facade binary.
ALTER TABLE customer_runtimes
 ADD COLUMN component_catalog jsonb,
 ADD COLUMN retired_at timestamptz,
 ADD CONSTRAINT runtime_catalog_array CHECK (
   component_catalog IS NULL OR (jsonb_typeof(component_catalog)='array' AND jsonb_array_length(component_catalog)>0));
CREATE TABLE customer_runtime_defaults (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 runtime_id text NOT NULL REFERENCES customer_runtimes(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO customer_runtime_defaults(singleton,runtime_id) VALUES(true,'primary');
REVOKE ALL ON customer_runtime_defaults FROM PUBLIC,aven_api_authorization,aven_api_entitlements;
GRANT SELECT ON customer_runtime_defaults TO aven_api_entitlements;
GRANT SELECT,UPDATE ON customer_runtime_defaults TO aven_api_reconciler;
