BEGIN;

-- Drop old table (empty, safe to drop)
DROP TABLE IF EXISTS model_usage_logs CASCADE;

-- Recreate llm_usage_logs (replace if exists)
DROP TABLE IF EXISTS llm_usage_logs CASCADE;

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

-- Provider request id는 provider마다 범위가 다를 수 있어 (provider_id, request_id) index만 둡니다.
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

COMMIT;

