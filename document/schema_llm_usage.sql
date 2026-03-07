-- ============================================
-- LLM Usage Logs & Modality Usage
-- PostgreSQL Database Schema
-- ============================================
--
-- 중요 안내사항:
-- 1. 이 스키마를 적용하기 전에 schema.sql, schema_tokens.sql이 먼저 실행되어야 합니다.
-- 2. 공통 로그는 llm_usage_logs에 저장하고, 모달리티별 정밀 과금 단위는 llm_*_usages에 저장합니다.
-- 3. llm_usage_logs는 리스트 화면에 바로 표시할 수 있도록 요약 토큰/비용 컬럼을 유지합니다.
--
-- ============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. LLM USAGE LOGS (LLM 사용 로그 + 요약 토큰/비용)
-- ============================================

CREATE TABLE llm_usage_logs (
    -- 🔐 기본 키 / 멀티테넌트
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(255), -- 선택: 재시도/중복요청 방지 및 합치기용 (tenant 단위 unique 권장)

    -- 🤖 모델 / Provider
    provider_id UUID NOT NULL REFERENCES ai_providers(id) ON DELETE RESTRICT,
    model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL, -- 내부 모델 참조(선택)
    credential_id UUID REFERENCES provider_api_credentials(id) ON DELETE SET NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    requested_model VARCHAR(255) NOT NULL, -- 최초 요청 모델
    resolved_model VARCHAR(255) NOT NULL, -- 실제 사용된 모델 (fallback 반영)
    modality VARCHAR(20) NOT NULL CHECK (modality IN ('text', 'image_read', 'image_create', 'audio', 'video', 'music')),
    region VARCHAR(64), -- 선택: ap-northeast-2 등 (멀티리전/프록시 사용 시 추천)

    -- 기능/요청 분류 (리스트 화면용)
    feature_name VARCHAR(100) NOT NULL DEFAULT 'unknown',

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
    request_id VARCHAR(255), -- provider request id or internal request id
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
    response_time_ms INTEGER, -- 기존 로그 호환(리스트용)

    -- 📊 상태
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'partial', 'failed', 'failure', 'error', 'timeout', 'rate_limited')),
    http_status INTEGER, -- provider 응답 코드 (선택)
    error_code VARCHAR(100),
    error_message TEXT, -- 짧게(요약) 권장
    error_retryable BOOLEAN,

    -- 📊 요약 토큰/비용 (리스트 화면용)
    input_tokens INTEGER NOT NULL DEFAULT 0,
    cached_input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    input_cost DECIMAL(10, 6) DEFAULT 0,
    cached_input_cost DECIMAL(10, 6) DEFAULT 0,
    output_cost DECIMAL(10, 6) DEFAULT 0,
    total_cost DECIMAL(10, 6) DEFAULT 0,
    -- 보조 비용 (토큰 외 모달리티별, total_cost = 토큰비용 + 합계)
    web_search_cost DECIMAL(10, 6) DEFAULT 0,
    image_cost DECIMAL(10, 6) DEFAULT 0,
    video_cost DECIMAL(10, 6) DEFAULT 0,
    audio_cost DECIMAL(10, 6) DEFAULT 0,
    music_cost DECIMAL(10, 6) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',

    -- 요청/응답 세부
    request_data JSONB,
    response_data JSONB,
    model_parameters JSONB,

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

-- request_id는 테넌트 단위 유니크 권장
CREATE UNIQUE INDEX idx_llm_usage_logs_tenant_request_id
  ON llm_usage_logs(tenant_id, request_id);

-- Provider request id는 provider마다 범위가 다를 수 있어 (provider, request_id) index만 둡니다.
CREATE INDEX idx_llm_usage_logs_provider_request_id
  ON llm_usage_logs(provider_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX idx_llm_usage_logs_tenant_id ON llm_usage_logs(tenant_id);
CREATE INDEX idx_llm_usage_logs_user_id ON llm_usage_logs(user_id);
CREATE INDEX idx_llm_usage_logs_provider_id ON llm_usage_logs(provider_id);
CREATE INDEX idx_llm_usage_logs_model_id ON llm_usage_logs(model_id);
CREATE INDEX idx_llm_usage_logs_feature_name ON llm_usage_logs(feature_name);
CREATE INDEX idx_llm_usage_logs_modality ON llm_usage_logs(modality);
CREATE INDEX idx_llm_usage_logs_resolved_model ON llm_usage_logs(resolved_model);
CREATE INDEX idx_llm_usage_logs_conversation_id ON llm_usage_logs(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_llm_usage_logs_model_message_id ON llm_usage_logs(model_message_id) WHERE model_message_id IS NOT NULL;
CREATE INDEX idx_llm_usage_logs_routing_rule_id ON llm_usage_logs(routing_rule_id) WHERE routing_rule_id IS NOT NULL;
CREATE INDEX idx_llm_usage_logs_parent_usage_log_id ON llm_usage_logs(parent_usage_log_id) WHERE parent_usage_log_id IS NOT NULL;
CREATE INDEX idx_llm_usage_logs_status ON llm_usage_logs(status);
CREATE INDEX idx_llm_usage_logs_created_at ON llm_usage_logs(created_at);
CREATE INDEX idx_llm_usage_logs_tenant_date ON llm_usage_logs(tenant_id, created_at DESC);

COMMENT ON TABLE llm_usage_logs IS 'LLM 사용 로그 테이블. 공통 헤더 + 요약 토큰/비용을 저장합니다.';
COMMENT ON COLUMN llm_usage_logs.id IS '사용 로그 고유 식별자 (UUID)';
COMMENT ON COLUMN llm_usage_logs.tenant_id IS '테넌트 ID (tenants.id)';
COMMENT ON COLUMN llm_usage_logs.user_id IS '사용자 ID (users.id), NULL이면 테넌트 레벨 사용';
COMMENT ON COLUMN llm_usage_logs.idempotency_key IS '중복/재시도 요청 합치기용 키 (tenant 단위 unique 권장)';

COMMENT ON COLUMN llm_usage_logs.provider_id IS 'Provider ID (ai_providers.id)';
COMMENT ON COLUMN llm_usage_logs.model_id IS 'AI 모델 ID (ai_models.id)';
COMMENT ON COLUMN llm_usage_logs.credential_id IS 'Provider API 인증 정보 ID';
COMMENT ON COLUMN llm_usage_logs.service_id IS '서비스 ID (services.id)';
COMMENT ON COLUMN llm_usage_logs.requested_model IS '최초 요청 모델';
COMMENT ON COLUMN llm_usage_logs.resolved_model IS '실제 사용 모델(폴백 반영)';
COMMENT ON COLUMN llm_usage_logs.modality IS '모달리티(text/image_read/image_create/audio/video/music)';
COMMENT ON COLUMN llm_usage_logs.region IS '리전(ap-northeast-2 등), 멀티리전/프록시 사용 시 추천';
COMMENT ON COLUMN llm_usage_logs.feature_name IS '요청 기능 이름(예: chat, completion 등)';

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

COMMENT ON COLUMN llm_usage_logs.request_id IS 'Provider request id 또는 내부 요청 ID';
COMMENT ON COLUMN llm_usage_logs.conversation_id IS '대화 ID (model_conversations.id)';
COMMENT ON COLUMN llm_usage_logs.model_message_id IS '연결된 메시지 ID (model_messages.id)';
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
COMMENT ON COLUMN llm_usage_logs.response_time_ms IS '기존 모델 사용 로그의 응답 시간(ms)';

COMMENT ON COLUMN llm_usage_logs.status IS '상태(success/partial/failed/error/timeout/rate_limited)';
COMMENT ON COLUMN llm_usage_logs.http_status IS 'Provider HTTP status';
COMMENT ON COLUMN llm_usage_logs.error_code IS '에러 코드';
COMMENT ON COLUMN llm_usage_logs.error_message IS '에러 메시지(요약 권장)';
COMMENT ON COLUMN llm_usage_logs.error_retryable IS '재시도 가능 여부';

COMMENT ON COLUMN llm_usage_logs.input_tokens IS '입력 토큰 수(요약)';
COMMENT ON COLUMN llm_usage_logs.cached_input_tokens IS '캐시된 입력 토큰 수(요약)';
COMMENT ON COLUMN llm_usage_logs.output_tokens IS '출력 토큰 수(요약)';
COMMENT ON COLUMN llm_usage_logs.total_tokens IS '총 토큰 수(요약)';
COMMENT ON COLUMN llm_usage_logs.input_cost IS '입력 토큰 비용(요약)';
COMMENT ON COLUMN llm_usage_logs.cached_input_cost IS '캐시 입력 토큰 비용(요약)';
COMMENT ON COLUMN llm_usage_logs.output_cost IS '출력 토큰 비용(요약)';
COMMENT ON COLUMN llm_usage_logs.total_cost IS '총 비용(요약) = 토큰비용 + web_search_cost + image_cost + video_cost + audio_cost + music_cost';
COMMENT ON COLUMN llm_usage_logs.web_search_cost IS '웹검색 비용(USD)';
COMMENT ON COLUMN llm_usage_logs.image_cost IS '이미지 생성 비용(USD)';
COMMENT ON COLUMN llm_usage_logs.video_cost IS '영상 생성 비용(USD)';
COMMENT ON COLUMN llm_usage_logs.audio_cost IS '오디오(STT/TTS) 비용(USD)';
COMMENT ON COLUMN llm_usage_logs.music_cost IS '음악 생성 비용(USD)';
COMMENT ON COLUMN llm_usage_logs.currency IS '통화 코드';

COMMENT ON COLUMN llm_usage_logs.request_data IS '요청 데이터(요약/프리뷰 포함)';
COMMENT ON COLUMN llm_usage_logs.response_data IS '응답 데이터(요약/프리뷰 포함)';
COMMENT ON COLUMN llm_usage_logs.model_parameters IS '모델 파라미터(JSON)';

COMMENT ON COLUMN llm_usage_logs.ip_address IS '요청 IP';
COMMENT ON COLUMN llm_usage_logs.user_agent IS '요청 User-Agent';
COMMENT ON COLUMN llm_usage_logs.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN llm_usage_logs.created_at IS '로그 생성 시각';

-- ============================================
-- 2. LLM TOKEN USAGES (토큰 기반 사용량)
-- ============================================

CREATE TABLE llm_token_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usage_log_id UUID NOT NULL REFERENCES llm_usage_logs(id) ON DELETE CASCADE,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    cached_input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    unit VARCHAR(20) NOT NULL DEFAULT 'tokens' CHECK (unit IN ('tokens')),
    token_category VARCHAR(20) CHECK (token_category IN ('text', 'image')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_llm_token_usages_usage_log_id ON llm_token_usages(usage_log_id);

COMMENT ON TABLE llm_token_usages IS '토큰 기반 사용량(정밀 과금 단위).';
COMMENT ON COLUMN llm_token_usages.usage_log_id IS 'llm_usage_logs.id 참조';
COMMENT ON COLUMN llm_token_usages.input_tokens IS '입력 토큰 수';
COMMENT ON COLUMN llm_token_usages.cached_input_tokens IS '캐시된 입력 토큰 수';
COMMENT ON COLUMN llm_token_usages.output_tokens IS '출력 토큰 수';
COMMENT ON COLUMN llm_token_usages.unit IS '과금 단위(tokens)';
COMMENT ON COLUMN llm_token_usages.token_category IS '토큰 카테고리(text/image). GPT Image 1.5, Gemini 3.1 Flash Image 등에서 text/image 분리 저장';

-- ============================================
-- 3. LLM AUDIO USAGES (STT/TTS 사용량)
-- ============================================

CREATE TABLE llm_audio_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usage_log_id UUID NOT NULL REFERENCES llm_usage_logs(id) ON DELETE CASCADE,
    task VARCHAR(20) CHECK (task IN ('stt', 'tts')),
    seconds DECIMAL(10, 3) NOT NULL DEFAULT 0,
    audio_bytes BIGINT, -- 오디오 바이트(입력 또는 출력)
    sample_rate INTEGER, -- 16000 / 44100 / 48000
    channels VARCHAR(20), -- mono / stereo
    bit_depth INTEGER, -- 16 / 24
    format VARCHAR(20), -- wav / mp3 / ogg / pcm 등
    unit VARCHAR(20) NOT NULL DEFAULT 'second' CHECK (unit IN ('second')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_llm_audio_usages_usage_log_id ON llm_audio_usages(usage_log_id);

COMMENT ON TABLE llm_audio_usages IS 'STT/TTS 오디오 사용량(정밀 과금 단위).';
COMMENT ON COLUMN llm_audio_usages.usage_log_id IS 'llm_usage_logs.id 참조';
COMMENT ON COLUMN llm_audio_usages.task IS '작업 종류(stt/tts)';
COMMENT ON COLUMN llm_audio_usages.seconds IS '오디오 길이(초)';
COMMENT ON COLUMN llm_audio_usages.audio_bytes IS '오디오 바이트 크기';
COMMENT ON COLUMN llm_audio_usages.sample_rate IS '샘플 레이트';
COMMENT ON COLUMN llm_audio_usages.channels IS '채널 수(mono/stereo)';
COMMENT ON COLUMN llm_audio_usages.bit_depth IS '비트 깊이';
COMMENT ON COLUMN llm_audio_usages.format IS '오디오 포맷';
COMMENT ON COLUMN llm_audio_usages.unit IS '과금 단위(second)';

-- ============================================
-- 4. LLM IMAGE USAGES (이미지 생성 사용량)
-- ============================================

CREATE TABLE llm_image_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usage_log_id UUID NOT NULL REFERENCES llm_usage_logs(id) ON DELETE CASCADE,
    image_count INTEGER NOT NULL DEFAULT 0,
    size VARCHAR(20), -- 1024x1024 / 1536x1024 등
    quality VARCHAR(20), -- low / medium / high
    unit VARCHAR(20) NOT NULL DEFAULT 'image' CHECK (unit IN ('image')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_llm_image_usages_usage_log_id ON llm_image_usages(usage_log_id);

COMMENT ON TABLE llm_image_usages IS '이미지 생성 사용량(정밀 과금 단위).';
COMMENT ON COLUMN llm_image_usages.usage_log_id IS 'llm_usage_logs.id 참조';
COMMENT ON COLUMN llm_image_usages.image_count IS '생성된 이미지 수';
COMMENT ON COLUMN llm_image_usages.size IS '이미지 크기';
COMMENT ON COLUMN llm_image_usages.quality IS '이미지 품질';
COMMENT ON COLUMN llm_image_usages.unit IS '과금 단위(image)';

-- ============================================
-- 5. LLM VIDEO USAGES (비디오 생성 사용량)
-- ============================================

CREATE TABLE llm_video_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usage_log_id UUID NOT NULL REFERENCES llm_usage_logs(id) ON DELETE CASCADE,
    seconds DECIMAL(10, 3) NOT NULL DEFAULT 0,
    size VARCHAR(20), -- 720p / 1080p / 4k
    unit VARCHAR(20) NOT NULL DEFAULT 'second' CHECK (unit IN ('second')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_llm_video_usages_usage_log_id ON llm_video_usages(usage_log_id);

COMMENT ON TABLE llm_video_usages IS '비디오 생성 사용량(정밀 과금 단위).';
COMMENT ON COLUMN llm_video_usages.usage_log_id IS 'llm_usage_logs.id 참조';
COMMENT ON COLUMN llm_video_usages.seconds IS '실제 생성된 길이(초)';
COMMENT ON COLUMN llm_video_usages.size IS '해상도(예: 720p/1080p/4k)';
COMMENT ON COLUMN llm_video_usages.unit IS '과금 단위(second)';

-- ============================================
-- 6. LLM MUSIC USAGES (음악 생성 사용량)
-- ============================================

CREATE TABLE llm_music_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usage_log_id UUID NOT NULL REFERENCES llm_usage_logs(id) ON DELETE CASCADE,
    seconds DECIMAL(10, 3) NOT NULL DEFAULT 0,
    sample_rate INTEGER, -- 44100 / 48000
    channels VARCHAR(20), -- mono / stereo
    bit_depth INTEGER, -- 16 / 24
    unit VARCHAR(20) NOT NULL DEFAULT 'second' CHECK (unit IN ('second')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_llm_music_usages_usage_log_id ON llm_music_usages(usage_log_id);

COMMENT ON TABLE llm_music_usages IS '음악 생성 사용량(정밀 과금 단위).';
COMMENT ON COLUMN llm_music_usages.usage_log_id IS 'llm_usage_logs.id 참조';
COMMENT ON COLUMN llm_music_usages.seconds IS '실제 생성된 길이(초)';
COMMENT ON COLUMN llm_music_usages.sample_rate IS '샘플 레이트';
COMMENT ON COLUMN llm_music_usages.channels IS '채널 수(mono/stereo)';
COMMENT ON COLUMN llm_music_usages.bit_depth IS '비트 깊이';
COMMENT ON COLUMN llm_music_usages.unit IS '과금 단위(second)';

-- ============================================
-- 7. LLM WEB SEARCH USAGES (웹검색 사용량)
-- ============================================

CREATE TABLE llm_web_search_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usage_log_id UUID NOT NULL REFERENCES llm_usage_logs(id) ON DELETE CASCADE,
    provider VARCHAR(50),
    count INTEGER NOT NULL DEFAULT 0,
    query_chars_total INTEGER DEFAULT 0,
    response_bytes_total BIGINT DEFAULT 0,
    status VARCHAR(20) CHECK (status IN ('success', 'failed')),
    error_code VARCHAR(100),
    unit VARCHAR(20) NOT NULL DEFAULT 'request' CHECK (unit IN ('request')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_llm_web_search_usages_usage_log_id ON llm_web_search_usages(usage_log_id);

COMMENT ON TABLE llm_web_search_usages IS '웹검색 사용량(정밀 과금 단위).';
COMMENT ON COLUMN llm_web_search_usages.usage_log_id IS 'llm_usage_logs.id 참조';
COMMENT ON COLUMN llm_web_search_usages.provider IS '웹검색 제공자(serper/bing/google 등)';
COMMENT ON COLUMN llm_web_search_usages.count IS '실제 호출 횟수';
COMMENT ON COLUMN llm_web_search_usages.query_chars_total IS '검색어 총 길이(남용 탐지)';
COMMENT ON COLUMN llm_web_search_usages.response_bytes_total IS '응답 크기(비용/성능 분석)';
COMMENT ON COLUMN llm_web_search_usages.status IS '상태(success/failed)';
COMMENT ON COLUMN llm_web_search_usages.error_code IS '에러 코드';
COMMENT ON COLUMN llm_web_search_usages.unit IS '과금 단위(request)';
