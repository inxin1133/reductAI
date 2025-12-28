CREATE TABLE ai_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE, -- 예: 'openai', 'anthropic', 'google', 'cohere'
    product_name VARCHAR(255) NOT NULL, -- 예: 'Chat GPT', 'Claude', 'Gemini'
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
    prompt_template_id UUID REFERENCES prompt_templates(id) ON DELETE SET NULL, -- 모델 기본 프롬프트 템플릿(선택)
    response_schema_id UUID REFERENCES response_schemas(id) ON DELETE SET NULL, -- 모델 출력 계약(JSON schema)(선택)
    metadata JSONB DEFAULT '{}', -- 추가 정보 (예: 파라미터 범위, 제한사항)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_id, model_id)
);

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