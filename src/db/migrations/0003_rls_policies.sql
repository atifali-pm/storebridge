-- Row-Level Security policies for tenant-scoped tables.
-- Design:
--   * Owner role (connection default) bypasses RLS — used by migrations,
--     webhook landing, worker, and other system operations that discover
--     tenants by external keys (shop_domain).
--   * app_user role has no BYPASSRLS. Tenant-scoped code paths do
--     SET LOCAL ROLE app_user + SET LOCAL storebridge.tenant_id = '<uuid>'
--     inside a transaction. Every query is then constrained to the tenant.

-- Create app_user role if it doesn't exist (idempotent across re-runs)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

-- Grant role membership to whoever owns the tables so the app can
-- SET LOCAL ROLE app_user without needing a separate login.
DO $$
DECLARE
  owner_name text;
BEGIN
  SELECT tableowner INTO owner_name FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'tenants';
  IF owner_name IS NOT NULL THEN
    EXECUTE format('GRANT app_user TO %I', owner_name);
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- Helper that reads the per-request tenant id from a session GUC.
-- Returns NULL if unset so policies fail closed.
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid AS $$
DECLARE
  v text;
BEGIN
  v := current_setting('storebridge.tenant_id', true);
  IF v IS NULL OR v = '' THEN
    RETURN NULL;
  END IF;
  RETURN v::uuid;
END
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION current_tenant_id() TO app_user;

-- Enable RLS per table. Owner still bypasses by default (no FORCE).
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- tenants: app_user can read/update only its own row; inserts are system-only.
DROP POLICY IF EXISTS tenants_app_user_select ON tenants;
CREATE POLICY tenants_app_user_select ON tenants FOR SELECT TO app_user
  USING (id = current_tenant_id());

DROP POLICY IF EXISTS tenants_app_user_update ON tenants;
CREATE POLICY tenants_app_user_update ON tenants FOR UPDATE TO app_user
  USING (id = current_tenant_id())
  WITH CHECK (id = current_tenant_id());

-- users / shops / store_links / sync_jobs / audit_logs: tenant_id must match.
DROP POLICY IF EXISTS users_tenant_isolation ON users;
CREATE POLICY users_tenant_isolation ON users FOR ALL TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS shops_tenant_isolation ON shops;
CREATE POLICY shops_tenant_isolation ON shops FOR ALL TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS store_links_tenant_isolation ON store_links;
CREATE POLICY store_links_tenant_isolation ON store_links FOR ALL TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS sync_jobs_tenant_isolation ON sync_jobs;
CREATE POLICY sync_jobs_tenant_isolation ON sync_jobs FOR ALL TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;
CREATE POLICY audit_logs_tenant_isolation ON audit_logs FOR ALL TO app_user
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
