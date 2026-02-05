-- ============================================
-- Replace tenant_memberships with user_tenant_roles
-- 2026-02-05
-- ============================================

-- 1) Extend user_tenant_roles with membership fields
ALTER TABLE user_tenant_roles
  ADD COLUMN IF NOT EXISTS membership_status VARCHAR(50) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS is_primary_tenant BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_tenant_roles_membership_status_check'
  ) THEN
    ALTER TABLE user_tenant_roles
      ADD CONSTRAINT user_tenant_roles_membership_status_check
      CHECK (membership_status IN ('active', 'inactive', 'suspended', 'pending'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_tenant_roles_membership_status
  ON user_tenant_roles(tenant_id, membership_status);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_tenant_roles_primary
  ON user_tenant_roles(user_id)
  WHERE is_primary_tenant = TRUE;

-- 2) Ensure tenant base roles exist
INSERT INTO roles (name, slug, description, scope, tenant_id, is_system_role)
VALUES
  ('소유자', 'owner', 'Tenant base role: owner', 'tenant_base', NULL, TRUE),
  ('관리자', 'admin', 'Tenant base role: admin', 'tenant_base', NULL, TRUE),
  ('멤버', 'member', 'Tenant base role: member', 'tenant_base', NULL, TRUE),
  ('뷰어', 'viewer', 'Tenant base role: viewer', 'tenant_base', NULL, TRUE)
ON CONFLICT DO NOTHING;

-- 3) Keep tenant_invitations table
CREATE TABLE IF NOT EXISTS tenant_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  invitee_email VARCHAR(255) NOT NULL,
  invitee_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  invitation_token VARCHAR(255) NOT NULL UNIQUE,
  membership_role VARCHAR(50) NOT NULL DEFAULT 'member'
    CHECK (membership_role IN ('owner', 'admin', 'member', 'viewer')),
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_invitations_tenant_id ON tenant_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_inviter_id ON tenant_invitations(inviter_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_invitee_email ON tenant_invitations(invitee_email);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_invitee_user_id ON tenant_invitations(invitee_user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_token ON tenant_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_status ON tenant_invitations(status);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_expires_at ON tenant_invitations(expires_at);

-- 4) Migrate tenant_memberships data into user_tenant_roles
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'tenant_memberships'
  ) THEN
    EXECUTE $sql$
      INSERT INTO user_tenant_roles (
        user_id,
        tenant_id,
        role_id,
        granted_at,
        granted_by,
        expires_at,
        membership_status,
        joined_at,
        left_at,
        is_primary_tenant
      )
      SELECT
        tm.user_id,
        tm.tenant_id,
        r.id,
        tm.joined_at,
        tm.invited_by,
        NULL,
        tm.membership_status,
        tm.joined_at,
        tm.left_at,
        tm.is_primary_tenant
      FROM tenant_memberships tm
      JOIN roles r
        ON r.scope = 'tenant_base'
        AND r.slug = tm.membership_role
      ON CONFLICT (user_id, tenant_id, role_id)
      DO UPDATE SET
        membership_status = EXCLUDED.membership_status,
        joined_at = EXCLUDED.joined_at,
        left_at = EXCLUDED.left_at,
        is_primary_tenant = EXCLUDED.is_primary_tenant
    $sql$;

    EXECUTE $sql$
      UPDATE user_tenant_roles utr
      SET
        membership_status = tm.membership_status,
        joined_at = tm.joined_at,
        left_at = tm.left_at
      FROM tenant_memberships tm
      WHERE utr.user_id = tm.user_id
        AND utr.tenant_id = tm.tenant_id
    $sql$;
  END IF;
END $$;

-- 5) Drop tenant_memberships and related helpers
DROP FUNCTION IF EXISTS update_tenant_member_count() CASCADE;
DROP TABLE IF EXISTS tenant_memberships CASCADE;
