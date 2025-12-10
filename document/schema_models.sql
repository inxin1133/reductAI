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
    name VARCHAR(100) NOT NULL UNIQUE, -- 예: 'openai', 'anthropic', 'google', 'cohere'
    display_name VARCHAR(255) NOT NULL, -- 예: 'OpenAI', 'Anthropic', 'Google AI'
    slug VARCHAR(100) NOT NULL UNIQUE,
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

CREATE INDEX idx_ai_providers_slug ON ai_providers(slug);
CREATE INDEX idx_ai_providers_status ON ai_providers(status);

COMMENT ON TABLE ai_providers IS 'AI 제공업체 정보를 관리하는 테이블';
COMMENT ON COLUMN ai_providers.id IS '제공업체의 고유 식별자 (UUID)';
COMMENT ON COLUMN ai_providers.name IS '제공업체 이름 (내부 식별용, 예: openai, anthropic)';
COMMENT ON COLUMN ai_providers.display_name IS '제공업체 표시 이름 (예: OpenAI, Anthropic)';
COMMENT ON COLUMN ai_providers.slug IS '제공업체의 고유 식별 문자열';
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
    model_type VARCHAR(50) NOT NULL CHECK (model_type IN ('text', 'image', 'audio', 'video', 'multimodal', 'embedding', 'code')),
    capabilities JSONB DEFAULT '[]', -- 지원 기능 목록 (예: ['chat', 'completion', 'function_calling'])
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

COMMENT ON TABLE ai_models IS 'AI 모델 정보를 관리하는 테이블';
COMMENT ON COLUMN ai_models.id IS '모델의 고유 식별자 (UUID)';
COMMENT ON COLUMN ai_models.provider_id IS '제공업체 ID (ai_providers 테이블 참조)';
COMMENT ON COLUMN ai_models.name IS '모델 이름 (예: gpt-4, claude-3-opus)';
COMMENT ON COLUMN ai_models.model_id IS 'API에서 사용하는 모델 ID (예: gpt-4-turbo-preview, claude-3-opus-20240229)';
COMMENT ON COLUMN ai_models.display_name IS '모델 표시 이름 (예: GPT-4 Turbo, Claude 3 Opus)';
COMMENT ON COLUMN ai_models.description IS '모델 설명';
COMMENT ON COLUMN ai_models.model_type IS '모델 타입: text(텍스트), image(이미지), audio(오디오), video(비디오), multimodal(멀티모달), embedding(임베딩), code(코드)';
COMMENT ON COLUMN ai_models.capabilities IS '지원 기능 목록 (JSON 배열, 예: ["chat", "completion", "function_calling", "vision"])';
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
-- 5. MODEL USAGE LOGS (모델 사용 로그)
-- ============================================

CREATE TABLE model_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    model_id UUID NOT NULL REFERENCES ai_models(id) ON DELETE RESTRICT,
    credential_id UUID REFERENCES provider_api_credentials(id) ON DELETE SET NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL, -- 사용한 서비스
    token_usage_log_id UUID REFERENCES token_usage_logs(id) ON DELETE SET NULL, -- 토큰 사용 로그 연결
    feature_name VARCHAR(100) NOT NULL, -- 사용한 기능 (예: 'chat', 'completion', 'embedding')
    request_id VARCHAR(255) UNIQUE, -- 요청 ID (추적용)
    input_tokens INTEGER NOT NULL DEFAULT 0, -- 입력 토큰 수
    output_tokens INTEGER NOT NULL DEFAULT 0, -- 출력 토큰 수
    total_tokens INTEGER NOT NULL, -- 총 토큰 수 (input + output)
    input_cost DECIMAL(10, 6) DEFAULT 0, -- 입력 토큰 비용
    output_cost DECIMAL(10, 6) DEFAULT 0, -- 출력 토큰 비용
    total_cost DECIMAL(10, 6) DEFAULT 0, -- 총 비용
    currency VARCHAR(3) DEFAULT 'USD',
    response_time_ms INTEGER, -- 응답 시간 (밀리초)
    status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'failure', 'error', 'timeout', 'rate_limited')),
    error_code VARCHAR(100), -- 에러 코드
    error_message TEXT, -- 에러 메시지
    request_data JSONB, -- 요청 데이터
    response_data JSONB, -- 응답 데이터
    model_parameters JSONB, -- 모델 파라미터 (temperature, max_tokens 등)
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_model_usage_logs_tenant_id ON model_usage_logs(tenant_id);
CREATE INDEX idx_model_usage_logs_user_id ON model_usage_logs(user_id);
CREATE INDEX idx_model_usage_logs_model_id ON model_usage_logs(model_id);
CREATE INDEX idx_model_usage_logs_credential_id ON model_usage_logs(credential_id);
CREATE INDEX idx_model_usage_logs_service_id ON model_usage_logs(service_id);
CREATE INDEX idx_model_usage_logs_feature_name ON model_usage_logs(feature_name);
CREATE INDEX idx_model_usage_logs_status ON model_usage_logs(status);
CREATE INDEX idx_model_usage_logs_created_at ON model_usage_logs(created_at);
CREATE INDEX idx_model_usage_logs_tenant_date ON model_usage_logs(tenant_id, created_at DESC);
CREATE INDEX idx_model_usage_logs_request_id ON model_usage_logs(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX idx_model_usage_logs_token_usage_log_id ON model_usage_logs(token_usage_log_id) WHERE token_usage_log_id IS NOT NULL;

COMMENT ON TABLE model_usage_logs IS 'AI 모델 사용 로그를 관리하는 테이블. 입력/출력 토큰을 분리하여 추적합니다.';
COMMENT ON COLUMN model_usage_logs.id IS '사용 로그의 고유 식별자 (UUID)';
COMMENT ON COLUMN model_usage_logs.tenant_id IS '사용한 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN model_usage_logs.user_id IS '사용한 사용자 ID (users 테이블 참조, NULL이면 테넌트 레벨 사용)';
COMMENT ON COLUMN model_usage_logs.model_id IS '사용한 모델 ID (ai_models 테이블 참조)';
COMMENT ON COLUMN model_usage_logs.credential_id IS '사용한 API 인증 정보 ID (provider_api_credentials 테이블 참조)';
COMMENT ON COLUMN model_usage_logs.service_id IS '사용한 서비스 ID (services 테이블 참조)';
COMMENT ON COLUMN model_usage_logs.token_usage_log_id IS '토큰 사용 로그 ID (token_usage_logs 테이블 참조, 토큰 시스템과 연동)';
COMMENT ON COLUMN model_usage_logs.feature_name IS '사용한 기능 이름 (예: chat, completion, embedding, image_generation)';
COMMENT ON COLUMN model_usage_logs.request_id IS '요청 ID (요청 추적용, 고유값)';
COMMENT ON COLUMN model_usage_logs.input_tokens IS '입력 토큰 수';
COMMENT ON COLUMN model_usage_logs.output_tokens IS '출력 토큰 수';
COMMENT ON COLUMN model_usage_logs.total_tokens IS '총 토큰 수 (input_tokens + output_tokens)';
COMMENT ON COLUMN model_usage_logs.input_cost IS '입력 토큰 비용';
COMMENT ON COLUMN model_usage_logs.output_cost IS '출력 토큰 비용';
COMMENT ON COLUMN model_usage_logs.total_cost IS '총 비용 (input_cost + output_cost)';
COMMENT ON COLUMN model_usage_logs.currency IS '통화 코드';
COMMENT ON COLUMN model_usage_logs.response_time_ms IS '응답 시간 (밀리초)';
COMMENT ON COLUMN model_usage_logs.status IS '요청 상태: success(성공), failure(실패), error(오류), timeout(타임아웃), rate_limited(속도 제한)';
COMMENT ON COLUMN model_usage_logs.error_code IS '에러 코드 (예: invalid_api_key, rate_limit_exceeded)';
COMMENT ON COLUMN model_usage_logs.error_message IS '에러 메시지';
COMMENT ON COLUMN model_usage_logs.request_data IS '요청 데이터 (JSON 형식)';
COMMENT ON COLUMN model_usage_logs.response_data IS '응답 데이터 (JSON 형식)';
COMMENT ON COLUMN model_usage_logs.model_parameters IS '모델 파라미터 (JSON 형식, 예: {"temperature": 0.7, "max_tokens": 1000})';
COMMENT ON COLUMN model_usage_logs.ip_address IS '요청 IP 주소';
COMMENT ON COLUMN model_usage_logs.user_agent IS '요청 User-Agent';
COMMENT ON COLUMN model_usage_logs.metadata IS '사용 로그의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN model_usage_logs.created_at IS '사용 시각';

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
    rule_name VARCHAR(255) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0, -- 규칙 우선순위 (높을수록 우선)
    conditions JSONB NOT NULL, -- 조건 (예: {"feature": "chat", "max_tokens": 1000})
    target_model_id UUID NOT NULL REFERENCES ai_models(id) ON DELETE RESTRICT, -- 대상 모델
    fallback_model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL, -- 폴백 모델
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, rule_name)
);

CREATE INDEX idx_model_routing_rules_tenant_id ON model_routing_rules(tenant_id);
CREATE INDEX idx_model_routing_rules_target_model_id ON model_routing_rules(target_model_id);
CREATE INDEX idx_model_routing_rules_priority ON model_routing_rules(tenant_id, priority DESC) WHERE is_active = TRUE;

COMMENT ON TABLE model_routing_rules IS '모델 라우팅 규칙을 관리하는 테이블. 조건에 따라 자동으로 모델을 선택합니다.';
COMMENT ON COLUMN model_routing_rules.id IS '라우팅 규칙의 고유 식별자 (UUID)';
COMMENT ON COLUMN model_routing_rules.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
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
-- 8. MODEL CONVERSATIONS (모델 대화 세션)
-- ============================================

CREATE TABLE model_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    model_id UUID NOT NULL REFERENCES ai_models(id) ON DELETE RESTRICT,
    title VARCHAR(500), -- 대화 제목
    system_prompt TEXT, -- 시스템 프롬프트
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

COMMENT ON TABLE model_conversations IS 'AI 모델 대화 세션을 관리하는 테이블. 채팅 히스토리를 추적합니다.';
COMMENT ON COLUMN model_conversations.id IS '대화 세션의 고유 식별자 (UUID)';
COMMENT ON COLUMN model_conversations.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN model_conversations.user_id IS '사용자 ID (users 테이블 참조, NULL이면 테넌트 레벨)';
COMMENT ON COLUMN model_conversations.model_id IS '사용한 모델 ID (ai_models 테이블 참조)';
COMMENT ON COLUMN model_conversations.title IS '대화 제목';
COMMENT ON COLUMN model_conversations.system_prompt IS '시스템 프롬프트';
COMMENT ON COLUMN model_conversations.total_tokens IS '총 사용 토큰 수';
COMMENT ON COLUMN model_conversations.message_count IS '메시지 수';
COMMENT ON COLUMN model_conversations.status IS '대화 상태: active(활성), archived(보관), deleted(삭제)';
COMMENT ON COLUMN model_conversations.metadata IS '대화의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN model_conversations.created_at IS '대화 생성 시각';
COMMENT ON COLUMN model_conversations.updated_at IS '대화 최종 수정 시각';
COMMENT ON COLUMN model_conversations.archived_at IS '대화 보관 시각';

-- ============================================
-- 9. MODEL MESSAGES (모델 메시지)
-- ============================================

CREATE TABLE model_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES model_conversations(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'function', 'tool')),
    content TEXT NOT NULL, -- 메시지 내용
    function_name VARCHAR(255), -- 함수 이름 (role이 function인 경우)
    function_call_id VARCHAR(255), -- 함수 호출 ID
    input_tokens INTEGER DEFAULT 0, -- 입력 토큰 수
    output_tokens INTEGER DEFAULT 0, -- 출력 토큰 수
    message_order INTEGER NOT NULL, -- 메시지 순서
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_model_messages_conversation_id ON model_messages(conversation_id);
CREATE INDEX idx_model_messages_role ON model_messages(role);
CREATE INDEX idx_model_messages_order ON model_messages(conversation_id, message_order);

COMMENT ON TABLE model_messages IS 'AI 모델 대화 메시지를 관리하는 테이블';
COMMENT ON COLUMN model_messages.id IS '메시지의 고유 식별자 (UUID)';
COMMENT ON COLUMN model_messages.conversation_id IS '대화 세션 ID (model_conversations 테이블 참조)';
COMMENT ON COLUMN model_messages.role IS '메시지 역할: system(시스템), user(사용자), assistant(어시스턴트), function(함수), tool(도구)';
COMMENT ON COLUMN model_messages.content IS '메시지 내용';
COMMENT ON COLUMN model_messages.function_name IS '함수 이름 (role이 function인 경우)';
COMMENT ON COLUMN model_messages.function_call_id IS '함수 호출 ID (함수 호출 추적용)';
COMMENT ON COLUMN model_messages.input_tokens IS '입력 토큰 수';
COMMENT ON COLUMN model_messages.output_tokens IS '출력 토큰 수';
COMMENT ON COLUMN model_messages.message_order IS '메시지 순서 (대화 내에서의 순서)';
COMMENT ON COLUMN model_messages.metadata IS '메시지의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN model_messages.created_at IS '메시지 생성 시각';

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
INSERT INTO ai_providers (name, display_name, slug, description, api_base_url, status, is_verified) VALUES
    ('openai', 'OpenAI', 'openai', 'OpenAI provides GPT models including GPT-4, GPT-3.5, and embeddings', 'https://api.openai.com/v1', 'active', TRUE),
    ('anthropic', 'Anthropic', 'anthropic', 'Anthropic provides Claude models including Claude 3 Opus, Sonnet, and Haiku', 'https://api.anthropic.com/v1', 'active', TRUE),
    ('google', 'Google AI', 'google', 'Google provides Gemini models and PaLM', 'https://generativelanguage.googleapis.com/v1', 'active', TRUE),
    ('cohere', 'Cohere', 'cohere', 'Cohere provides language models and embeddings', 'https://api.cohere.ai/v1', 'active', TRUE),
    ('mistral', 'Mistral AI', 'mistral', 'Mistral AI provides high-performance language models', 'https://api.mistral.ai/v1', 'active', TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Default AI models (example - actual models should be added based on current availability)
-- Note: Prices are approximate and should be updated based on current pricing
INSERT INTO ai_models (provider_id, name, model_id, display_name, model_type, context_window, input_token_cost_per_1k, output_token_cost_per_1k, status, is_default) 
SELECT 
    p.id,
    'gpt-4-turbo',
    'gpt-4-turbo-preview',
    'GPT-4 Turbo',
    'text',
    128000,
    0.01,
    0.03,
    'active',
    TRUE
FROM ai_providers p WHERE p.slug = 'openai'
ON CONFLICT (provider_id, model_id) DO NOTHING;

INSERT INTO ai_models (provider_id, name, model_id, display_name, model_type, context_window, input_token_cost_per_1k, output_token_cost_per_1k, status, is_default) 
SELECT 
    p.id,
    'gpt-3.5-turbo',
    'gpt-3.5-turbo',
    'GPT-3.5 Turbo',
    'text',
    16385,
    0.0005,
    0.0015,
    'active',
    FALSE
FROM ai_providers p WHERE p.slug = 'openai'
ON CONFLICT (provider_id, model_id) DO NOTHING;

INSERT INTO ai_models (provider_id, name, model_id, display_name, model_type, context_window, input_token_cost_per_1k, output_token_cost_per_1k, status, is_default) 
SELECT 
    p.id,
    'claude-3-opus',
    'claude-3-opus-20240229',
    'Claude 3 Opus',
    'text',
    200000,
    0.015,
    0.075,
    'active',
    TRUE
FROM ai_providers p WHERE p.slug = 'anthropic'
ON CONFLICT (provider_id, model_id) DO NOTHING;

INSERT INTO ai_models (provider_id, name, model_id, display_name, model_type, context_window, input_token_cost_per_1k, output_token_cost_per_1k, status, is_default) 
SELECT 
    p.id,
    'claude-3-sonnet',
    'claude-3-sonnet-20240229',
    'Claude 3 Sonnet',
    'text',
    200000,
    0.003,
    0.015,
    'active',
    FALSE
FROM ai_providers p WHERE p.slug = 'anthropic'
ON CONFLICT (provider_id, model_id) DO NOTHING;

INSERT INTO ai_models (provider_id, name, model_id, display_name, model_type, context_window, input_token_cost_per_1k, output_token_cost_per_1k, status, is_default) 
SELECT 
    p.id,
    'gemini-pro',
    'gemini-pro',
    'Gemini Pro',
    'text',
    32768,
    0.0005,
    0.0015,
    'active',
    TRUE
FROM ai_providers p WHERE p.slug = 'google'
ON CONFLICT (provider_id, model_id) DO NOTHING;

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


