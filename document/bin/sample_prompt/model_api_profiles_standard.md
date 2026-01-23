## model_api_profiles 표준안 (최소 스펙 v1)

이 문서는 `ai-agent-service`의 `chatRun` 파이프라인이 **DB만으로**(하드코딩 최소화) 다양한 Provider/모달리티(chat/image/audio/…)를 실행할 수 있도록 하는 `model_api_profiles.transport` / `model_api_profiles.response_mapping`의 **최소 JSON 스키마(표준안)**입니다.

### 핵심 목표
- **Provider별/모달리티별 엔드포인트 차이**를 코드가 아니라 DB로 관리
- `provider_api_credentials`(API Key/endpoint_url)과 결합해 **실제 호출을 런타임에서 구성**
- 응답을 “UI 표준 포맷(block-json)”으로 매핑해 프론트는 일관되게 렌더

---

## 1) 모델 API 프로필 선택 규칙(v1)
`chatRun`은 다음 우선순위로 1개의 프로필을 선택합니다.
- **(1) tenant_id + provider_id + purpose + model_id(정확히 일치) + is_active=true**
- **(2) tenant_id + provider_id + purpose + model_id IS NULL + is_active=true**
- 여러 개면 `updated_at DESC` 우선

purpose 권장 값:
- `chat`, `image`, `audio`, `music`, `video`, `multimodal`, `embedding`, `code`

> 참고: `model_type=text`는 purpose를 `chat`으로 매핑하는 것을 권장합니다.

---

## 2) transport (HTTP JSON 호출) — 최소 스펙

### transport.kind
- `"http_json"` (v1에서 필수/유일)

### transport 필드
```json
{
  "kind": "http_json",
  "method": "POST",
  "path": "/v1/chat/completions",
  "base_url": "",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{apiKey}}"
  },
  "query": {},
  "body": {},
  "timeout_ms": 60000,
  "retry": { "max": 0, "backoff_ms": 0 }
}
```

### transport.base_url (선택)
- 기본은 `provider_api_credentials.endpoint_url` → `ai_providers.api_base_url`를 사용합니다.
- 특정 provider(예: Vertex)처럼 base URL이 동적으로 필요한 경우, 프로필에서 `base_url`을 지정할 수 있습니다.
- `base_url`도 변수 치환을 지원합니다. (예: `https://{{config_location}}-aiplatform.googleapis.com`)

### 변수 치환(문자열 only)
`transport.headers/query/path/body` 내부 문자열에서 아래 변수를 `{{var}}`로 사용할 수 있습니다.

- `{{apiKey}}`: `provider_api_credentials.api_key_encrypted` 복호화 값
- `{{model}}`: `ai_models.model_id` (API model id)
- `{{userPrompt}}`: 사용자 입력
- `{{input}}`: 런타임이 구성한 "컨텍스트 + 사용자 요청" 통합 입력 문자열(권장)
- `{{language}}`: 최종 언어(우선순위 규칙 적용 후)
- `{{maxTokens}}`: 서버 안전 조정 후 토큰 상한
- `{{shortHistory}}`: 최근 대화 텍스트 컨텍스트
- `{{longSummary}}`: 대화 요약 컨텍스트
- `{{params_<key>}}`: 요청 options에서 가져온 값(primitive만). 예: options `{ "n": 2 }` → `{{params_n}}`

> v1 확장: JSON body 값이 문자열로 `"{{params_x}}"` 처럼 **placeholder만 단독**으로 들어가면,
> 런타임이 `true/false/number`를 자동으로 타입 변환해 넣습니다. (Gemini의 temperature/top_p/maxOutputTokens 등에 필요)

> v1에서는 “문자열 치환만” 지원합니다. 숫자/boolean 등은 템플릿에 값 자체로 넣는 방식을 권장합니다.

---

## 3) response_mapping — 최소 스펙

### response_mapping.result_type
- `"text"`: 텍스트 결과
- `"image_urls"`: 이미지 URL 배열
- `"audio_data_url"`: data URL 오디오(예: `data:audio/mpeg;base64,...`)
- `"raw_json"`: 디버그 용도(문자열로 반환)

### response_mapping.extract
```json
{
  "result_type": "text",
  "mode": "json",
  "content_type": "",
  "extract": {
    "text_path": "choices[0].message.content",
    "urls_path": "data[].url",
    "data_url_path": "audio.data_url",
    "base64_path": "predictions[0].audioContent",
    "mime_path": "predictions[0].mimeType"
  }
}
```

### response_mapping.mode (v1에서 지원)
- `"json"` (기본): JSON 응답을 파싱한 뒤 extract path로 값 추출
- `"binary"`: 응답 바디를 binary로 읽고, `content_type`(또는 HTTP Content-Type)으로 data_url 생성
- `"json_base64"`: JSON에서 `extract.base64_path`와 `extract.mime_path`를 읽어 data_url 생성

`content_type`는 `"binary"` 모드에서 mime 지정 용도입니다. (없으면 HTTP Content-Type 사용)

### path 문법(v1)
- 점(`.`)으로 내려가기: `a.b.c`
- 배열 인덱스: `items[0].url`
- 1단계 배열 projection: `data[].url` → `data` 배열의 각 원소에서 `url`을 추출해 배열로 반환

---

## 4) workflow — async_job (video 등)
비동기 job 기반 provider를 위해, v1 엔진은 아래 형태를 지원합니다.

```json
{
  "type": "async_job",
  "job_id_path": "id",
  "steps": [
    {
      "name": "poll",
      "method": "GET",
      "path": "/videos/{{job_id}}",
      "interval_ms": 2000,
      "max_attempts": 60,
      "status_path": "status",
      "terminal_states": ["completed", "failed", "canceled"]
    },
    {
      "name": "download",
      "method": "GET",
      "path": "/videos/{{job_id}}/content",
      "mode": "binary",
      "content_type": "video/mp4"
    }
  ]
}
```

주의:
- poll/download는 **같은 transport base/headers 체계**를 사용합니다. (path만 바뀜)
- download를 `"mode":"json"`으로 두고, `url_path`로 url을 추출하는 방식도 가능합니다.

---

## 5) 서버 표준 응답(block-json)
`result_type`이 `image_urls` / `audio_data_url` 인 경우, 서버는 UI 일관성을 위해 내부적으로 아래 block-json을 만들어 `output_text`로 반환합니다.

- `image_urls`: `blocks`에 `![image](url)` markdown을 포함
- `audio_data_url`: `blocks`에 “오디오 생성 완료” 안내를 포함하고, 실제 `data_url`은 메시지 content JSON에 저장

---

## 6) 예시 프로필

### (A) OpenAI Chat (Responses/Completions 계열)
```json
{
  "transport": {
    "kind": "http_json",
    "method": "POST",
    "path": "/chat/completions",
    "headers": { "Content-Type": "application/json", "Authorization": "Bearer {{apiKey}}" },
    "body": {
      "model": "{{model}}",
      "messages": [{ "role": "user", "content": "{{userPrompt}}" }],
      "max_completion_tokens": "{{maxTokens}}"
    },
    "timeout_ms": 60000
  },
  "response_mapping": {
    "result_type": "text",
    "extract": { "text_path": "choices[0].message.content" }
  }
}
```

### (B) OpenAI Images
```json
{
  "transport": {
    "kind": "http_json",
    "method": "POST",
    "path": "/images/generations",
    "headers": { "Content-Type": "application/json", "Authorization": "Bearer {{apiKey}}" },
    "body": { "model": "{{model}}", "prompt": "{{userPrompt}}", "n": 1, "size": "1024x1024" }
  },
  "response_mapping": {
    "result_type": "image_urls",
    "extract": { "urls_path": "data[].url" }
  }
}
```

---

## 7) 마이그레이션 설계(안전 적용)
1) `model_api_profiles` 테이블을 추가하고, 런타임은 **프로필이 없으면 기존 코드 경로로 fallback**  
2) OpenAI/Anthropic/Google부터 프로필을 하나씩 등록해가며 검증  
3) 충분히 안정화되면, provider-family 하드코딩 분기를 단계적으로 축소


