-- ============================================
-- Multi-Tenant Microservices Architecture with RBAC
-- PostgreSQL Database Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. RBAC - USERS
-- ============================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE, -- 로그인 아이디로 사용
    password_hash VARCHAR(255), -- SSO 사용자는 NULL일 수 있음
    full_name VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'locked')),
    email_verified BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

-- Column comments for users table
COMMENT ON TABLE users IS '시스템 사용자 정보를 관리하는 테이블. email을 유일한 로그인 아이디로 사용. password_hash가 NULL인 경우 SSO(구글/카카오/네이버 등) 인증 사용.';
COMMENT ON COLUMN users.id IS '사용자의 고유 식별자 (UUID)';
COMMENT ON COLUMN users.email IS '사용자의 이메일 주소 (고유값, 로그인 식별자)';
COMMENT ON COLUMN users.password_hash IS '암호화된 비밀번호 해시값 (SSO 사용자는 NULL)';
COMMENT ON COLUMN users.full_name IS '사용자의 전체 이름';
COMMENT ON COLUMN users.status IS '사용자 상태: active(활성), inactive(비활성), suspended(정지됨), locked(잠김)';
COMMENT ON COLUMN users.email_verified IS '이메일 인증 완료 여부';
COMMENT ON COLUMN users.last_login_at IS '마지막 로그인 시각';
COMMENT ON COLUMN users.metadata IS '사용자의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN users.created_at IS '사용자 계정 생성 시각';
COMMENT ON COLUMN users.updated_at IS '사용자 정보 최종 수정 시각';
COMMENT ON COLUMN users.deleted_at IS '사용자 계정 삭제 시각 (Soft Delete용, NULL이면 삭제되지 않음)';


-- SSO 및 email 연결 관리 테이블
CREATE TABLE user_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('google', 'kakao', 'naver', 'local')),
    provider_user_id VARCHAR(255) NOT NULL,
    extra_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider, provider_user_id)
);

CREATE INDEX idx_user_providers_user_id ON user_providers(user_id);
CREATE INDEX idx_user_providers_provider ON user_providers(provider);
CREATE INDEX idx_user_providers_provider_user_id ON user_providers(provider_user_id);

-- Column comments for user_providers table
COMMENT ON TABLE user_providers IS '소셜/외부인증(구글,카카오,네이버 등) 및 로컬 인증 사용 계정 연동 관리 테이블';
COMMENT ON COLUMN user_providers.id IS 'provider 매핑의 고유 식별자 (UUID)';
COMMENT ON COLUMN user_providers.user_id IS 'users 테이블의 사용자 ID';
COMMENT ON COLUMN user_providers.provider IS '인증 제공자 이름(google/kakao/naver/local)';
COMMENT ON COLUMN user_providers.provider_user_id IS '프로바이더별 유니크한 외부 계정 ID';
COMMENT ON COLUMN user_providers.extra_data IS '프로바이더에서 제공받은 추가 정보(JSON)';
COMMENT ON COLUMN user_providers.created_at IS '연동 생성 시각';

-- ============================================
-- 2. TENANT MANAGEMENT
-- ============================================

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    domain VARCHAR(255),
    tenant_type VARCHAR(50) DEFAULT 'personal' CHECK (tenant_type IN ('personal', 'team', 'group')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    member_limit INTEGER,
    current_member_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_deleted_at ON tenants(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_owner_id ON tenants(owner_id);
CREATE INDEX idx_tenants_tenant_type ON tenants(tenant_type);

-- Column comments for tenants table
COMMENT ON TABLE tenants IS '테넌트 정보를 관리하는 테이블. 멀티테넌트 아키텍처의 핵심 테이블입니다.';
COMMENT ON COLUMN tenants.id IS '테넌트의 고유 식별자 (UUID)';
COMMENT ON COLUMN tenants.owner_id IS '테넌트 소유자 ID (users 테이블 참조)';
COMMENT ON COLUMN tenants.name IS '테넌트의 표시 이름';
COMMENT ON COLUMN tenants.slug IS '테넌트의 URL에 사용되는 고유 식별 문자열 (예: company-name)';
COMMENT ON COLUMN tenants.domain IS '테넌트에 연결된 도메인 이름 (선택사항)';
COMMENT ON COLUMN tenants.tenant_type IS '테넌트 타입: personal(개인), team(팀), group(그룹)';
COMMENT ON COLUMN tenants.status IS '테넌트 상태: active(활성), inactive(비활성), suspended(정지됨)';
COMMENT ON COLUMN tenants.member_limit IS '최대 멤버 수 (NULL이면 무제한)';
COMMENT ON COLUMN tenants.current_member_count IS '현재 활성 멤버 수 (자동 업데이트)';
COMMENT ON COLUMN tenants.metadata IS '테넌트의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN tenants.created_at IS '테넌트 생성 시각';
COMMENT ON COLUMN tenants.updated_at IS '테넌트 정보 최종 수정 시각';
COMMENT ON COLUMN tenants.deleted_at IS '테넌트 삭제 시각 (Soft Delete용, NULL이면 삭제되지 않음)';

-- ============================================
-- 3. MICROSERVICES MANAGEMENT
-- ============================================

CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    version VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deprecated')),
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_services_slug ON services(slug);
CREATE INDEX idx_services_status ON services(status);

-- Column comments for services table
COMMENT ON TABLE services IS '마이크로 서비스 정의 정보를 관리하는 테이블';
COMMENT ON COLUMN services.id IS '서비스의 고유 식별자 (UUID)';
COMMENT ON COLUMN services.name IS '서비스의 표시 이름';
COMMENT ON COLUMN services.slug IS '서비스의 고유 식별 문자열 (예: user-service)';
COMMENT ON COLUMN services.description IS '서비스에 대한 설명';
COMMENT ON COLUMN services.version IS '서비스 버전 (예: 1.0.0, 2.1.3)';
COMMENT ON COLUMN services.status IS '서비스 상태: active(활성), inactive(비활성), deprecated(사용 중단 예정)';
COMMENT ON COLUMN services.config IS '서비스 설정 정보 (JSON 형식)';
COMMENT ON COLUMN services.created_at IS '서비스 생성 시각';
COMMENT ON COLUMN services.updated_at IS '서비스 정보 최종 수정 시각';

-- 
-- [service_instances 테이블 역할/설명]
-- 
-- 이 테이블은 "테넌트별 서비스 인스턴스"를 관리합니다.
-- 즉, 다수의 테넌트가 동일한 마이크로서비스(services 테이블에 정의된)를 각자의 설정 또는 환경에 맞추어 여러 인스턴스로 실행할 수 있는데,
-- 이 때 각 서비스 인스턴스(=한 테넌트에서 실행 중인 한 서비스 단위)의 상세 정보를 독립적으로 저장/관리하기 위한 핵심 테이블입니다.
-- 
-- 주요 목적 및 기능:
--   - 여러 테넌트가 동일한 서비스의 인스턴스를 각기 다르게 가질 수 있도록 지원함 (멀티테넌트 SaaS에서 필수적)
--   - 서비스 인스턴스별로 구성(config), 상태(status), 배포 지역(region), 엔드포인트 URL 등을 분리해서 관리
--   - 서비스 인스턴스마다 헬스 체크용 URL 및 고유 이름 등을 저장
--   - 서비스, 테넌트, 인스턴스명을 조합하여 고유성(UNIQUE)을 보장
--
CREATE TABLE service_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),                                               -- 서비스 인스턴스의 고유 식별자
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,                           -- 해당 인스턴스가 속한 서비스 (services 테이블 참조)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,                             -- 인스턴스를 사용하는 테넌트 (tenants 테이블 참조)
    instance_name VARCHAR(255) NOT NULL,                                                          -- 인스턴스명(동일 테넌트+서비스 내에서 고유)
    endpoint_url VARCHAR(500),                                                                    -- 인스턴스 접속용 엔드포인트 URL (API 등)
    region VARCHAR(100),                                                                          -- 배포 지역(리전, e.g. ap-northeast-2, us-west-1)
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'degraded', 'down')), -- 인스턴스 상태
    health_check_url VARCHAR(500),                                                                -- Health check용 URL
    config JSONB DEFAULT '{}',                                                                    -- 인스턴스별 개별 설정값 (JSON)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,                                -- 생성 시각
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,                                -- 수정 시각
    UNIQUE(service_id, tenant_id, instance_name)                                                  -- 같은 서비스+테넌트 내에서 인스턴스명 고유
);

CREATE INDEX idx_service_instances_service_id ON service_instances(service_id);                    -- 서비스 기준 조회를 빠르게
CREATE INDEX idx_service_instances_tenant_id ON service_instances(tenant_id);                      -- 테넌트 기준 조회를 빠르게
CREATE INDEX idx_service_instances_status ON service_instances(status);                            -- 상태별 조회

-- 상세 컬럼 주석(설명)
COMMENT ON TABLE service_instances IS '테넌트별 서비스 인스턴스 정보를 관리하는 테이블. 각 테넌트는 동일한 서비스의 여러 인스턴스를 가질 수 있습니다.';
COMMENT ON COLUMN service_instances.id IS '서비스 인스턴스의 고유 식별자 (UUID)';
COMMENT ON COLUMN service_instances.service_id IS '참조하는 서비스 ID (services 테이블 참조)';
COMMENT ON COLUMN service_instances.tenant_id IS '이 인스턴스가 속한 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN service_instances.instance_name IS '인스턴스 이름 (같은 테넌트와 서비스 내에서 고유)';
COMMENT ON COLUMN service_instances.endpoint_url IS '서비스 인스턴스의 엔드포인트 URL';
COMMENT ON COLUMN service_instances.region IS '서비스 인스턴스가 배포된 지역 (예: us-east-1, ap-northeast-2)';
COMMENT ON COLUMN service_instances.status IS '인스턴스 상태: active(활성), inactive(비활성), degraded(성능 저하), down(다운)';
COMMENT ON COLUMN service_instances.health_check_url IS '헬스 체크를 수행할 URL';
COMMENT ON COLUMN service_instances.config IS '인스턴스별 설정 정보 (JSON 형식)';
COMMENT ON COLUMN service_instances.created_at IS '인스턴스 생성 시각';
COMMENT ON COLUMN service_instances.updated_at IS '인스턴스 정보 최종 수정 시각';

-- ============================================
-- 4. RBAC - ROLES
-- ============================================

-- Role scope enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_scope') THEN
        CREATE TYPE role_scope AS ENUM ('platform', 'tenant_base', 'tenant_custom');
    END IF;
END $$;

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT FALSE,
    scope role_scope NOT NULL, -- Role scope: platform / tenant_base / tenant_custom
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (scope = 'platform' AND tenant_id IS NULL) OR
        (scope = 'tenant_base' AND tenant_id IS NULL) OR
        (scope = 'tenant_custom' AND tenant_id IS NOT NULL)
    )
);

CREATE INDEX idx_roles_tenant_id ON roles(tenant_id);
CREATE INDEX idx_roles_slug ON roles(slug);
CREATE INDEX idx_roles_scope ON roles(scope);
CREATE UNIQUE INDEX idx_roles_scope_slug ON roles(scope, slug) WHERE scope IN ('platform', 'tenant_base');
CREATE UNIQUE INDEX idx_roles_tenant_custom_slug ON roles(tenant_id, slug) WHERE scope = 'tenant_custom';

-- Column comments for roles table
COMMENT ON TABLE roles IS '역할(Role) 정보를 관리하는 테이블. 플랫폼/테넌트 기본/테넌트 커스텀 역할을 지원합니다.';
COMMENT ON COLUMN roles.id IS '역할의 고유 식별자 (UUID)';
COMMENT ON COLUMN roles.tenant_id IS '이 역할이 속한 테넌트 ID (tenant_custom에서만 사용, platform/tenant_base는 NULL)';
COMMENT ON COLUMN roles.name IS '역할의 표시 이름 (예: 관리자, 개발자, 뷰어)';
COMMENT ON COLUMN roles.slug IS '역할의 고유 식별 문자열 (같은 테넌트 내에서 고유)';
COMMENT ON COLUMN roles.description IS '역할에 대한 설명';
COMMENT ON COLUMN roles.is_system_role IS '시스템 기본 역할 여부 (시스템 역할은 삭제/수정 제한 가능)';
COMMENT ON COLUMN roles.scope IS '역할 범위: platform(플랫폼), tenant_base(공통 테넌트), tenant_custom(테넌트 커스텀)';
COMMENT ON COLUMN roles.created_at IS '역할 생성 시각';
COMMENT ON COLUMN roles.updated_at IS '역할 정보 최종 수정 시각';

-- ============================================
-- 5. RBAC - PERMISSIONS
-- ============================================

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    resource VARCHAR(100) NOT NULL, -- e.g., 'user', 'service', 'tenant'
    action VARCHAR(100) NOT NULL, -- e.g., 'create', 'read', 'update', 'delete', 'manage'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_permissions_resource ON permissions(resource);
CREATE INDEX idx_permissions_action ON permissions(action);
CREATE INDEX idx_permissions_slug ON permissions(slug);

-- Column comments for permissions table
COMMENT ON TABLE permissions IS '권한(Permission) 정보를 관리하는 테이블. 리소스와 액션의 조합으로 권한을 정의합니다.';
COMMENT ON COLUMN permissions.id IS '권한의 고유 식별자 (UUID)';
COMMENT ON COLUMN permissions.name IS '권한의 표시 이름';
COMMENT ON COLUMN permissions.slug IS '권한의 고유 식별 문자열 (예: user:create, tenant:read)';
COMMENT ON COLUMN permissions.resource IS '권한이 적용되는 리소스 타입 (예: user, tenant, service, role)';
COMMENT ON COLUMN permissions.action IS '권한 액션 타입 (예: create, read, update, delete, manage, assign)';
COMMENT ON COLUMN permissions.description IS '권한에 대한 설명';
COMMENT ON COLUMN permissions.created_at IS '권한 생성 시각';

-- ============================================
-- 6. RBAC - ROLE-PERMISSION MAPPING
-- ============================================

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);

-- Column comments for role_permissions table
COMMENT ON TABLE role_permissions IS '역할과 권한의 매핑 테이블. 한 역할에 여러 권한을 부여할 수 있습니다.';
COMMENT ON COLUMN role_permissions.role_id IS '역할 ID (roles 테이블 참조)';
COMMENT ON COLUMN role_permissions.permission_id IS '권한 ID (permissions 테이블 참조)';
COMMENT ON COLUMN role_permissions.granted_at IS '권한이 역할에 부여된 시각';

-- ============================================
-- 7. RBAC - USER-ROLE MAPPING (Platform)
-- ============================================

CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    granted_by UUID REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, role_id)
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX idx_user_roles_expires_at ON user_roles(expires_at) WHERE expires_at IS NOT NULL;

-- Column comments for user_roles table
COMMENT ON TABLE user_roles IS '사용자에게 플랫폼 역할을 할당하는 테이블. 플랫폼 범위 역할은 tenant_id 없이 할당됩니다.';
COMMENT ON COLUMN user_roles.id IS '할당 레코드의 고유 식별자 (UUID)';
COMMENT ON COLUMN user_roles.user_id IS '사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN user_roles.role_id IS '플랫폼 역할 ID (roles 테이블 참조, scope=platform)';
COMMENT ON COLUMN user_roles.granted_at IS '역할이 사용자에게 부여된 시각';
COMMENT ON COLUMN user_roles.granted_by IS '역할을 부여한 사용자 ID (users 테이블 참조, 감사 추적용)';
COMMENT ON COLUMN user_roles.expires_at IS '역할 만료 시각 (NULL이면 만료되지 않음)';

-- ============================================
-- 8. RBAC - USER-ROLE MAPPING (Tenant)
-- ============================================

CREATE TABLE user_tenant_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    membership_status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active', 'inactive', 'suspended', 'pending')),
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP WITH TIME ZONE,
    is_primary_tenant BOOLEAN NOT NULL DEFAULT FALSE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    granted_by UUID REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, tenant_id, role_id)
);

CREATE INDEX idx_user_tenant_roles_user_id ON user_tenant_roles(user_id);
CREATE INDEX idx_user_tenant_roles_tenant_id ON user_tenant_roles(tenant_id);
CREATE INDEX idx_user_tenant_roles_role_id ON user_tenant_roles(role_id);
CREATE INDEX idx_user_tenant_roles_membership_status ON user_tenant_roles(tenant_id, membership_status);
CREATE INDEX idx_user_tenant_roles_expires_at ON user_tenant_roles(expires_at) WHERE expires_at IS NOT NULL;
CREATE UNIQUE INDEX uniq_user_tenant_roles_primary ON user_tenant_roles(user_id) WHERE is_primary_tenant = TRUE;

-- Column comments for user_tenant_roles table
COMMENT ON TABLE user_tenant_roles IS '사용자에게 테넌트별 역할(tenant_base/tenant_custom)을 할당하는 테이블. 한 사용자는 여러 테넌트에서 서로 다른 역할을 가질 수 있습니다.';
COMMENT ON COLUMN user_tenant_roles.id IS '할당 레코드의 고유 식별자 (UUID)';
COMMENT ON COLUMN user_tenant_roles.user_id IS '사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN user_tenant_roles.tenant_id IS '역할이 적용되는 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN user_tenant_roles.role_id IS '할당할 역할 ID (roles 테이블 참조)';
COMMENT ON COLUMN user_tenant_roles.membership_status IS '멤버십 상태: active(활성), inactive(비활성), suspended(정지), pending(초대 대기)';
COMMENT ON COLUMN user_tenant_roles.joined_at IS '테넌트 가입 시각';
COMMENT ON COLUMN user_tenant_roles.left_at IS '테넌트 탈퇴 시각 (NULL이면 현재 멤버)';
COMMENT ON COLUMN user_tenant_roles.is_primary_tenant IS '사용자의 기본 테넌트 여부 (한 사용자는 하나의 기본 테넌트만 가질 수 있음)';
COMMENT ON COLUMN user_tenant_roles.granted_at IS '역할이 사용자에게 부여된 시각';
COMMENT ON COLUMN user_tenant_roles.granted_by IS '역할을 부여한 사용자 ID (users 테이블 참조, 감사 추적용)';
COMMENT ON COLUMN user_tenant_roles.expires_at IS '역할 만료 시각 (NULL이면 만료되지 않음)';

-- ============================================
-- 8. TENANT INVITATIONS (초대 관리)
-- ============================================

CREATE TABLE tenant_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, -- 초대한 사용자
    invitee_email VARCHAR(255) NOT NULL, -- 초대받은 사용자의 이메일
    invitee_user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- 이미 가입한 사용자인 경우
    invitation_token VARCHAR(255) NOT NULL UNIQUE, -- 초대 토큰
    membership_role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (membership_role IN ('owner', 'admin', 'member', 'viewer')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tenant_invitations_tenant_id ON tenant_invitations(tenant_id);
CREATE INDEX idx_tenant_invitations_inviter_id ON tenant_invitations(inviter_id);
CREATE INDEX idx_tenant_invitations_invitee_email ON tenant_invitations(invitee_email);
CREATE INDEX idx_tenant_invitations_invitee_user_id ON tenant_invitations(invitee_user_id);
CREATE INDEX idx_tenant_invitations_token ON tenant_invitations(invitation_token);
CREATE INDEX idx_tenant_invitations_status ON tenant_invitations(status);
CREATE INDEX idx_tenant_invitations_expires_at ON tenant_invitations(expires_at);

COMMENT ON TABLE tenant_invitations IS '테넌트 초대 정보를 관리하는 테이블';
COMMENT ON COLUMN tenant_invitations.id IS '초대 레코드의 고유 식별자 (UUID)';
COMMENT ON COLUMN tenant_invitations.tenant_id IS '초대한 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN tenant_invitations.inviter_id IS '초대한 사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN tenant_invitations.invitee_email IS '초대받은 사용자의 이메일 주소';
COMMENT ON COLUMN tenant_invitations.invitee_user_id IS '이미 가입한 사용자인 경우 사용자 ID (users 테이블 참조, NULL이면 신규 사용자)';
COMMENT ON COLUMN tenant_invitations.invitation_token IS '초대 토큰 (고유값)';
COMMENT ON COLUMN tenant_invitations.membership_role IS '초대 시 부여할 멤버십 역할';
COMMENT ON COLUMN tenant_invitations.status IS '초대 상태: pending(대기), accepted(수락), rejected(거부), expired(만료), cancelled(취소)';
COMMENT ON COLUMN tenant_invitations.expires_at IS '초대 만료 시각';
COMMENT ON COLUMN tenant_invitations.accepted_at IS '초대 수락 시각';
COMMENT ON COLUMN tenant_invitations.rejected_at IS '초대 거부 시각';
COMMENT ON COLUMN tenant_invitations.cancelled_at IS '초대 취소 시각';
COMMENT ON COLUMN tenant_invitations.metadata IS '초대의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN tenant_invitations.created_at IS '초대 생성 시각';
COMMENT ON COLUMN tenant_invitations.updated_at IS '초대 정보 최종 수정 시각';

-- ============================================
-- 9. SERVICE ACCESS CONTROL (Tenant-Service Permissions)
-- ============================================

CREATE TABLE tenant_service_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    access_level VARCHAR(50) DEFAULT 'standard' CHECK (access_level IN ('standard', 'premium', 'enterprise')),
    rate_limit JSONB DEFAULT '{}',
    config JSONB DEFAULT '{}',
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tenant_id, service_id)
);

CREATE INDEX idx_tenant_service_access_tenant_id ON tenant_service_access(tenant_id);
CREATE INDEX idx_tenant_service_access_service_id ON tenant_service_access(service_id);
CREATE INDEX idx_tenant_service_access_status ON tenant_service_access(status);

-- Column comments for tenant_service_access table
COMMENT ON TABLE tenant_service_access IS '테넌트별 서비스 접근 권한 및 설정을 관리하는 테이블';
COMMENT ON COLUMN tenant_service_access.id IS '접근 권한 레코드의 고유 식별자 (UUID)';
COMMENT ON COLUMN tenant_service_access.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN tenant_service_access.service_id IS '서비스 ID (services 테이블 참조)';
COMMENT ON COLUMN tenant_service_access.status IS '접근 상태: active(활성), inactive(비활성), suspended(정지됨)';
COMMENT ON COLUMN tenant_service_access.access_level IS '접근 레벨: standard(기본), premium(프리미엄), enterprise(엔터프라이즈)';
COMMENT ON COLUMN tenant_service_access.rate_limit IS 'API 호출 제한 설정 (JSON 형식, 예: {"requests": 1000, "period": "hour"})';
COMMENT ON COLUMN tenant_service_access.config IS '테넌트별 서비스 설정 (JSON 형식)';
COMMENT ON COLUMN tenant_service_access.granted_at IS '서비스 접근 권한이 부여된 시각';
COMMENT ON COLUMN tenant_service_access.expires_at IS '접근 권한 만료 시각 (NULL이면 만료되지 않음)';

-- ============================================
-- 9. AUDIT LOG
-- ============================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'failure', 'error')),
    ip_address INET,
    user_agent TEXT,
    request_data JSONB,
    response_data JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_service_id ON audit_logs(service_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Column comments for audit_logs table
COMMENT ON TABLE audit_logs IS '시스템의 모든 중요한 작업을 기록하는 감사 로그 테이블';
COMMENT ON COLUMN audit_logs.id IS '로그 항목의 고유 식별자 (UUID)';
COMMENT ON COLUMN audit_logs.tenant_id IS '작업이 발생한 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN audit_logs.user_id IS '작업을 수행한 사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN audit_logs.service_id IS '작업이 발생한 서비스 ID (services 테이블 참조)';
COMMENT ON COLUMN audit_logs.action IS '수행된 작업 이름 (예: create_user, delete_tenant, assign_role)';
COMMENT ON COLUMN audit_logs.resource_type IS '작업 대상 리소스 타입 (예: user, tenant, service, role)';
COMMENT ON COLUMN audit_logs.resource_id IS '작업 대상 리소스의 ID';
COMMENT ON COLUMN audit_logs.status IS '작업 결과 상태: success(성공), failure(실패), error(오류)';
COMMENT ON COLUMN audit_logs.ip_address IS '작업을 수행한 IP 주소';
COMMENT ON COLUMN audit_logs.user_agent IS '작업을 수행한 클라이언트의 User-Agent 정보';
COMMENT ON COLUMN audit_logs.request_data IS '요청 데이터 (JSON 형식)';
COMMENT ON COLUMN audit_logs.response_data IS '응답 데이터 (JSON 형식)';
COMMENT ON COLUMN audit_logs.error_message IS '오류 발생 시 오류 메시지';
COMMENT ON COLUMN audit_logs.created_at IS '로그 항목이 생성된 시각';

-- ============================================
-- 10. SESSION MANAGEMENT
-- ============================================

CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_tenant_id ON user_sessions(tenant_id);
CREATE INDEX idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Column comments for user_sessions table
COMMENT ON TABLE user_sessions IS '사용자 세션 정보를 관리하는 테이블';
COMMENT ON COLUMN user_sessions.id IS '세션의 고유 식별자 (UUID)';
COMMENT ON COLUMN user_sessions.user_id IS '세션을 소유한 사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN user_sessions.tenant_id IS '세션이 활성화된 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN user_sessions.token_hash IS '인증 토큰의 해시값 (보안을 위해 원본 토큰은 저장하지 않음)';
COMMENT ON COLUMN user_sessions.ip_address IS '세션 생성 시 IP 주소';
COMMENT ON COLUMN user_sessions.user_agent IS '세션 생성 시 User-Agent 정보';
COMMENT ON COLUMN user_sessions.expires_at IS '세션 만료 시각';
COMMENT ON COLUMN user_sessions.last_activity_at IS '마지막 활동 시각 (세션 갱신용)';
COMMENT ON COLUMN user_sessions.created_at IS '세션 생성 시각';

-- ============================================
-- 11. TRIGGERS FOR UPDATED_AT
-- ============================================

-- Function to automatically update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

COMMENT ON FUNCTION update_updated_at_column() IS '레코드가 업데이트될 때 updated_at 컬럼을 자동으로 현재 시각으로 갱신하는 트리거 함수';

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_instances_updated_at BEFORE UPDATE ON service_instances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 12. INITIAL DATA - DEFAULT PERMISSIONS
-- ============================================

-- Common CRUD permissions
INSERT INTO permissions (name, slug, resource, action, description) VALUES
    ('Create User', 'user:create', 'user', 'create', 'Create new users'),
    ('Read User', 'user:read', 'user', 'read', 'View user information'),
    ('Update User', 'user:update', 'user', 'update', 'Update user information'),
    ('Delete User', 'user:delete', 'user', 'delete', 'Delete users'),
    ('Manage User', 'user:manage', 'user', 'manage', 'Full user management'),
    
    ('Create Tenant', 'tenant:create', 'tenant', 'create', 'Create new tenants'),
    ('Read Tenant', 'tenant:read', 'tenant', 'read', 'View tenant information'),
    ('Update Tenant', 'tenant:update', 'tenant', 'update', 'Update tenant information'),
    ('Delete Tenant', 'tenant:delete', 'tenant', 'delete', 'Delete tenants'),
    ('Manage Tenant', 'tenant:manage', 'tenant', 'manage', 'Full tenant management'),
    
    ('Create Service', 'service:create', 'service', 'create', 'Create new services'),
    ('Read Service', 'service:read', 'service', 'read', 'View service information'),
    ('Update Service', 'service:update', 'service', 'update', 'Update service information'),
    ('Delete Service', 'service:delete', 'service', 'delete', 'Delete services'),
    ('Manage Service', 'service:manage', 'service', 'manage', 'Full service management'),
    
    ('Create Role', 'role:create', 'role', 'create', 'Create new roles'),
    ('Read Role', 'role:read', 'role', 'read', 'View role information'),
    ('Update Role', 'role:update', 'role', 'update', 'Update role information'),
    ('Delete Role', 'role:delete', 'role', 'delete', 'Delete roles'),
    ('Manage Role', 'role:manage', 'role', 'manage', 'Full role management'),
    
    ('Assign Role', 'role:assign', 'role', 'assign', 'Assign roles to users'),
    ('Revoke Role', 'role:revoke', 'role', 'revoke', 'Revoke roles from users');

