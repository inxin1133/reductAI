-- ============================================
-- Update tenant_type: enterprise -> group
-- 2026-02-06
-- ============================================

-- Tenants: drop old check, update data, add new check
DO $$
DECLARE
  c RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenants') THEN
    FOR c IN
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'public.tenants'::regclass
        AND contype = 'c'
    LOOP
      IF position('tenant_type' in c.def) > 0 THEN
        EXECUTE format($f$ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS %I$f$, c.conname);
      END IF;
    END LOOP;

    UPDATE tenants SET tenant_type = 'group' WHERE tenant_type = 'enterprise';

    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_tenant_type_check
      CHECK (tenant_type IN ('personal', 'team', 'group'));
  END IF;
END $$;

-- tenant_type_model_access: drop old check, update data, add new check (if table exists)
DO $$
DECLARE
  c RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenant_type_model_access') THEN
    FOR c IN
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'public.tenant_type_model_access'::regclass
        AND contype = 'c'
    LOOP
      IF position('tenant_type' in c.def) > 0 THEN
        EXECUTE format($f$ALTER TABLE public.tenant_type_model_access DROP CONSTRAINT IF EXISTS %I$f$, c.conname);
      END IF;
    END LOOP;

    UPDATE tenant_type_model_access SET tenant_type = 'group' WHERE tenant_type = 'enterprise';

    ALTER TABLE public.tenant_type_model_access
      ADD CONSTRAINT tenant_type_model_access_tenant_type_check
      CHECK (tenant_type IN ('personal', 'team', 'group'));
  END IF;
END $$;
