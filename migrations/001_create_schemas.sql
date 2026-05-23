-- Five scenarios, each modeled as 3-5 Postgres schemas, totaling 21 schemas.
-- The HTTP server runs as inspector_ro and gets SELECT on every table in every
-- schema below (default privileges so future CREATE TABLEs in those schemas
-- auto-grant SELECT to ro). The boot-time migrator + seeder run as
-- inspector_admin and have CREATE on the database (granted in bootstrap-vm.sh).

DO $$
DECLARE
  schema_name TEXT;
  schemas TEXT[] := ARRAY[
    'sm_identity', 'sm_communities', 'sm_content', 'sm_engagement',
    'es_identity', 'es_accounts', 'es_pipeline', 'es_tasks',
    'infra_identity', 'infra_inventory', 'infra_metrics', 'infra_alerting',
    'ec_catalog', 'ec_customers', 'ec_orders', 'ec_payments',
    'ft_identity', 'ft_ledger', 'ft_merchants', 'ft_disputes', 'ft_webhooks'
  ];
BEGIN
  FOREACH schema_name IN ARRAY schemas LOOP
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', schema_name);
    -- Grant USAGE conditionally so the migration also works against a local
    -- single-superuser docker where inspector_ro doesn't exist.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inspector_ro') THEN
      EXECUTE format('GRANT USAGE ON SCHEMA %I TO inspector_ro', schema_name);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT ON TABLES TO inspector_ro',
        schema_name
      );
    END IF;
  END LOOP;
END $$;
