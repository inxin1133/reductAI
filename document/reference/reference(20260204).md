### 공통 로그 구조 (모든 요청에 반드시 있어야 함)

```sql
llm_usage_logs

-- 🔐 기본 키 / 멀티테넌트
id UUID PK
tenant_id
user_id
idempotency_key (선택: 재시도/중복요청 방지 및 합치기용)

-- 🤖 모델 / Provider
provider -- openai / anthropic / google / xai)
requested_model -- 최초 요청 모델
resolved_model -- 실제 사용된 모델 (fallback 반영)
modality -- text | image_read | image_create | audio | video | music 
region -- ap-northeast-2 등 (선택: 멀티리전/프록시 쓰면 강추)

-- 웹검색 사용
web_enabled -- “웹 허용” 켰는지
web_provider -- serper / bing / google 등
web_search_mode -- auto / forced / off
web_budget_count  -- (int) ← 최대 몇 번까지 허용했는지(가드레일)
web_search_count -- (int) 실제 수행 횟수(집계용 캐시)

-- 🔁 라우팅 / 재시도 체인
routing_rule_id -- 적용된 라우팅 규칙
is_fallback -- true / false
fallback_reason -- rate_limit | cost_limit | timeout | error | policy
attempt_index -- 1,2,3… (선택: 재시도/체인 분석용)
parent_usage_log_id -- fallback 체인의 부모 id (선택: 체인 재구성용)

-- 🧾 요청 식별
request_id -- provider request id
conversation_id
prompt_hash -- SHA-256
prompt_length_chars
prompt_tokens_estimated -- 사전 예측용

-- 📤 응답 메타
response_length_chars
response_bytes -- 스트리밍 수신 총 바이트 (선택: 스트리밍/네트워크 분석에 유용)
finish_reason -- stop | length | content_filter | error
content_filtered -- true/false (선택: 정책/필터 분석용)
tool_call_count -- (선택: tool 호출이 있으면)
web_search_count -- (선택: search count를 헤더에 캐시하고 싶을 때; 원장은 search_usage에)

-- ⏱️ 시간
provider_created_at -- provider 기준 응답 생성 시각
started_at -- 우리 서버 요청 시작
headers_received_at -- 응답 헤더 수신 시각 (선택: 비스트리밍이면 TTFB 추정에 중요)
first_token_at -- 스트리밍 첫 토큰/첫 chunk 수신 시각 (선택: 스트리밍이면 강추)
finished_at -- 우리 서버 수신 완료
latency_ms -- finished_at - started_at ✅ (유지)
ttfb_ms -- headers_received_at - started_at (선택: 저장하면 대시보드가 쉬움)
ttft_ms -- first_token_at - started_at (선택: 저장하면 대시보드가 쉬움)
queue_wait_ms -- 내부 큐 대기 (선택: 병목 분리용, 강추)
network_ms -- connect/tls 포함 네트워크 추정 (선택: 있으면 좋음)
server_processing_ms -- 우리 앱 후처리(파싱/저장/필터) 시간 (선택)

-- 📊 상태
status -- success | partial | failed
http_status -- provider 응답 코드 (선택: 에러 분석에 유용)
error_code
error_message -- 짧게(요약)
error_retryable -- true/false (선택: 재시도 전략 자동화에 유용)
```

👉 이 테이블은 **“영수증 헤더”** 역할

# 토큰

### Text / Read Image / Audio (토큰 기반)

```sql
llm_token_usages

usage_log_id (FK)
input_tokens
cached_input_tokens
output_tokens
unit        -- tokens
```

### Create Image (서빙 단가 기반)

```sql
llm_image_usages

usage_log_id (FK)
image_count
size                -- 1024x1024 / 1536x1024
quality             -- low / medium / high
unit        -- image
```

- **size + quality 조합이 곧 SKU**
- 단가 테이블에서 조합으로 매칭

### Video (초 단위)

```sql
llm_video_usages

usage_log_id (FK)
seconds
size                -- 720p / 1080p / 4k
unit        -- second

```

- “요청한 길이” ❌
- **“실제 생성된 길이”** ⭕

### Music

```sql
llm_music_usages

usage_log_id (FK)
seconds
sample_rate         -- 44100 / 48000
channels            -- mono / stereo
bit_depth           -- 16 / 24
unit        -- second

```

### Web Search (횟수 과금)

```sql
llm_web_search_usages

id UUID 
usage_log_id (FK) -- (llm_usage_logs.id)
provider 
count  --(int) 실제 호출 횟수
query_chars_total -- 검색어 총 길이(남용 탐지)
response_bytes_total -- 응답 크기(비용/성능 분석)
status -- success/failed
error_code 
unit        -- request

```