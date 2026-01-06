# model_api_profiles 샘플 (현재 v1 엔진과 “정확히 일치”)

이 문서는 **지금 코드(`services/ai-agent-service/src/controllers/chatRuntimeController.ts`의 `executeHttpJsonProfile`)로 실제 실행 가능한 형태**만 담습니다.

## v1 엔진 요약 (중요)
- **`purpose`**는 `chat/image/audio/music/video/...` 중 하나입니다.
  - `ai_models.model_type = "text"`인 경우 런타임이 **purpose를 `"chat"`로 매핑**합니다.
- Base URL은 프로필에 넣지 않습니다.
  - `provider_api_credentials.endpoint_url` → `ai_providers.api_base_url` 순으로 사용합니다.
- 템플릿 변수는 v1 엔진이 제공하는 것만 사용합니다.
  - `{{apiKey}}`, `{{model}}`, `{{userPrompt}}`, `{{input}}`, `{{maxTokens}}`, `{{language}}`, …
  - 옵션은 요청 `options`에서 `{{params_<key>}}`로 사용합니다. (primitive만)
    - 예: options `{ "n": 2, "size": "1024x1024" }` → `{{params_n}}`, `{{params_size}}`
- 응답 추출 문법은 “간단 path”만 지원합니다.
  - 예: `choices[0].message.content`, `data[].url`
- 현재 지원 `result_type`:
  - `text`, `image_urls`, `audio_data_url`, `raw_json`

---

## 1️⃣ (image) OpenAI – 이미지 생성(URL 반환) (v1 실행 가능)

### profile_key

```
openai.images.generate.v1
```

### purpose

```
image
```

### transport

> 전제: `ai_providers.api_base_url` 또는 `provider_api_credentials.endpoint_url`가 `https://api.openai.com/v1` 형태

```json
{
  "kind": "http_json",
  "method": "POST",
  "path": "/images/generations",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{apiKey}}"
  },
  "body": {
    "model": "{{model}}",
    "prompt": "{{userPrompt}}",
    "n": "{{params_n}}", 
    "size": "{{params_size}}"
  },
  "timeout_ms": 60000,
  "retry": { "max": 0, "backoff_ms": 0 }
}
```

### response_mapping

```json
{
  "result_type": "image_urls",
  "extract": {
    "urls_path": "data[].url"
  }
}
```

### workflow

```json
{}
```

---

## 2️⃣ (chat) OpenAI – Chat Completions (v1 실행 가능)

### profile_key

```
openai.chat.completions.v1
```

### purpose

```
chat
```

### transport

```json
{
  "kind": "http_json",
  "method": "POST",
  "path": "/chat/completions",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{apiKey}}"
  },
  "body": {
    "model": "{{model}}",
    "messages": [
      { "role": "user", "content": "{{input}}" }
    ],
    "max_completion_tokens": "{{maxTokens}}",
    "temperature": "{{params_temperature}}",
    "top_p": "{{params_top_p}}"
  },
  "timeout_ms": 60000,
  "retry": { "max": 0, "backoff_ms": 0 }
}
```

### response_mapping

```json
{
  "result_type": "text",
  "extract": {
    "text_path": "choices[0].message.content"
  }
}
```

### workflow

```json
{}
```

---

## 3️⃣ (chat) Google – Gemini 3 (GenerateContent) (v1 실행 가능)

> 전제:
> - `ai_providers.api_base_url` 또는 `provider_api_credentials.endpoint_url`가 `https://generativelanguage.googleapis.com/v1beta` 형태
> - API Key는 기존 credentials(api_key)로 관리하며, 헤더 `x-goog-api-key`에 `{{apiKey}}`를 사용합니다.
> - (중요) `temperature/topP/maxOutputTokens`는 숫자 타입이 필요하므로, v1 엔진의 “단독 placeholder 자동 타입 변환”을 사용합니다.

### profile_key

```
google.gemini.generateContent.v1
```

### purpose

```
chat
```

### transport

```json
{
  "kind": "http_json",
  "method": "POST",
  "path": "/models/{{model}}:generateContent",
  "headers": {
    "Content-Type": "application/json",
    "x-goog-api-key": "{{apiKey}}"
  },
  "body": {
    "contents": [
      {
        "role": "user",
        "parts": [{ "text": "{{input}}" }]
      }
    ],
    "generationConfig": {
      "temperature": "{{params_temperature}}",
      "topP": "{{params_top_p}}",
      "maxOutputTokens": "{{maxTokens}}"
    }
  },
  "timeout_ms": 60000
}
```

### response_mapping

```json
{
  "result_type": "text",
  "mode": "json",
  "extract": {
    "text_path": "candidates[0].content.parts[0].text"
  }
}
```

### workflow

```json
{}
```

---

## video / audio(binary) / music(vertex) 샘플에 대해
아래 샘플은 **이번에 추가한 v1 확장(binary + async_job + oauth2_service_account)** 기준으로 작성되어 실제 실행 가능합니다.

---

## 4️⃣ (audio) Binary TTS (v1 실행 가능: mode=binary)

### profile_key

```
openai.audio.speech.binary.v1
```

### purpose

```
audio
```

### transport

```json
{
  "kind": "http_json",
  "method": "POST",
  "path": "/audio/speech",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{apiKey}}"
  },
  "body": {
    "model": "{{model}}",
    "input": "{{userPrompt}}",
    "voice": "{{params_voice}}",
    "format": "{{params_format}}"
  },
  "timeout_ms": 60000
}
```

### response_mapping

```json
{
  "result_type": "audio_binary",
  "mode": "binary",
  "content_type": "audio/mpeg"
}
```

### workflow

```json
{}
```

> 참고: `content_type`은 provider 응답의 Content-Type을 그대로 쓰고 싶으면 생략 가능합니다.

---

## 5️⃣ (video) async_job (poll + download) (v1 실행 가능)

### profile_key

```
openai.video.async_job.v1
```

### purpose

```
video
```

### transport

```json
{
  "kind": "http_json",
  "method": "POST",
  "path": "/videos",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{apiKey}}"
  },
  "body": {
    "model": "{{model}}",
    "prompt": "{{userPrompt}}"
  },
  "timeout_ms": 90000
}
```

### response_mapping

```json
{
  "result_type": "video_job",
  "mode": "json",
  "extract": {
    "job_id_path": "id"
  }
}
```

### workflow

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

---

## 6️⃣ (music) Google Vertex – JSON base64 (oauth2_service_account) (v1 실행 가능)

### 사전 조건
- `provider_auth_profiles`에 `auth_type="oauth2_service_account"` 프로필을 만들고,
  - credential에는 “서비스 계정 JSON 문자열”이 저장되어 있어야 합니다.
  - config 예시:

```json
{
  "scopes": ["https://www.googleapis.com/auth/cloud-platform"],
  "token_url": "https://oauth2.googleapis.com/token",
  "location": "us-central1",
  "project_id": "YOUR_GCP_PROJECT_ID"
}
```

> 이 auth profile은 `model_api_profiles.auth_profile_id`로 연결됩니다.
> - 샘플 SQL: `document/provider_auth_profiles_sample.md` 참고

### profile_key

```
google.vertex.lyria.predict.v1
```

### purpose

```
music
```

### transport

```json
{
  "kind": "http_json",
  "method": "POST",
  "base_url": "https://{{config_location}}-aiplatform.googleapis.com",
  "path": "/v1/projects/{{config_project_id}}/locations/{{config_location}}/publishers/google/models/{{model}}:predict",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{accessToken}}"
  },
  "body": {
    "instances": [
      {
        "prompt": "{{userPrompt}}"
      }
    ]
  },
  "timeout_ms": 120000
}
```

### response_mapping

```json
{
  "result_type": "music_base64",
  "mode": "json_base64",
  "extract": {
    "base64_path": "predictions[0].audioContent",
    "mime_path": "predictions[0].mimeType"
  }
}
```

### workflow

```json
{}
```

---


