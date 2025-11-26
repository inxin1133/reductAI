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
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
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
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

-- Column comments for users table
COMMENT ON TABLE users IS '시스템 사용자 정보를 관리하는 테이블';
COMMENT ON COLUMN users.id IS '사용자의 고유 식별자 (UUID)';
COMMENT ON COLUMN users.email IS '사용자의 이메일 주소 (고유값)';
COMMENT ON COLUMN users.username IS '사용자의 로그인 아이디 (고유값)';
COMMENT ON COLUMN users.password_hash IS '암호화된 비밀번호 해시값';
COMMENT ON COLUMN users.full_name IS '사용자의 전체 이름';
COMMENT ON COLUMN users.status IS '사용자 상태: active(활성), inactive(비활성), suspended(정지됨), locked(잠김)';
COMMENT ON COLUMN users.email_verified IS '이메일 인증 완료 여부';
COMMENT ON COLUMN users.last_login_at IS '마지막 로그인 시각';
COMMENT ON COLUMN users.metadata IS '사용자의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN users.created_at IS '사용자 계정 생성 시각';
COMMENT ON COLUMN users.updated_at IS '사용자 정보 최종 수정 시각';
COMMENT ON COLUMN users.deleted_at IS '사용자 계정 삭제 시각 (Soft Delete용, NULL이면 삭제되지 않음)';

-- ============================================
-- 2. TENANT MANAGEMENT
-- ============================================

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    domain VARCHAR(255),
    tenant_type VARCHAR(50) DEFAULT 'personal' CHECK (tenant_type IN ('personal', 'team', 'enterprise')),
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
COMMENT ON COLUMN tenants.tenant_type IS '테넌트 타입: personal(개인), team(팀), enterprise(엔터프라이즈)';
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

CREATE TABLE service_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instance_name VARCHAR(255) NOT NULL,
    endpoint_url VARCHAR(500),
    region VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'degraded', 'down')),
    health_check_url VARCHAR(500),
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(service_id, tenant_id, instance_name)
);

CREATE INDEX idx_service_instances_service_id ON service_instances(service_id);
CREATE INDEX idx_service_instances_tenant_id ON service_instances(tenant_id);
CREATE INDEX idx_service_instances_status ON service_instances(status);

-- Column comments for service_instances table
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

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT FALSE,
    is_global BOOLEAN DEFAULT FALSE, -- Global roles are not tenant-specific
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, slug),
    CHECK (
        (is_global = TRUE AND tenant_id IS NULL) OR
        (is_global = FALSE AND tenant_id IS NOT NULL)
    )
);

CREATE INDEX idx_roles_tenant_id ON roles(tenant_id);
CREATE INDEX idx_roles_slug ON roles(slug);
CREATE INDEX idx_roles_is_global ON roles(is_global);

-- Column comments for roles table
COMMENT ON TABLE roles IS '역할(Role) 정보를 관리하는 테이블. 테넌트별 역할과 글로벌 역할을 지원합니다.';
COMMENT ON COLUMN roles.id IS '역할의 고유 식별자 (UUID)';
COMMENT ON COLUMN roles.tenant_id IS '이 역할이 속한 테넌트 ID (NULL이면 글로벌 역할)';
COMMENT ON COLUMN roles.name IS '역할의 표시 이름 (예: 관리자, 개발자, 뷰어)';
COMMENT ON COLUMN roles.slug IS '역할의 고유 식별 문자열 (같은 테넌트 내에서 고유)';
COMMENT ON COLUMN roles.description IS '역할에 대한 설명';
COMMENT ON COLUMN roles.is_system_role IS '시스템 기본 역할 여부 (시스템 역할은 삭제/수정 제한 가능)';
COMMENT ON COLUMN roles.is_global IS '글로벌 역할 여부 (TRUE면 모든 테넌트에 적용 가능, tenant_id는 NULL이어야 함)';
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
-- 7. RBAC - USER-ROLE MAPPING (Tenant-specific)
-- ============================================

CREATE TABLE user_tenant_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    granted_by UUID REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, tenant_id, role_id)
);

CREATE INDEX idx_user_tenant_roles_user_id ON user_tenant_roles(user_id);
CREATE INDEX idx_user_tenant_roles_tenant_id ON user_tenant_roles(tenant_id);
CREATE INDEX idx_user_tenant_roles_role_id ON user_tenant_roles(role_id);
CREATE INDEX idx_user_tenant_roles_expires_at ON user_tenant_roles(expires_at) WHERE expires_at IS NOT NULL;

-- Column comments for user_tenant_roles table
COMMENT ON TABLE user_tenant_roles IS '사용자에게 테넌트별로 역할을 할당하는 테이블. 한 사용자는 여러 테넌트에서 서로 다른 역할을 가질 수 있습니다.';
COMMENT ON COLUMN user_tenant_roles.id IS '할당 레코드의 고유 식별자 (UUID)';
COMMENT ON COLUMN user_tenant_roles.user_id IS '사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN user_tenant_roles.tenant_id IS '역할이 적용되는 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN user_tenant_roles.role_id IS '할당할 역할 ID (roles 테이블 참조)';
COMMENT ON COLUMN user_tenant_roles.granted_at IS '역할이 사용자에게 부여된 시각';
COMMENT ON COLUMN user_tenant_roles.granted_by IS '역할을 부여한 사용자 ID (users 테이블 참조, 감사 추적용)';
COMMENT ON COLUMN user_tenant_roles.expires_at IS '역할 만료 시각 (NULL이면 만료되지 않음)';

-- ============================================
-- 8. SERVICE ACCESS CONTROL (Tenant-Service Permissions)
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

