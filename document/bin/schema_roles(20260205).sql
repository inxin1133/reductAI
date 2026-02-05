-- ============================================
-- RBAC Role Scope Refactor
-- 2026-02-05
-- ============================================
--
-- 변경 요약:
-- 1) roles.is_global -> roles.scope (role_scope ENUM)
-- 2) platform 역할은 user_roles 테이블로 분리
-- 3) tenant_base / tenant_custom 역할은 user_tenant_roles 유지
-- ============================================

-- 1) role_scope ENUM 생성
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_scope') THEN
        CREATE TYPE role_scope AS ENUM ('platform', 'tenant_base', 'tenant_custom');
    END IF;
END $$;

-- 2) roles 테이블 변경: scope 컬럼 추가 및 마이그레이션
ALTER TABLE roles ADD COLUMN IF NOT EXISTS scope role_scope;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'roles'
          AND column_name = 'is_global'
    ) THEN
        UPDATE roles
        SET scope = CASE
            WHEN is_global = TRUE THEN 'platform'::role_scope
            ELSE 'tenant_custom'::role_scope
        END
        WHERE scope IS NULL;
    END IF;
END $$;

-- scope 미지정 레코드는 tenant_custom으로 보정
UPDATE roles
SET scope = 'tenant_custom'::role_scope
WHERE scope IS NULL;

-- platform/tenant_base는 tenant_id를 NULL로 강제
UPDATE roles
SET tenant_id = NULL
WHERE scope IN ('platform', 'tenant_base');

-- 기존 is_global 체크 제약 제거 (존재할 경우)
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'roles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%is_global%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE roles DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

-- 기존 UNIQUE 제약 제거
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_tenant_id_slug_key;
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_scope_tenant_check;

-- 새 체크 제약 추가
ALTER TABLE roles
    ADD CONSTRAINT roles_scope_tenant_check
    CHECK (
        (scope = 'platform' AND tenant_id IS NULL) OR
        (scope = 'tenant_base' AND tenant_id IS NULL) OR
        (scope = 'tenant_custom' AND tenant_id IS NOT NULL)
    );

-- scope NOT NULL 설정 및 is_global 제거
ALTER TABLE roles ALTER COLUMN scope SET NOT NULL;
ALTER TABLE roles DROP COLUMN IF EXISTS is_global;

-- 인덱스 정리
DROP INDEX IF EXISTS idx_roles_is_global;
CREATE INDEX IF NOT EXISTS idx_roles_scope ON roles(scope);
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_scope_slug
    ON roles(scope, slug)
    WHERE scope IN ('platform', 'tenant_base');
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_tenant_custom_slug
    ON roles(tenant_id, slug)
    WHERE scope = 'tenant_custom';

-- 3) 플랫폼 역할 매핑 테이블 생성
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    granted_by UUID REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_expires_at ON user_roles(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE user_roles IS '사용자에게 플랫폼 역할을 할당하는 테이블. platform 범위 역할만 저장합니다.';
COMMENT ON COLUMN user_roles.id IS '할당 레코드의 고유 식별자 (UUID)';
COMMENT ON COLUMN user_roles.user_id IS '사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN user_roles.role_id IS '플랫폼 역할 ID (roles 테이블 참조, scope=platform)';
COMMENT ON COLUMN user_roles.granted_at IS '역할이 사용자에게 부여된 시각';
COMMENT ON COLUMN user_roles.granted_by IS '역할을 부여한 사용자 ID (users 테이블 참조, 감사 추적용)';
COMMENT ON COLUMN user_roles.expires_at IS '역할 만료 시각 (NULL이면 만료되지 않음)';

-- 4) 기존 user_tenant_roles의 platform 역할을 user_roles로 마이그레이션
INSERT INTO user_roles (user_id, role_id, granted_at, granted_by, expires_at)
SELECT utr.user_id, utr.role_id, utr.granted_at, utr.granted_by, utr.expires_at
FROM user_tenant_roles utr
JOIN roles r ON r.id = utr.role_id
WHERE r.scope = 'platform'
ON CONFLICT (user_id, role_id) DO NOTHING;

DELETE FROM user_tenant_roles
WHERE role_id IN (SELECT id FROM roles WHERE scope = 'platform');
