-- ============================================
-- LLM Models Management System for Generative AI
-- Multi-Provider LLM Model Selection and Usage Tracking
-- PostgreSQL Database Schema
-- ============================================
--
-- 중요 안내사항:
-- 1. 이 스키마를 적용하기 전에 schema.sql, schema_tenant_membership.sql, schema_tokens.sql이 먼저 실행되어야 합니다.
-- 2. 다양한 LLM 제공업체(OpenAI, Anthropic, Google 등)를 지원합니다.
-- 3. 정확한 과금 산정을 위해 입력/출력 토큰 개수를 별도로 추적합니다.
-- 4. 테넌트/사용자별 선호도 기반 모델 선택 및 라우팅을 지원합니다.
-- 5. 모델 및 제공업체별 비용 추적 기능이 있습니다.
-- 6. 성능 메트릭과 분석도 지원됩니다.
--
-- ============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. AI PROVIDERS (AI 제공업체)
-- ============================================

CREATE TABLE ai_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_family VARCHAR(50) NOT NULL DEFAULT 'custom', -- 벤더 그룹(라우팅/credential 기준) 예: openai, anthropic, google, custom
    name VARCHAR(100) NOT NULL, -- 업체명(표시용) 예: 'OpenAI', 'Google'
    product_name VARCHAR(255) NOT NULL, -- 제품명(표시용) 예: 'ChatGPT', 'Sora', 'Gemini'
    slug VARCHAR(100) NOT NULL UNIQUE,
    logo_key VARCHAR(100), -- UI 로고(아이콘) 키: 프론트에서 key -> React 컴포넌트로 매핑 (예: chatgpt, claude, google)
    description TEXT,
    website_url VARCHAR(500),
    api_base_url VARCHAR(500), -- 기본 API 엔드포인트
    documentation_url VARCHAR(500),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deprecated')),
    is_verified BOOLEAN DEFAULT FALSE, -- 검증된 제공업체 여부
    metadata JSONB DEFAULT '{}', -- 추가 정보 (예: 지원 기능, 제한사항)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_providers_provider_family ON ai_providers(provider_family);

CREATE INDEX idx_ai_providers_slug ON ai_providers(slug);
CREATE INDEX idx_ai_providers_status ON ai_providers(status);

COMMENT ON TABLE ai_providers IS 'AI 제공업체 정보를 관리하는 테이블';
COMMENT ON COLUMN ai_providers.id IS '제공업체의 고유 식별자 (UUID)';
COMMENT ON COLUMN ai_providers.provider_family IS '벤더 그룹(라우팅/공용 credential 기준). 예: openai, anthropic, google, custom';
COMMENT ON COLUMN ai_providers.name IS '업체명(표시용). 예: OpenAI, Google';
COMMENT ON COLUMN ai_providers.product_name IS '제품명(표시용). 예: ChatGPT, Sora, Gemini';
COMMENT ON COLUMN ai_providers.slug IS '제공업체의 고유 식별 문자열';
COMMENT ON COLUMN ai_providers.logo_key IS '프론트 UI에서 표시할 로고(아이콘) 키. 실제 SVG/이미지는 저장하지 않고 key만 저장해 프론트에서 컴포넌트로 매핑합니다.';
COMMENT ON COLUMN ai_providers.description IS '제공업체 설명';
COMMENT ON COLUMN ai_providers.website_url IS '제공업체 웹사이트 URL';
COMMENT ON COLUMN ai_providers.api_base_url IS '기본 API 엔드포인트 URL';
COMMENT ON COLUMN ai_providers.documentation_url IS 'API 문서 URL';
COMMENT ON COLUMN ai_providers.status IS '제공업체 상태: active(활성), inactive(비활성), deprecated(사용 중단)';
COMMENT ON COLUMN ai_providers.is_verified IS '검증된 제공업체 여부';
COMMENT ON COLUMN ai_providers.metadata IS '제공업체의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN ai_providers.created_at IS '제공업체 등록 시각';
COMMENT ON COLUMN ai_providers.updated_at IS '제공업체 정보 최종 수정 시각';

-- ============================================
-- 2. AI MODELS (AI 모델)
-- ============================================

CREATE TABLE ai_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, -- 모델 이름 (예: 'gpt-4', 'claude-3-opus', 'gemini-pro')
    model_id VARCHAR(255) NOT NULL, -- API에서 사용하는 모델 ID
    display_name VARCHAR(255) NOT NULL, -- 표시 이름 (예: 'GPT-4', 'Claude 3 Opus')
    description TEXT,
    model_type VARCHAR(50) NOT NULL CHECK (model_type IN ('text', 'image', 'audio', 'music', 'video', 'multimodal', 'embedding', 'code')),
    capabilities JSONB DEFAULT '{}', -- 모델 지원 기능/제약 메타데이터 (객체 권장) 예: {"supports":{"json_schema":true},"limits":{"max_input_tokens":200000}}
    context_window INTEGER, -- 컨텍스트 윈도우 크기 (토큰 수)
    max_output_tokens INTEGER, -- 최대 출력 토큰 수
    input_token_cost_per_1k DECIMAL(10, 6) DEFAULT 0, -- 입력 토큰당 비용 (1K 토큰 기준)
    output_token_cost_per_1k DECIMAL(10, 6) DEFAULT 0, -- 출력 토큰당 비용 (1K 토큰 기준)
    currency VARCHAR(3) DEFAULT 'USD', -- 통화
    is_available BOOLEAN DEFAULT TRUE, -- 사용 가능 여부
    is_default BOOLEAN DEFAULT FALSE, -- 기본 모델 여부 (같은 타입 내에서)
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deprecated', 'beta')),
    released_at DATE, -- 모델 출시일
    deprecated_at DATE, -- 모델 사용 중단일
    sort_order INTEGER NOT NULL DEFAULT 0, -- 정렬 순서(작을수록 위): admin에서 드래그로 조정
    prompt_template_id UUID REFERENCES prompt_templates(id) ON DELETE SET NULL, -- 모델 기본 프롬프트 템플릿(선택)
    response_schema_id UUID REFERENCES response_schemas(id) ON DELETE SET NULL, -- 모델 출력 계약(JSON schema)(선택)
    metadata JSONB DEFAULT '{}', -- 추가 정보 (예: 파라미터 범위, 제한사항)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_id, model_id)
);

CREATE INDEX idx_ai_models_provider_id ON ai_models(provider_id);
CREATE INDEX idx_ai_models_model_id ON ai_models(model_id);
CREATE INDEX idx_ai_models_model_type ON ai_models(model_type);
CREATE INDEX idx_ai_models_status ON ai_models(status);
CREATE INDEX idx_ai_models_is_available ON ai_models(is_available) WHERE is_available = TRUE;
CREATE INDEX idx_ai_models_is_default ON ai_models(model_type, is_default) WHERE is_default = TRUE;
CREATE INDEX idx_ai_models_sort_order ON ai_models(model_type, sort_order);

COMMENT ON TABLE ai_models IS 'AI 모델 정보를 관리하는 테이블';
COMMENT ON COLUMN ai_models.id IS '모델의 고유 식별자 (UUID)';
COMMENT ON COLUMN ai_models.provider_id IS '제공업체 ID (ai_providers 테이블 참조)';
COMMENT ON COLUMN ai_models.name IS '모델 이름 (예: gpt-4, claude-3-opus)';
COMMENT ON COLUMN ai_models.model_id IS 'API에서 사용하는 모델 ID (예: gpt-4-turbo-preview, claude-3-opus-20240229)';
COMMENT ON COLUMN ai_models.display_name IS '모델 표시 이름 (예: GPT-4 Turbo, Claude 3 Opus)';
COMMENT ON COLUMN ai_models.description IS '모델 설명';
COMMENT ON COLUMN ai_models.model_type IS '모델 타입: text(텍스트), image(이미지), audio(오디오), music(음악), video(비디오), multimodal(멀티모달), embedding(임베딩), code(코드)';
COMMENT ON COLUMN ai_models.capabilities IS '모델 지원 기능/제약 메타데이터 (JSON 객체 권장). 예: {"supports":{"json_schema":true},"limits":{"max_input_tokens":200000}}';
COMMENT ON COLUMN ai_models.context_window IS '컨텍스트 윈도우 크기 (토큰 수, 예: 128000)';
COMMENT ON COLUMN ai_models.max_output_tokens IS '최대 출력 토큰 수';
COMMENT ON COLUMN ai_models.input_token_cost_per_1k IS '입력 토큰당 비용 (1K 토큰 기준, USD)';
COMMENT ON COLUMN ai_models.output_token_cost_per_1k IS '출력 토큰당 비용 (1K 토큰 기준, USD)';
COMMENT ON COLUMN ai_models.currency IS '통화 코드';
COMMENT ON COLUMN ai_models.is_available IS '사용 가능 여부';
COMMENT ON COLUMN ai_models.is_default IS '기본 모델 여부 (같은 타입 내에서 하나만 TRUE)';
COMMENT ON COLUMN ai_models.status IS '모델 상태: active(활성), inactive(비활성), deprecated(사용 중단), beta(베타)';
COMMENT ON COLUMN ai_models.released_at IS '모델 출시일';
COMMENT ON COLUMN ai_models.deprecated_at IS '모델 사용 중단일';
COMMENT ON COLUMN ai_models.sort_order IS '정렬 순서(작을수록 위). admin에서 드래그로 조정하여 선택 박스 출력 순서에 반영';
COMMENT ON COLUMN ai_models.prompt_template_id IS '모델 기본 프롬프트 템플릿 ID (prompt_templates 참조)';
COMMENT ON COLUMN ai_models.response_schema_id IS '모델 출력 계약(JSON schema) ID (response_schemas 참조)';
COMMENT ON COLUMN ai_models.metadata IS '모델의 추가 메타데이터 (JSON 형식, 예: 파라미터 범위, 제한사항)';
COMMENT ON COLUMN ai_models.created_at IS '모델 등록 시각';
COMMENT ON COLUMN ai_models.updated_at IS '모델 정보 최종 수정 시각';

-- ============================================
-- 3. PROVIDER API CREDENTIALS (제공업체 API 인증 정보)
-- ============================================

CREATE TABLE provider_api_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
    credential_name VARCHAR(255) NOT NULL, -- 인증 정보 이름 (예: 'Production Key', 'Development Key')
    api_key_encrypted TEXT NOT NULL, -- 암호화된 API 키
    api_key_hash VARCHAR(255), -- API 키 해시 (검증용)
    endpoint_url VARCHAR(500), -- 커스텀 엔드포인트 URL (선택사항)
    organization_id VARCHAR(255), -- 조직 ID (OpenAI 등에서 사용)
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE, -- 기본 인증 정보 여부
    rate_limit_per_minute INTEGER, -- 분당 요청 제한
    rate_limit_per_day INTEGER, -- 일일 요청 제한
    metadata JSONB DEFAULT '{}', -- 추가 설정
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE, -- 만료 시각
    UNIQUE(tenant_id, provider_id, credential_name)
);

CREATE INDEX idx_provider_api_credentials_tenant_id ON provider_api_credentials(tenant_id);
CREATE INDEX idx_provider_api_credentials_provider_id ON provider_api_credentials(provider_id);
CREATE INDEX idx_provider_api_credentials_is_active ON provider_api_credentials(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_provider_api_credentials_is_default ON provider_api_credentials(tenant_id, provider_id, is_default) WHERE is_default = TRUE;

COMMENT ON TABLE provider_api_credentials IS '테넌트별 AI 제공업체 API 인증 정보를 관리하는 테이블';
COMMENT ON COLUMN provider_api_credentials.id IS '인증 정보의 고유 식별자 (UUID)';
COMMENT ON COLUMN provider_api_credentials.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN provider_api_credentials.provider_id IS '제공업체 ID (ai_providers 테이블 참조)';
COMMENT ON COLUMN provider_api_credentials.credential_name IS '인증 정보 이름 (예: Production Key, Development Key)';
COMMENT ON COLUMN provider_api_credentials.api_key_encrypted IS '암호화된 API 키 (보안을 위해 암호화하여 저장)';
COMMENT ON COLUMN provider_api_credentials.api_key_hash IS 'API 키 해시값 (검증용)';
COMMENT ON COLUMN provider_api_credentials.endpoint_url IS '커스텀 엔드포인트 URL (NULL이면 제공업체 기본 URL 사용)';
COMMENT ON COLUMN provider_api_credentials.organization_id IS '조직 ID (OpenAI 등에서 사용)';
COMMENT ON COLUMN provider_api_credentials.is_active IS '인증 정보 활성화 여부';
COMMENT ON COLUMN provider_api_credentials.is_default IS '기본 인증 정보 여부 (같은 제공업체 내에서 하나만 TRUE)';
COMMENT ON COLUMN provider_api_credentials.rate_limit_per_minute IS '분당 요청 제한';
COMMENT ON COLUMN provider_api_credentials.rate_limit_per_day IS '일일 요청 제한';
COMMENT ON COLUMN provider_api_credentials.metadata IS '인증 정보의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN provider_api_credentials.created_at IS '인증 정보 생성 시각';
COMMENT ON COLUMN provider_api_credentials.updated_at IS '인증 정보 최종 수정 시각';
COMMENT ON COLUMN provider_api_credentials.expires_at IS '인증 정보 만료 시각 (NULL이면 만료되지 않음)';

-- ============================================
-- 3.1 PROVIDER AUTH PROFILES (인증 프로필)
-- ============================================
-- provider_api_credentials의 raw secret/api_key(암호화 저장) 위에,
-- 실제 호출 시 필요한 "인증 방식"을 프로필로 추상화합니다.
--
-- v1 목표:
-- - api_key: 기존과 동일(Authorization Bearer 등)
-- - oauth2_service_account: Google Vertex 등 access_token 발급(서비스 계정 JWT assertion)
--
-- NOTE:
-- - token_cache_key는 서버 메모리 캐시 key 용도(추후 Redis 등으로 확장 가능)
-- - config는 scopes/audience/token_url/region/project_id/location 등 프로필별 파라미터 저장


CREATE TABLE provider_auth_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- 인증 프로필의 고유 식별자 (UUID)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, -- 테넌트 ID (tenants 테이블 참조)
    provider_id UUID NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE, -- 제공업체 ID (ai_providers 테이블 참조)
    profile_key VARCHAR(100) NOT NULL, -- 인증 프로필 key (예: openai_api_key_v1, google_vertex_sa_v1)
    auth_type VARCHAR(50) NOT NULL CHECK (auth_type IN ('api_key', 'oauth2_service_account', 'aws_sigv4', 'azure_ad')), -- 인증 방식
    credential_id UUID NOT NULL REFERENCES provider_api_credentials(id) ON DELETE RESTRICT, -- 사용할 credential 식별자 (provider_api_credentials 테이블 참조)
    config JSONB NOT NULL DEFAULT '{}', -- 인증 프로필의 추가 설정(JSON, scopes, audience 등)
    token_cache_key VARCHAR(255), -- access_token 등 캐시 키 (oauth2 등에서 사용)
    is_active BOOLEAN NOT NULL DEFAULT TRUE, -- 활성화 여부
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- 생성 시각
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- 수정 시각
    UNIQUE (tenant_id, provider_id, profile_key) -- 테넌트+제공업체+프로필키 유니크 보장
);

CREATE INDEX idx_provider_auth_profiles_tenant_provider_active
  ON provider_auth_profiles(tenant_id, provider_id, is_active); -- 테넌트/제공업체별 활성화 프로필 쿼리 최적화
CREATE INDEX idx_provider_auth_profiles_credential_id
  ON provider_auth_profiles(credential_id); -- credential 기준 역방향 탐색 최적화

-- COMMENTs for provider_auth_profiles
COMMENT ON TABLE provider_auth_profiles IS 'AI 제공업체 인증 방식을 프로필로 추상화한 테이블(각 테넌트별)';
COMMENT ON COLUMN provider_auth_profiles.id IS '인증 프로필의 고유 식별자 (UUID)';
COMMENT ON COLUMN provider_auth_profiles.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN provider_auth_profiles.provider_id IS '제공업체 ID (ai_providers 테이블 참조)';
COMMENT ON COLUMN provider_auth_profiles.profile_key IS '인증 프로필 key (예: openai_api_key_v1, google_vertex_sa_v1)';
COMMENT ON COLUMN provider_auth_profiles.auth_type IS '인증 방식(api_key, oauth2_service_account 등)';
COMMENT ON COLUMN provider_auth_profiles.credential_id IS '연결된 실제 provider_api_credentials의 id';
COMMENT ON COLUMN provider_auth_profiles.config IS '프로필별 Parameter, scopes/audience/token_url/project_id/location 등';
COMMENT ON COLUMN provider_auth_profiles.token_cache_key IS '액세스 토큰 등 캐시를 위한 키 (oauth2 등)';
COMMENT ON COLUMN provider_auth_profiles.is_active IS '인증 프로필 활성화 여부';
COMMENT ON COLUMN provider_auth_profiles.created_at IS '인증 프로필 생성 시각';
COMMENT ON COLUMN provider_auth_profiles.updated_at IS '인증 프로필 최종 수정 시각';



-- ============================================
-- 4. TENANT MODEL ACCESS (테넌트별 모델 접근 권한)
-- ============================================

CREATE TABLE tenant_model_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    model_id UUID NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
    credential_id UUID REFERENCES provider_api_credentials(id) ON DELETE SET NULL, -- 사용할 인증 정보
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    access_level VARCHAR(50) DEFAULT 'standard' CHECK (access_level IN ('standard', 'premium', 'enterprise')),
    priority INTEGER DEFAULT 0, -- 모델 선택 우선순위 (높을수록 우선)
    is_preferred BOOLEAN DEFAULT FALSE, -- 선호 모델 여부
    rate_limit_per_minute INTEGER, -- 분당 요청 제한
    rate_limit_per_day INTEGER, -- 일일 요청 제한
    max_tokens_per_request INTEGER, -- 요청당 최대 토큰 수
    allowed_features JSONB DEFAULT '[]', -- 허용된 기능 목록
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, model_id)
);

CREATE INDEX idx_tenant_model_access_tenant_id ON tenant_model_access(tenant_id);
CREATE INDEX idx_tenant_model_access_model_id ON tenant_model_access(model_id);
CREATE INDEX idx_tenant_model_access_credential_id ON tenant_model_access(credential_id);
CREATE INDEX idx_tenant_model_access_status ON tenant_model_access(status);
CREATE INDEX idx_tenant_model_access_priority ON tenant_model_access(tenant_id, priority DESC) WHERE status = 'active';

COMMENT ON TABLE tenant_model_access IS '테넌트별 AI 모델 접근 권한을 관리하는 테이블';
COMMENT ON COLUMN tenant_model_access.id IS '접근 권한의 고유 식별자 (UUID)';
COMMENT ON COLUMN tenant_model_access.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN tenant_model_access.model_id IS '모델 ID (ai_models 테이블 참조)';
COMMENT ON COLUMN tenant_model_access.credential_id IS '사용할 API 인증 정보 ID (provider_api_credentials 테이블 참조)';
COMMENT ON COLUMN tenant_model_access.status IS '접근 상태: active(활성), inactive(비활성), suspended(정지)';
COMMENT ON COLUMN tenant_model_access.access_level IS '접근 레벨: standard(기본), premium(프리미엄), enterprise(엔터프라이즈)';
COMMENT ON COLUMN tenant_model_access.priority IS '모델 선택 우선순위 (높을수록 우선, 같은 우선순위면 랜덤 또는 라운드로빈)';
COMMENT ON COLUMN tenant_model_access.is_preferred IS '선호 모델 여부 (기본 선택 모델)';
COMMENT ON COLUMN tenant_model_access.rate_limit_per_minute IS '분당 요청 제한';
COMMENT ON COLUMN tenant_model_access.rate_limit_per_day IS '일일 요청 제한';
COMMENT ON COLUMN tenant_model_access.max_tokens_per_request IS '요청당 최대 토큰 수';
COMMENT ON COLUMN tenant_model_access.allowed_features IS '허용된 기능 목록 (JSON 배열, 예: ["chat", "completion"])';
COMMENT ON COLUMN tenant_model_access.metadata IS '접근 권한의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN tenant_model_access.created_at IS '접근 권한 생성 시각';
COMMENT ON COLUMN tenant_model_access.updated_at IS '접근 권한 최종 수정 시각';

-- ============================================
-- 5. LLM USAGE LOGS (LLM 사용 로그)
-- ============================================

CREATE TABLE llm_usage_logs (
    -- 🔐 기본 키 / 멀티테넌트
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(255), -- 선택: 재시도/중복요청 방지 및 합치기용 (tenant 단위 unique 권장)

    -- 🤖 모델 / Provider
    provider_id UUID NOT NULL REFERENCES ai_providers(id) ON DELETE RESTRICT,
    requested_model VARCHAR(255) NOT NULL, -- 최초 요청 모델
    resolved_model VARCHAR(255) NOT NULL, -- 실제 사용된 모델 (fallback 반영)
    modality VARCHAR(20) NOT NULL CHECK (modality IN ('text', 'image_read', 'image_create', 'audio', 'video', 'music')),
    region VARCHAR(64), -- 선택: ap-northeast-2 등 (멀티리전/프록시 사용 시 추천)

    -- 웹검색 사용
    web_enabled BOOLEAN NOT NULL DEFAULT FALSE, -- “웹 허용” 켰는지
    web_provider VARCHAR(50), -- serper / bing / google 등
    web_search_mode VARCHAR(20) CHECK (web_search_mode IN ('auto', 'forced', 'off')),
    web_budget_count INTEGER, -- (int) 최대 몇 번까지 허용했는지(가드레일)
    web_search_count INTEGER NOT NULL DEFAULT 0, -- (int) 실제 수행 횟수(집계용)

    -- 🔁 라우팅 / 재시도 체인
    routing_rule_id UUID REFERENCES model_routing_rules(id) ON DELETE SET NULL, -- 적용된 라우팅 규칙
    is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
    fallback_reason VARCHAR(50) CHECK (fallback_reason IN ('rate_limit', 'cost_limit', 'timeout', 'error', 'policy')),
    attempt_index INTEGER, -- 1,2,3… (선택: 재시도/체인 분석용)
    parent_usage_log_id UUID REFERENCES llm_usage_logs(id) ON DELETE SET NULL, -- fallback 체인의 부모 id

    -- 🧾 요청 식별
    request_id VARCHAR(255), -- provider request id (고유 보장 X일 수 있어 unique 제약은 두지 않음)
    conversation_id UUID REFERENCES model_conversations(id) ON DELETE SET NULL,
    model_message_id UUID REFERENCES model_messages(id) ON DELETE SET NULL, -- 실제 응답(assistant message)과 연결(권장)
    prompt_hash CHAR(64), -- SHA-256 hex string (64 chars)
    prompt_length_chars INTEGER,
    prompt_tokens_estimated INTEGER,

    -- 📤 응답 메타
    response_length_chars INTEGER,
    response_bytes BIGINT, -- 선택: 스트리밍 수신 총 바이트
    finish_reason VARCHAR(50) CHECK (finish_reason IN ('stop', 'length', 'content_filter', 'error')),
    content_filtered BOOLEAN NOT NULL DEFAULT FALSE,
    tool_call_count INTEGER NOT NULL DEFAULT 0,

    -- ⏱️ 시간
    provider_created_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    headers_received_at TIMESTAMP WITH TIME ZONE,
    first_token_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    latency_ms INTEGER, -- finished_at - started_at (ms)
    ttfb_ms INTEGER, -- headers_received_at - started_at (ms)
    ttft_ms INTEGER, -- first_token_at - started_at (ms)
    queue_wait_ms INTEGER, -- 내부 큐 대기 (선택)
    network_ms INTEGER, -- 네트워크 추정 (선택)
    server_processing_ms INTEGER, -- 우리 앱 후처리 시간 (선택)

    -- 📊 상태
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
    http_status INTEGER, -- provider 응답 코드 (선택)
    error_code VARCHAR(100),
    error_message TEXT, -- 짧게(요약) 권장
    error_retryable BOOLEAN,

    -- 공통 메타
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Idempotency: tenant 단위로만 unique 권장 (NULL 제외)
CREATE UNIQUE INDEX idx_llm_usage_logs_tenant_idempotency_key
  ON llm_usage_logs(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Provider request id는 provider마다 범위가 다를 수 있어 (provider, request_id) index만 둡니다.
CREATE INDEX idx_llm_usage_logs_provider_request_id
  ON llm_usage_logs(provider_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX idx_llm_usage_logs_tenant_id ON llm_usage_logs(tenant_id);
CREATE INDEX idx_llm_usage_logs_user_id ON llm_usage_logs(user_id);
CREATE INDEX idx_llm_usage_logs_provider_id ON llm_usage_logs(provider_id);
CREATE INDEX idx_llm_usage_logs_modality ON llm_usage_logs(modality);
CREATE INDEX idx_llm_usage_logs_resolved_model ON llm_usage_logs(resolved_model);
CREATE INDEX idx_llm_usage_logs_conversation_id ON llm_usage_logs(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_llm_usage_logs_model_message_id ON llm_usage_logs(model_message_id) WHERE model_message_id IS NOT NULL;
CREATE INDEX idx_llm_usage_logs_routing_rule_id ON llm_usage_logs(routing_rule_id) WHERE routing_rule_id IS NOT NULL;
CREATE INDEX idx_llm_usage_logs_parent_usage_log_id ON llm_usage_logs(parent_usage_log_id) WHERE parent_usage_log_id IS NOT NULL;
CREATE INDEX idx_llm_usage_logs_status ON llm_usage_logs(status);
CREATE INDEX idx_llm_usage_logs_created_at ON llm_usage_logs(created_at);
CREATE INDEX idx_llm_usage_logs_tenant_date ON llm_usage_logs(tenant_id, created_at DESC);

COMMENT ON TABLE llm_usage_logs IS 'LLM 사용 로그 테이블. provider/model/modality, 웹검색, 라우팅/폴백, 시간/상태 메타를 추적합니다.';
COMMENT ON COLUMN llm_usage_logs.id IS '사용 로그 고유 식별자 (UUID)';
COMMENT ON COLUMN llm_usage_logs.tenant_id IS '테넌트 ID (tenants.id)';
COMMENT ON COLUMN llm_usage_logs.user_id IS '사용자 ID (users.id), NULL이면 테넌트 레벨 사용';
COMMENT ON COLUMN llm_usage_logs.idempotency_key IS '중복/재시도 요청 합치기용 키 (tenant 단위 unique 권장)';

COMMENT ON COLUMN llm_usage_logs.provider_id IS 'Provider ID (ai_providers.id)';
COMMENT ON COLUMN llm_usage_logs.requested_model IS '최초 요청 모델';
COMMENT ON COLUMN llm_usage_logs.resolved_model IS '실제 사용 모델(폴백 반영)';
COMMENT ON COLUMN llm_usage_logs.modality IS '모달리티(text/image_read/image_create/audio/video/music)';
COMMENT ON COLUMN llm_usage_logs.region IS '리전(ap-northeast-2 등), 멀티리전/프록시 사용 시 추천';

COMMENT ON COLUMN llm_usage_logs.web_enabled IS '웹검색 허용 여부';
COMMENT ON COLUMN llm_usage_logs.web_provider IS '웹검색 provider(serper/bing/google 등)';
COMMENT ON COLUMN llm_usage_logs.web_search_mode IS '웹검색 모드(auto/forced/off)';
COMMENT ON COLUMN llm_usage_logs.web_budget_count IS '웹검색 최대 허용 횟수(가드레일)';
COMMENT ON COLUMN llm_usage_logs.web_search_count IS '웹검색 실제 수행 횟수';

COMMENT ON COLUMN llm_usage_logs.routing_rule_id IS '적용된 라우팅 규칙(model_routing_rules.id)';
COMMENT ON COLUMN llm_usage_logs.is_fallback IS '폴백 사용 여부';
COMMENT ON COLUMN llm_usage_logs.fallback_reason IS '폴백 사유(rate_limit/cost_limit/timeout/error/policy)';
COMMENT ON COLUMN llm_usage_logs.attempt_index IS '시도 순번(1,2,3...)';
COMMENT ON COLUMN llm_usage_logs.parent_usage_log_id IS '폴백 체인 부모 로그 ID';

COMMENT ON COLUMN llm_usage_logs.request_id IS 'Provider request id (고유 보장 X일 수 있음)';
COMMENT ON COLUMN llm_usage_logs.conversation_id IS '대화 ID (model_conversations.id). message와 별도로 conversation 단위 집계에 사용';
COMMENT ON COLUMN llm_usage_logs.model_message_id IS '연결된 메시지 ID (model_messages.id). 실제 응답(assistant)과 1:1 연결용';
COMMENT ON COLUMN llm_usage_logs.prompt_hash IS '프롬프트 SHA-256 해시(HEX, 64 chars)';
COMMENT ON COLUMN llm_usage_logs.prompt_length_chars IS '프롬프트 문자 길이';
COMMENT ON COLUMN llm_usage_logs.prompt_tokens_estimated IS '프롬프트 토큰 추정값';

COMMENT ON COLUMN llm_usage_logs.response_length_chars IS '응답 문자 길이';
COMMENT ON COLUMN llm_usage_logs.response_bytes IS '응답 수신 바이트(스트리밍/네트워크 분석용)';
COMMENT ON COLUMN llm_usage_logs.finish_reason IS '종료 사유(stop/length/content_filter/error)';
COMMENT ON COLUMN llm_usage_logs.content_filtered IS '정책/필터에 의해 컨텐츠가 필터링 되었는지';
COMMENT ON COLUMN llm_usage_logs.tool_call_count IS '툴 호출 횟수';

COMMENT ON COLUMN llm_usage_logs.provider_created_at IS 'Provider 기준 응답 생성 시각';
COMMENT ON COLUMN llm_usage_logs.started_at IS '우리 서버 요청 시작 시각';
COMMENT ON COLUMN llm_usage_logs.headers_received_at IS '응답 헤더 수신 시각(TTFB 추정)';
COMMENT ON COLUMN llm_usage_logs.first_token_at IS '스트리밍 첫 토큰/첫 chunk 수신 시각(TTFT 추정)';
COMMENT ON COLUMN llm_usage_logs.finished_at IS '우리 서버 수신 완료 시각';
COMMENT ON COLUMN llm_usage_logs.latency_ms IS '총 지연(ms): finished_at - started_at';
COMMENT ON COLUMN llm_usage_logs.ttfb_ms IS 'TTFB(ms): headers_received_at - started_at';
COMMENT ON COLUMN llm_usage_logs.ttft_ms IS 'TTFT(ms): first_token_at - started_at';
COMMENT ON COLUMN llm_usage_logs.queue_wait_ms IS '내부 큐 대기 시간(ms)';
COMMENT ON COLUMN llm_usage_logs.network_ms IS '네트워크 추정 시간(ms)';
COMMENT ON COLUMN llm_usage_logs.server_processing_ms IS '서버 후처리 시간(ms)';

COMMENT ON COLUMN llm_usage_logs.status IS '상태(success/partial/failed)';
COMMENT ON COLUMN llm_usage_logs.http_status IS 'Provider HTTP status';
COMMENT ON COLUMN llm_usage_logs.error_code IS '에러 코드';
COMMENT ON COLUMN llm_usage_logs.error_message IS '에러 메시지(요약 권장)';
COMMENT ON COLUMN llm_usage_logs.error_retryable IS '재시도 가능 여부';

COMMENT ON COLUMN llm_usage_logs.ip_address IS '요청 IP';
COMMENT ON COLUMN llm_usage_logs.user_agent IS '요청 User-Agent';
COMMENT ON COLUMN llm_usage_logs.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN llm_usage_logs.created_at IS '로그 생성 시각';

-- ============================================
-- 6. MODEL PERFORMANCE METRICS (모델 성능 메트릭)
-- ============================================

CREATE TABLE model_performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL이면 전체 테넌트 평균
    metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('response_time', 'success_rate', 'error_rate', 'cost_efficiency', 'quality_score')),
    metric_value DECIMAL(10, 4) NOT NULL, -- 메트릭 값
    sample_size INTEGER DEFAULT 0, -- 샘플 크기
    period_start TIMESTAMP WITH TIME ZONE NOT NULL, -- 측정 기간 시작
    period_end TIMESTAMP WITH TIME ZONE NOT NULL, -- 측정 기간 종료
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_model_performance_metrics_model_id ON model_performance_metrics(model_id);
CREATE INDEX idx_model_performance_metrics_tenant_id ON model_performance_metrics(tenant_id);
CREATE INDEX idx_model_performance_metrics_metric_type ON model_performance_metrics(metric_type);
CREATE INDEX idx_model_performance_metrics_period ON model_performance_metrics(model_id, period_start, period_end);

COMMENT ON TABLE model_performance_metrics IS 'AI 모델 성능 메트릭을 관리하는 테이블';
COMMENT ON COLUMN model_performance_metrics.id IS '메트릭의 고유 식별자 (UUID)';
COMMENT ON COLUMN model_performance_metrics.model_id IS '모델 ID (ai_models 테이블 참조)';
COMMENT ON COLUMN model_performance_metrics.tenant_id IS '테넌트 ID (tenants 테이블 참조, NULL이면 전체 테넌트 평균)';
COMMENT ON COLUMN model_performance_metrics.metric_type IS '메트릭 타입: response_time(응답 시간), success_rate(성공률), error_rate(에러율), cost_efficiency(비용 효율), quality_score(품질 점수)';
COMMENT ON COLUMN model_performance_metrics.metric_value IS '메트릭 값';
COMMENT ON COLUMN model_performance_metrics.sample_size IS '샘플 크기 (측정에 사용된 요청 수)';
COMMENT ON COLUMN model_performance_metrics.period_start IS '측정 기간 시작 시각';
COMMENT ON COLUMN model_performance_metrics.period_end IS '측정 기간 종료 시각';
COMMENT ON COLUMN model_performance_metrics.metadata IS '메트릭의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN model_performance_metrics.created_at IS '메트릭 생성 시각';

-- ============================================
-- 7. MODEL ROUTING RULES (모델 라우팅 규칙)
-- ============================================

CREATE TABLE model_routing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    scope_type VARCHAR(20) NOT NULL DEFAULT 'TENANT' CHECK (scope_type IN ('GLOBAL', 'ROLE', 'TENANT')),
    scope_id UUID NULL,
    rule_name VARCHAR(255) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0, -- 규칙 우선순위 (높을수록 우선)
    conditions JSONB NOT NULL, -- 조건 (예: {"feature": "chat", "max_tokens": 1000})
    target_model_id UUID NOT NULL REFERENCES ai_models(id) ON DELETE RESTRICT, -- 대상 모델
    fallback_model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL, -- 폴백 모델
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_model_routing_rules_tenant_id ON model_routing_rules(tenant_id);
CREATE INDEX idx_model_routing_rules_target_model_id ON model_routing_rules(target_model_id);
CREATE INDEX idx_model_routing_rules_priority ON model_routing_rules(tenant_id, priority DESC) WHERE is_active = TRUE;

-- scope 무결성: TENANT면 scope_id 필수, GLOBAL이면 scope_id NULL 권장
ALTER TABLE model_routing_rules
ADD CONSTRAINT chk_scope_id_required
CHECK (
  (scope_type = 'GLOBAL' AND scope_id IS NULL)
  OR (scope_type IN ('ROLE','TENANT') AND scope_id IS NOT NULL)
);

-- (중요) unique 제약 확장
-- 기존: UNIQUE(tenant_id, rule_name)
-- 목표: UNIQUE(scope_type, scope_id, rule_name)
CREATE UNIQUE INDEX uq_model_routing_rules_scope_rule_name
ON model_routing_rules(scope_type, scope_id, rule_name);

COMMENT ON TABLE model_routing_rules IS '모델 라우팅 규칙을 관리하는 테이블. 조건에 따라 자동으로 모델을 선택합니다.';
COMMENT ON COLUMN model_routing_rules.id IS '라우팅 규칙의 고유 식별자 (UUID)';
COMMENT ON COLUMN model_routing_rules.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN model_routing_rules.scope_type IS '규칙 적용 스코프: GLOBAL(전역), ROLE(역할), TENANT(테넌트)';
COMMENT ON COLUMN model_routing_rules.scope_id IS '스코프 식별자 (GLOBAL이면 NULL, ROLE/TENANT면 UUID 필수)';
COMMENT ON COLUMN model_routing_rules.rule_name IS '규칙 이름';
COMMENT ON COLUMN model_routing_rules.priority IS '규칙 우선순위 (높을수록 우선 적용)';
COMMENT ON COLUMN model_routing_rules.conditions IS '라우팅 조건 (JSON 형식, 예: {"feature": "chat", "max_tokens": {"$lt": 1000}, "language": "ko"})';
COMMENT ON COLUMN model_routing_rules.target_model_id IS '대상 모델 ID (조건이 만족될 때 사용할 모델)';
COMMENT ON COLUMN model_routing_rules.fallback_model_id IS '폴백 모델 ID (대상 모델이 사용 불가능할 때 사용)';
COMMENT ON COLUMN model_routing_rules.is_active IS '규칙 활성화 여부';
COMMENT ON COLUMN model_routing_rules.metadata IS '규칙의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN model_routing_rules.created_at IS '규칙 생성 시각';
COMMENT ON COLUMN model_routing_rules.updated_at IS '규칙 최종 수정 시각';

-- ============================================
-- 7.1 PROMPT TEMPLATES (프롬프트 템플릿)
-- ============================================
-- 목적(purpose)에 따라 재사용 가능한 프롬프트/Responses API 요청 바디를 저장합니다.
-- - body: Responses API body(JSON). 예: {"model":"gpt-4.1-mini","input":[...],"text":{"format":...}}
-- - 운영에서는 tenant scope 확장/버전 정책 등을 요구사항에 맞게 보강하세요.

CREATE TABLE prompt_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- 템플릿 이름(식별자)
    purpose VARCHAR(50) NOT NULL, -- documentation, chat, code, summary 등
    body JSONB NOT NULL, -- Responses API body(JSON)
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, name, version)
);

CREATE INDEX idx_prompt_templates_tenant_id ON prompt_templates(tenant_id);
CREATE INDEX idx_prompt_templates_purpose ON prompt_templates(tenant_id, purpose);
CREATE INDEX idx_prompt_templates_is_active ON prompt_templates(tenant_id, is_active) WHERE is_active = TRUE;

COMMENT ON TABLE prompt_templates IS '프롬프트/Responses API 요청 바디 템플릿을 저장하는 테이블';
COMMENT ON COLUMN prompt_templates.id IS '템플릿의 고유 식별자 (UUID)';
COMMENT ON COLUMN prompt_templates.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN prompt_templates.name IS '템플릿 이름';
COMMENT ON COLUMN prompt_templates.purpose IS '템플릿 목적(예: documentation, chat, code, summary)';
COMMENT ON COLUMN prompt_templates.body IS 'Responses API body(JSON)';
COMMENT ON COLUMN prompt_templates.version IS '템플릿 버전(정수)';
COMMENT ON COLUMN prompt_templates.is_active IS '활성 템플릿 여부';
COMMENT ON COLUMN prompt_templates.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN prompt_templates.created_at IS '생성 시각';
COMMENT ON COLUMN prompt_templates.updated_at IS '최종 수정 시각';

-- ============================================
-- 7.2 RESPONSE SCHEMAS (출력 계약 / JSON Schema)
-- ============================================
-- 모델 출력 형식을 "계약(contract)"으로 관리합니다.
-- 예: name="block_json", schema={...}, strict=true
-- 모델 연결은 ai_models.response_schema_id 로 합니다.

CREATE TABLE response_schemas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    strict BOOLEAN NOT NULL DEFAULT TRUE,
    schema JSONB NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, name, version)
);

CREATE INDEX idx_response_schemas_tenant_id ON response_schemas(tenant_id);
CREATE INDEX idx_response_schemas_name ON response_schemas(tenant_id, name);
CREATE INDEX idx_response_schemas_is_active ON response_schemas(tenant_id, is_active) WHERE is_active = TRUE;
-- JSONB 조회 가속(특정 키 검색이 필요할 경우)
CREATE INDEX idx_response_schemas_schema_gin ON response_schemas USING GIN (schema);

COMMENT ON TABLE response_schemas IS '모델 출력 형식(JSON Schema 기반 계약)을 관리하는 테이블';
COMMENT ON COLUMN response_schemas.id IS '출력 계약의 고유 식별자 (UUID)';
COMMENT ON COLUMN response_schemas.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN response_schemas.name IS '계약 이름 (예: block_json)';
COMMENT ON COLUMN response_schemas.version IS '계약 버전 (정수)';
COMMENT ON COLUMN response_schemas.strict IS 'OpenAI json_schema strict 여부';
COMMENT ON COLUMN response_schemas.schema IS 'JSON Schema 본문(JSON 객체)';
COMMENT ON COLUMN response_schemas.description IS '설명';
COMMENT ON COLUMN response_schemas.is_active IS '활성 여부';
COMMENT ON COLUMN response_schemas.created_at IS '생성 시각';
COMMENT ON COLUMN response_schemas.updated_at IS '최종 수정 시각';

-- ============================================
-- 7.3 PROMPT SUGGESTIONS (채팅/생성 UI 예시 프롬프트)
-- ============================================
-- 채팅 입력창 하단 등에서 "클릭하면 입력창에 채워지는" 예시 프롬프트를 관리합니다.
-- - 탭(모드) 기준으로 노출을 맞추기 위해 model_type을 둡니다. (ai_models.model_type과 동일 enum 권장)
-- - 특정 모델에만 노출하고 싶으면 model_id를 지정합니다.
-- - scope_type/scope_id는 라우팅 규칙과 동일한 방식으로 전역/테넌트/역할 등에 따라 노출을 제어하기 위한 확장 포인트입니다.

CREATE TABLE prompt_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    scope_type VARCHAR(20) NOT NULL DEFAULT 'TENANT' CHECK (scope_type IN ('GLOBAL', 'ROLE', 'TENANT')),
    scope_id UUID NULL,

    model_type VARCHAR(50) NULL CHECK (model_type IN ('text', 'image', 'audio', 'music', 'video', 'multimodal', 'embedding', 'code')),
    model_id UUID NULL REFERENCES ai_models(id) ON DELETE SET NULL,

    title VARCHAR(100),
    text TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}',

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- scope 무결성: TENANT/ROLE이면 scope_id 필수, GLOBAL이면 scope_id NULL 권장
ALTER TABLE prompt_suggestions
ADD CONSTRAINT chk_prompt_suggestions_scope_id_required
CHECK (
  (scope_type = 'GLOBAL' AND scope_id IS NULL)
  OR (scope_type IN ('ROLE','TENANT') AND scope_id IS NOT NULL)
);

CREATE INDEX idx_prompt_suggestions_scope ON prompt_suggestions(scope_type, scope_id);
CREATE INDEX idx_prompt_suggestions_tenant_active ON prompt_suggestions(tenant_id, is_active, sort_order);
CREATE INDEX idx_prompt_suggestions_model ON prompt_suggestions(model_id);
CREATE INDEX idx_prompt_suggestions_model_type ON prompt_suggestions(model_type);

COMMENT ON TABLE prompt_suggestions IS '채팅/생성 UI 하단 등에 표시하는 예시 프롬프트(클릭 시 입력창에 채움)를 관리하는 테이블';
COMMENT ON COLUMN prompt_suggestions.id IS '예시 프롬프트의 고유 식별자 (UUID)';
COMMENT ON COLUMN prompt_suggestions.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN prompt_suggestions.scope_type IS '노출 스코프: GLOBAL(전역), ROLE(역할), TENANT(테넌트)';
COMMENT ON COLUMN prompt_suggestions.scope_id IS '스코프 식별자 (GLOBAL이면 NULL, ROLE/TENANT면 UUID 필수)';
COMMENT ON COLUMN prompt_suggestions.model_type IS '모드/탭 기준 모델 타입(선택). ai_models.model_type과 동일 enum 권장';
COMMENT ON COLUMN prompt_suggestions.model_id IS '특정 모델에만 노출할 때 지정하는 모델 ID (ai_models 참조)';
COMMENT ON COLUMN prompt_suggestions.title IS 'UI에 표시할 짧은 제목(선택)';
COMMENT ON COLUMN prompt_suggestions.text IS '클릭 시 채팅 입력창에 채워질 예시 프롬프트 본문';
COMMENT ON COLUMN prompt_suggestions.sort_order IS '표시 순서(작을수록 위)';
COMMENT ON COLUMN prompt_suggestions.is_active IS '활성 여부';
COMMENT ON COLUMN prompt_suggestions.metadata IS '추가 메타데이터(JSON). 예: {"tags":["research"],"lang":"ko"}';
COMMENT ON COLUMN prompt_suggestions.created_at IS '생성 시각';
COMMENT ON COLUMN prompt_suggestions.updated_at IS '최종 수정 시각';

-- ============================================
-- 7.4 MODEL API PROFILES (Provider별 호출/응답 프로필)
-- ============================================
-- 목적(purpose: chat/image/audio/music/video/...)별로
-- "어떤 엔드포인트를 어떤 바디/헤더로 호출하고", "응답을 어떻게 추출/표준화할지"를 DB에서 정의합니다.
-- - 최소 스펙 표준안: document/model_api_profiles_standard.md 참고
--
-- 선택 규칙(권장):
-- 1) tenant_id + provider_id + purpose + model_id(정확히 일치) + is_active=true
-- 2) tenant_id + provider_id + purpose + model_id IS NULL + is_active=true

CREATE TABLE model_api_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
    model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL, -- 모델 종속이면 지정, 공용이면 NULL 가능
    profile_key VARCHAR(120) NOT NULL, -- 예: openai.images.generate.v1
    purpose VARCHAR(50) NOT NULL CHECK (purpose IN ('chat','image','video','audio','music','multimodal','embedding','code')),
    -- v1에서는 provider_api_credentials(api_key/endpoint_url)를 직접 사용하므로 auth_profile은 추후 확장 포인트로 둡니다.
    auth_profile_id UUID NULL,
    transport JSONB NOT NULL,          -- method/path/body/headers/retry/timeout
    response_mapping JSONB NOT NULL,   -- extract rules / result_type 등
    workflow JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, provider_id, profile_key)
);

CREATE INDEX idx_model_api_profiles_tenant_provider_purpose
  ON model_api_profiles(tenant_id, provider_id, purpose, is_active);
CREATE INDEX idx_model_api_profiles_model_id
  ON model_api_profiles(model_id);
CREATE INDEX idx_model_api_profiles_profile_key
  ON model_api_profiles(tenant_id, profile_key);

COMMENT ON TABLE model_api_profiles IS 'Provider/모달리티별 API 호출/응답 매핑 프로필';
COMMENT ON COLUMN model_api_profiles.profile_key IS '프로필 식별 키(버전 포함) 예: openai.images.generate.v1';
COMMENT ON COLUMN model_api_profiles.transport IS '호출 스펙(JSON): method/path/headers/body/timeout/retry';
COMMENT ON COLUMN model_api_profiles.response_mapping IS '응답 추출/표준화(JSON): result_type + extract paths 등';
COMMENT ON COLUMN model_api_profiles.id IS '모델 API 프로필의 고유 식별자 (UUID)';
COMMENT ON COLUMN model_api_profiles.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN model_api_profiles.provider_id IS 'AI Provider ID (ai_providers 테이블 참조)';
COMMENT ON COLUMN model_api_profiles.model_id IS '적용되는 모델 ID (ai_models 테이블 참조, NULL이면 provider/목적의 공통 프로필)';
COMMENT ON COLUMN model_api_profiles.purpose IS '모달리티 목적: chat/image/audio/video 등, 표준 enum값만 허용';
COMMENT ON COLUMN model_api_profiles.auth_profile_id IS 'API 인증/자격 정보 세트 ID (예비 필드, 추후 확장용)';
COMMENT ON COLUMN model_api_profiles.workflow IS '프로필별 후처리 워크플로우(확장 포인트, JSON 형태)';
COMMENT ON COLUMN model_api_profiles.is_active IS '프로필 활성 여부 (true면 사용, false는 비활성/과거 버전)';
COMMENT ON COLUMN model_api_profiles.created_at IS '프로필 생성 시각';
COMMENT ON COLUMN model_api_profiles.updated_at IS '프로필 최종 수정 시각';


-- ============================================
-- 8. MODEL CONVERSATIONS (모델 대화 세션)
-- ============================================

CREATE TABLE model_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    model_id UUID NOT NULL REFERENCES ai_models(id) ON DELETE RESTRICT,
    title VARCHAR(500), -- 대화 제목
    system_prompt TEXT, -- 시스템 프롬프트
    conversation_summary TEXT, -- 대화 요약(대화 목록/미리보기용)
    conversation_summary_updated_at TIMESTAMP WITH TIME ZONE, -- 대화 요약 업데이트 시각
    conversation_summary_tokens INTEGER DEFAULT 0, -- 대화 요약 토큰 수(추적용)
    total_tokens INTEGER DEFAULT 0, -- 총 사용 토큰 수
    message_count INTEGER DEFAULT 0, -- 메시지 수
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_model_conversations_tenant_id ON model_conversations(tenant_id);
CREATE INDEX idx_model_conversations_user_id ON model_conversations(user_id);
CREATE INDEX idx_model_conversations_model_id ON model_conversations(model_id);
CREATE INDEX idx_model_conversations_status ON model_conversations(status);
CREATE INDEX idx_model_conversations_created_at ON model_conversations(tenant_id, created_at DESC);
CREATE INDEX idx_model_conversations_updated_at ON model_conversations(tenant_id, updated_at DESC);

COMMENT ON TABLE model_conversations IS 'AI 모델 대화 세션을 관리하는 테이블. 채팅 히스토리를 추적합니다.';
COMMENT ON COLUMN model_conversations.id IS '대화 세션의 고유 식별자 (UUID)';
COMMENT ON COLUMN model_conversations.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN model_conversations.user_id IS '사용자 ID (users 테이블 참조, NULL이면 테넌트 레벨)';
COMMENT ON COLUMN model_conversations.model_id IS '사용한 모델 ID (ai_models 테이블 참조)';
COMMENT ON COLUMN model_conversations.title IS '대화 제목';
COMMENT ON COLUMN model_conversations.system_prompt IS '시스템 프롬프트';
COMMENT ON COLUMN model_conversations.conversation_summary IS '대화 요약(대화 목록/미리보기용)';
COMMENT ON COLUMN model_conversations.conversation_summary_updated_at IS '대화 요약 업데이트 시각';
COMMENT ON COLUMN model_conversations.conversation_summary_tokens IS '대화 요약 토큰 수(추적용)';
COMMENT ON COLUMN model_conversations.total_tokens IS '총 사용 토큰 수';
COMMENT ON COLUMN model_conversations.message_count IS '메시지 수';
COMMENT ON COLUMN model_conversations.status IS '대화 상태: active(활성), archived(보관), deleted(삭제)';
COMMENT ON COLUMN model_conversations.metadata IS '대화의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN model_conversations.created_at IS '대화 생성 시각';
COMMENT ON COLUMN model_conversations.updated_at IS '대화 최종 수정 시각';
COMMENT ON COLUMN model_conversations.archived_at IS '대화 보관 시각';

-- ============================================
-- 8.1 MODEL CONVERSATION READS (대화 읽음 상태)
-- ============================================
-- 목적:
-- - 사용자/기기(브라우저)가 달라도 동일한 "미확인(읽지 않음)" 상태를 유지하기 위해
--   대화별 마지막 확인한 assistant message_order를 저장합니다.
--
-- NOTE:
-- - unread 계산은 last_assistant_order > last_seen_assistant_order 로 판단합니다.

CREATE TABLE IF NOT EXISTS model_conversation_reads (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES model_conversations(id) ON DELETE CASCADE,
    last_seen_assistant_order INTEGER NOT NULL DEFAULT 0,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_model_conversation_reads_conversation
  ON model_conversation_reads(conversation_id);

COMMENT ON TABLE model_conversation_reads IS '대화(Conversation)의 사용자별 읽음 상태(마지막 확인한 assistant message_order)를 저장합니다.';
COMMENT ON COLUMN model_conversation_reads.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN model_conversation_reads.user_id IS '사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN model_conversation_reads.conversation_id IS '대화 ID (model_conversations 테이블 참조)';
COMMENT ON COLUMN model_conversation_reads.last_seen_assistant_order IS '사용자가 마지막으로 확인한 assistant 메시지의 message_order';
COMMENT ON COLUMN model_conversation_reads.last_seen_at IS '마지막 확인 시각';
COMMENT ON COLUMN model_conversation_reads.created_at IS '레코드 생성 시각';
COMMENT ON COLUMN model_conversation_reads.updated_at IS '레코드 수정 시각';

-- ============================================
-- 9. MODEL MESSAGES (모델 메시지)
-- ============================================

CREATE TABLE model_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES model_conversations(id) ON DELETE CASCADE,
    parent_message_id UUID NULL REFERENCES model_messages(id) ON DELETE SET NULL, -- 스레드/요약 재료 묶음 등 계층 구조 지원
    role VARCHAR(50) NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'function', 'tool')),
    content JSONB NOT NULL, -- 메시지 내용(JSON)
    content_text TEXT, -- 자주 쓰는 텍스트를 빠르게 꺼내기 위한 캐시(선택)
    summary TEXT, -- 메시지 요약(표시/검색용)
    summary_tokens INTEGER DEFAULT 0, -- 요약 토큰 수(추적용)
    importance SMALLINT NOT NULL DEFAULT 0 CHECK (importance BETWEEN 0 AND 3), -- 0(기본)~3(매우 중요)
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE, -- 고정(핀)
    segment_group VARCHAR(50) CHECK (segment_group IN ('normal', 'summary_material', 'retrieved')), -- 메시지 그룹(선택)
    function_name VARCHAR(255), -- 함수 이름 (role이 function인 경우)
    function_call_id VARCHAR(255), -- 함수 호출 ID
    status VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (status IN ('none', 'in_progress', 'success', 'failed', 'stopped')), -- 메시지 처리 상태
    input_tokens INTEGER DEFAULT 0, -- 입력 토큰 수
    cached_input_tokens INTEGER DEFAULT 0, -- 캐시 히트 입력 토큰 수
    output_tokens INTEGER DEFAULT 0, -- 출력 토큰 수
    message_order INTEGER NOT NULL, -- 메시지 순서
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX idx_model_messages_conversation_id ON model_messages(conversation_id);
CREATE INDEX idx_model_messages_role ON model_messages(role);
CREATE INDEX idx_model_messages_order ON model_messages(conversation_id, message_order);
CREATE INDEX idx_model_messages_parent_message_id ON model_messages(parent_message_id);
CREATE INDEX idx_model_messages_segment_group ON model_messages(conversation_id, segment_group);
CREATE INDEX idx_model_messages_importance ON model_messages(conversation_id, importance DESC);
CREATE INDEX idx_model_messages_is_pinned ON model_messages(conversation_id, is_pinned) WHERE is_pinned = TRUE;

COMMENT ON TABLE model_messages IS 'AI 모델 대화 메시지를 관리하는 테이블';
COMMENT ON COLUMN model_messages.id IS '메시지의 고유 식별자 (UUID)';
COMMENT ON COLUMN model_messages.conversation_id IS '대화 세션 ID (model_conversations 테이블 참조)';
COMMENT ON COLUMN model_messages.parent_message_id IS '부모 메시지 ID (스레드/요약 재료 묶음 등 계층 구조 지원)';
COMMENT ON COLUMN model_messages.role IS '메시지 역할: system(시스템), user(사용자), assistant(어시스턴트), function(함수), tool(도구)';
COMMENT ON COLUMN model_messages.content IS '메시지 내용';
COMMENT ON COLUMN model_messages.content_text IS '자주 쓰는 텍스트를 빠르게 꺼내기 위한 캐시(선택)';
COMMENT ON COLUMN model_messages.summary IS '메시지 요약(표시/검색용)';
COMMENT ON COLUMN model_messages.summary_tokens IS '요약 토큰 수(추적용)';
COMMENT ON COLUMN model_messages.importance IS '중요도(0~3). 요약/핀/검색에 사용';
COMMENT ON COLUMN model_messages.is_pinned IS '고정(핀) 여부';
COMMENT ON COLUMN model_messages.segment_group IS '메시지 그룹(예: normal, summary_material, retrieved)';
COMMENT ON COLUMN model_messages.function_name IS '함수 이름 (role이 function인 경우)';
COMMENT ON COLUMN model_messages.function_call_id IS '함수 호출 ID (함수 호출 추적용)';
COMMENT ON COLUMN model_messages.status IS '메시지 처리 상태: none/in_progress/success/failed/stopped';
COMMENT ON COLUMN model_messages.input_tokens IS '입력 토큰 수';
COMMENT ON COLUMN model_messages.cached_input_tokens IS '캐시 히트 입력 토큰 수';
COMMENT ON COLUMN model_messages.output_tokens IS '출력 토큰 수';
COMMENT ON COLUMN model_messages.message_order IS '메시지 순서 (대화 내에서의 순서)';
COMMENT ON COLUMN model_messages.metadata IS '메시지의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN model_messages.created_at IS '메시지 생성 시각';
COMMENT ON COLUMN model_messages.updated_at IS '메시지 최종 수정 시각';


-- ============================================
-- 6.3 MESSAGE MEDIA ASSETS (메시지 첨부 미디어 자산)
-- ============================================
-- 목적:
-- - 이미지/오디오/비디오 등의 "대용량 결과"를 model_messages.content(JSONB)에 base64로 직접 저장하지 않고,
--   별도 자산 테이블 + 외부 스토리지(S3/GCS/R2 등)로 분리하여 성능/확장성을 확보합니다.
--
-- 설계 원칙:
-- - message_media_assets는 메시지와 1:N 관계(한 메시지에서 여러 이미지 가능)
-- - 저장 위치는 storage_provider + storage_key + (optional) public_url로 추상화
-- - 향후 저장 서버 분리(media-service) 시에도 URL/키 규약을 유지하기 쉬움

CREATE TABLE IF NOT EXISTS message_media_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    conversation_id UUID NOT NULL REFERENCES model_conversations(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES model_messages(id) ON DELETE CASCADE,

    kind VARCHAR(30) NOT NULL CHECK (kind IN ('image','audio','video','file')),
    mime VARCHAR(120),
    bytes BIGINT,
    sha256 VARCHAR(64), -- content hash (dedupe/verify)

    status VARCHAR(30) NOT NULL DEFAULT 'stored' CHECK (status IN ('pending','stored','failed')),

    storage_provider VARCHAR(30) NOT NULL DEFAULT 'db_proxy' CHECK (storage_provider IN ('db_proxy','local_fs','s3','gcs','r2','http')),
    storage_bucket VARCHAR(255),
    storage_key VARCHAR(1000),
    public_url TEXT, -- public or signed URL (when using external storage)
    is_private BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE,

    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_message_media_assets_tenant ON message_media_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_message_media_assets_message ON message_media_assets(message_id);
CREATE INDEX IF NOT EXISTS idx_message_media_assets_conversation ON message_media_assets(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_media_assets_kind ON message_media_assets(kind);
CREATE INDEX IF NOT EXISTS idx_message_media_assets_sha256 ON message_media_assets(sha256);

-- COMMENTs for message_media_assets
COMMENT ON TABLE message_media_assets IS 'AI 대화(message)와 연결된 첨부 미디어(이미지/오디오/비디오/파일 등)의 메타데이터 및 저장 위치를 관리하는 테이블';
COMMENT ON COLUMN message_media_assets.id IS '미디어 자산의 고유 식별자 (UUID)';
COMMENT ON COLUMN message_media_assets.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN message_media_assets.user_id IS '첨부 파일 업로드/생성한 유저 ID (NULL일 수 있음)';
COMMENT ON COLUMN message_media_assets.conversation_id IS '연결된 대화 세션 ID (model_conversations 테이블 참조)';
COMMENT ON COLUMN message_media_assets.message_id IS '연결된 메시지 ID (model_messages 테이블 참조)';
COMMENT ON COLUMN message_media_assets.kind IS '미디어 종류(image, audio, video, file)';
COMMENT ON COLUMN message_media_assets.mime IS 'MIME 타입(ex: image/png, audio/mpeg 등)';
COMMENT ON COLUMN message_media_assets.bytes IS '파일 용량(byte 단위)';
COMMENT ON COLUMN message_media_assets.sha256 IS '콘텐츠 해시(SHA256, 중복 방지 및 검증)';
COMMENT ON COLUMN message_media_assets.status IS '미디어 데이터 저장 상태(pending, stored, failed)';
COMMENT ON COLUMN message_media_assets.storage_provider IS '저장소 유형(db_proxy, local_fs, s3, gcs, r2, http 등)';
COMMENT ON COLUMN message_media_assets.storage_bucket IS '스토리지 버킷 명(ex: S3/Google Cloud Storage 등)';
COMMENT ON COLUMN message_media_assets.storage_key IS '스토리지 내 고유 키/경로';
COMMENT ON COLUMN message_media_assets.public_url IS '공개 접근 URL(외부 스토리지/S3 presign 등)';
COMMENT ON COLUMN message_media_assets.is_private IS '비공개 여부(공개 URL이 없는 경우 TRUE)';
COMMENT ON COLUMN message_media_assets.expires_at IS '만료 시각(외부 인증/임시 URL의 경우)';
COMMENT ON COLUMN message_media_assets.width IS '이미지/비디오의 폭(px), 해당되는 경우';
COMMENT ON COLUMN message_media_assets.height IS '이미지/비디오의 높이(px), 해당되는 경우';
COMMENT ON COLUMN message_media_assets.duration_ms IS '오디오/비디오의 재생 길이(ms), 해당되는 경우';
COMMENT ON COLUMN message_media_assets.metadata IS '추가 메타데이터(JSONB, 모델/생성 파라미터 등)';
COMMENT ON COLUMN message_media_assets.created_at IS '자산 레코드 생성 시각';
COMMENT ON COLUMN message_media_assets.updated_at IS '자산 레코드 수정 시각';


-- ============================================
-- 10. TRIGGERS FOR UPDATED_AT
-- ============================================

-- Reuse the function from main schema if it exists, otherwise create  
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ language 'plpgsql';
    END IF;
END $$;

CREATE TRIGGER update_ai_providers_updated_at BEFORE UPDATE ON ai_providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_models_updated_at BEFORE UPDATE ON ai_models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_provider_api_credentials_updated_at BEFORE UPDATE ON provider_api_credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_model_access_updated_at BEFORE UPDATE ON tenant_model_access
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_model_routing_rules_updated_at BEFORE UPDATE ON model_routing_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_model_conversations_updated_at BEFORE UPDATE ON model_conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_model_messages_updated_at BEFORE UPDATE ON model_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 11. FUNCTIONS FOR AUTOMATIC UPDATES
-- ============================================

-- Function to update conversation token count
CREATE OR REPLACE FUNCTION update_conversation_tokens()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE model_conversations
        SET 
            total_tokens = total_tokens + COALESCE(NEW.input_tokens, 0) + COALESCE(NEW.output_tokens, 0),
            message_count = message_count + 1
        WHERE id = NEW.conversation_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE model_conversations
        SET 
            total_tokens = GREATEST(total_tokens - COALESCE(OLD.input_tokens, 0) - COALESCE(OLD.output_tokens, 0), 0),
            message_count = GREATEST(message_count - 1, 0)
        WHERE id = OLD.conversation_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

COMMENT ON FUNCTION update_conversation_tokens() IS '대화 세션의 토큰 수와 메시지 수를 자동으로 업데이트하는 트리거 함수';

CREATE TRIGGER trigger_update_conversation_tokens
    AFTER INSERT OR DELETE ON model_messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_tokens();

-- Function to calculate total cost from usage log
CREATE OR REPLACE FUNCTION calculate_model_usage_cost(
    p_input_tokens INTEGER,
    p_output_tokens INTEGER,
    p_input_cost_per_1k DECIMAL,
    p_output_cost_per_1k DECIMAL
)
RETURNS DECIMAL AS $$
BEGIN
    RETURN (p_input_tokens::DECIMAL / 1000.0 * p_input_cost_per_1k) + 
           (p_output_tokens::DECIMAL / 1000.0 * p_output_cost_per_1k);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_model_usage_cost IS '모델 사용 비용을 계산하는 함수 (입력/출력 토큰 분리)';

-- ============================================
-- 12. INITIAL DATA - DEFAULT PROVIDERS AND MODELS
-- ============================================

-- Default AI providers
INSERT INTO ai_providers (provider_family, name, product_name, slug, description, api_base_url, status, is_verified) VALUES
    ('openai', 'OpenAI', 'OpenAI', 'openai', 'OpenAI provides GPT models including GPT-4, GPT-3.5, and embeddings', 'https://api.openai.com/v1', 'active', TRUE),
    ('anthropic', 'Anthropic', 'Anthropic', 'anthropic', 'Anthropic provides Claude models including Claude 3 Opus, Sonnet, and Haiku', 'https://api.anthropic.com/v1', 'active', TRUE),
    ('google', 'Google', 'Google AI', 'google', 'Google provides Gemini models and PaLM', 'https://generativelanguage.googleapis.com/v1', 'active', TRUE),
    ('cohere', 'Cohere', 'Cohere', 'cohere', 'Cohere provides language models and embeddings', 'https://api.cohere.ai/v1', 'active', TRUE),
    ('mistral', 'Mistral', 'Mistral AI', 'mistral', 'Mistral AI provides high-performance language models', 'https://api.mistral.ai/v1', 'active', TRUE)
ON CONFLICT (slug) DO NOTHING;



-- ============================================
-- 13. INTEGRATION WITH TOKEN SYSTEM
-- ============================================

-- NOTE: Model usage should be tracked in both model_usage_logs and token_usage_logs
-- When a model is used:
-- 1. Create entry in model_usage_logs with detailed model-specific information
-- 2. Create entry in token_usage_logs with total token amount for billing
-- 3. Link them using token_usage_log_id in model_usage_logs

-- Example integration:
-- BEGIN;
--   -- 1. Record in token_usage_logs
--   INSERT INTO token_usage_logs (
--     tenant_id, user_id, service_id, feature_name, 
--     token_amount, usage_type, request_id
--   ) VALUES (?, ?, ?, 'ai_chat', ?, 'prepaid', ?)
--   RETURNING id INTO token_log_id;
--   
--   -- 2. Record in model_usage_logs with details
--   INSERT INTO model_usage_logs (
--     tenant_id, user_id, model_id, credential_id,
--     token_usage_log_id, feature_name, request_id,
--     input_tokens, output_tokens, total_tokens,
--     input_cost, output_cost, total_cost, status
--   ) VALUES (?, ?, ?, ?, token_log_id, 'chat', ?, 
--             input_tokens, output_tokens, total_tokens,
--             input_cost, output_cost, total_cost, 'success');
-- COMMIT;

-- ============================================
-- 14. USAGE EXAMPLES
-- ============================================

-- Example 1: Get available models for a tenant
-- SELECT m.*, p.name as provider_name
-- FROM ai_models m
-- JOIN ai_providers p ON m.provider_id = p.id
-- JOIN tenant_model_access tma ON m.id = tma.model_id
-- WHERE tma.tenant_id = ? AND tma.status = 'active' AND m.is_available = TRUE
-- ORDER BY tma.priority DESC, tma.is_preferred DESC;

-- Example 2: Select model based on routing rules
-- SELECT target_model_id
-- FROM model_routing_rules
-- WHERE tenant_id = ?
-- AND is_active = TRUE
-- AND conditions @> '{"feature": "chat", "max_tokens": {"$lt": 1000}}'::jsonb
-- ORDER BY priority DESC
-- LIMIT 1;

-- Example 3: Get model usage statistics
-- SELECT 
--     m.display_name,
--     COUNT(*) as request_count,
--     SUM(mul.input_tokens) as total_input_tokens,
--     SUM(mul.output_tokens) as total_output_tokens,
--     SUM(mul.total_cost) as total_cost,
--     AVG(mul.response_time_ms) as avg_response_time,
--     SUM(CASE WHEN mul.status = 'success' THEN 1 ELSE 0 END)::DECIMAL / COUNT(*) * 100 as success_rate
-- FROM model_usage_logs mul
-- JOIN ai_models m ON mul.model_id = m.id
-- WHERE mul.tenant_id = ?
-- AND mul.created_at >= NOW() - INTERVAL '30 days'
-- GROUP BY m.id, m.display_name
-- ORDER BY request_count DESC;

-- Example 4: Get conversation history
-- SELECT 
--     mc.*,
--     m.display_name as model_name,
--     COUNT(mm.id) as message_count
-- FROM model_conversations mc
-- JOIN ai_models m ON mc.model_id = m.id
-- LEFT JOIN model_messages mm ON mc.id = mm.conversation_id
-- WHERE mc.tenant_id = ? AND mc.user_id = ?
-- AND mc.status = 'active'
-- GROUP BY mc.id, m.display_name
-- ORDER BY mc.updated_at DESC;

-- ============================================
-- 15. BEST PRACTICES
-- ============================================

-- 1. API KEY ENCRYPTION
--    - Always encrypt API keys before storing in provider_api_credentials
--    - Use strong encryption (AES-256)
--    - Store encryption keys separately (environment variables or key management service)
--    - Never log or expose API keys

-- 2. MODEL SELECTION
--    - Use routing rules for automatic model selection
--    - Consider cost, performance, and availability
--    - Implement fallback mechanisms
--    - Monitor model performance metrics

-- 3. TOKEN TRACKING
--    - Always track input and output tokens separately
--    - Update token_usage_logs for billing
--    - Update model_usage_logs for analytics
--    - Link both logs for complete tracking

-- 4. COST MANAGEMENT
--    - Monitor costs per model and tenant
--    - Set up alerts for high usage
--    - Use cost-efficient models when possible
--    - Track cost trends over time

-- 5. PERFORMANCE MONITORING
--    - Track response times
--    - Monitor success/error rates
--    - Record quality scores (if available)
--    - Use metrics to optimize model selection

-- 6. RATE LIMITING
--    - Enforce rate limits at credential level
--    - Enforce rate limits at tenant level
--    - Implement queue system for high load
--    - Handle rate limit errors gracefully

-- 7. ERROR HANDLING
--    - Log all errors with context
--    - Implement retry logic with exponential backoff
--    - Use fallback models when primary fails
--    - Notify administrators of critical errors

-- 8. CONVERSATION MANAGEMENT
--    - Limit conversation length to prevent token overflow
--    - Archive old conversations
--    - Implement conversation search
--    - Support conversation export


