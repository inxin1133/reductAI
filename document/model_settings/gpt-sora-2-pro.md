# GPT Sora 2 Pro

> 이 문서는 reductai 시스템에 GPT Sora 2 Pro(비디오 생성 모델)를 등록할 때 참조하는 설정 스펙입니다.
> models_prompt_video.md 및 schema_models.sql 스키마를 기준으로 검토·조정되었습니다.
>
> **공식 문서**: [Platform 문서](https://platform.openai.com/docs) · [Videos API Reference](https://platform.openai.com/docs/api-reference/videos) · [Sora 2 Prompting Guide](https://cookbook.openai.com/examples/sora/sora2_prompting_guide)

---

## ai_providers
AI 제공업체 (GPT 텍스트/이미지 모델과 동일 OpenAI 공유)

| 필드 | 값 | 비고 |
|------|-----|------|
| provider_family | `openai` | 라우팅/credential 매칭용. **필수** |
| name | `OpenAI` | 표시용 |
| product_name | `ChatGPT` | 표시용. Sora는 ChatGPT 제품군 |
| slug | `openai` | 기존 코드가 `openai`로 하드코딩 |
| api_base_url | `https://api.openai.com/v1` | **base만** 저장 |
| website_url | `https://openai.com` | |
| documentation_url | `https://platform.openai.com/docs` | |
| logo_key | `chatgpt` | UI 로고 매핑 (선택) |

---

## provider_api_credentials
API Key 인증 정보 (OpenAI 공유)

| 필드 | 값 | 비고 |
|------|-----|------|
| endpoint_url | `https://api.openai.com/v1` | 커스텀 URL이 없으면 NULL |

---

## ai_models
AI 모델 (비디오 타입 — Pro)

| 필드 | 값 | 비고 |
|------|-----|------|
| name | `gpt-sora-2-pro` | reductai 모델 이름 |
| model_id | `sora-2-pro` | API 모델 ID. [Videos API](https://platform.openai.com/docs/api-reference/videos)에서 확인 |
| display_name | `GPT Sora 2 Pro` | 표시용 |
| model_type | `video` | **text, image가 아님** |
| context_window | NULL | 비디오 모델은 해당 없음 |
| max_input_tokens | NULL | 비디오 모델은 해당 없음 |
| max_output_tokens | NULL | 비디오 모델은 해당 없음 |
| prompt_template_id | (prompt_templates.id) | 아래 prompt_templates 생성 후 FK |
| response_schema_id | (response_schemas.id) | 아래 response_schemas 생성 후 FK |
| capabilities | 아래 JSON | |
| is_available | `true` | |
| is_default | `false` | video 타입 기본 모델이 있으면 false |
| status | `active` | |
| sort_order | `0` | |

### capabilities
```json
{
  "model": "sora-2-pro",
  "limits": {
    "max_duration_seconds": 12
  },
  "options": {
    "seconds": {
      "type": "int",
      "label": "seconds",
      "min": 4,
      "max": 12,
      "step": 4,
      "description": "클립 길이(초). API 허용값: 4, 8, 12"
    },
    "size": {
      "type": "enum",
      "label": "size",
      "values": ["720x1280", "1280x720", "1024x1792", "1792x1024"],
      "description": "해상도(가로x세로). sora-2-pro는 4종 모두 지원 (sora-2보다 고해상도 옵션 추가)"
    }
  },
  "defaults": {
    "seconds": 4,
    "size": "1280x720"
  },
  "supports": {
    "seconds": true,
    "size": true
  },
  "validation_hints": [
    "seconds는 API에서 문자열로 전달됩니다 (\"4\", \"8\", \"12\"). params_seconds는 런타임에서 string으로 변환됩니다.",
    "sora-2-pro 전용: 1024x1792, 1792x1024는 sora-2에는 없음. 고해상도 출력 시 사용."
  ]
}
```

> **sora-2 vs sora-2-pro**: sora-2-pro는 720x1280, 1280x720 외에 **1024x1792**, **1792x1024**를 추가 지원합니다.  
> **권장**: 짧은 4초 클립을 여러 개 이어 붙이는 방식이 긴 1회 생성보다 안정적입니다. ([Sora 2 Prompting Guide](https://cookbook.openai.com/examples/sora/sora2_prompting_guide))

---

## response_schemas
출력 계약 (block_json 형식 — 비디오 포함)

| 필드 | 비고 |
|------|------|
| name | 예: `llm_video_response` |
| strict | `true` |
| schema | 아래 JSON |

### schema
```json
{
  "type": "object",
  "required": ["title", "summary", "blocks", "video"],
  "additionalProperties": false,
  "properties": {
    "title": { "type": "string" },
    "summary": { "type": "string" },
    "blocks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "markdown"],
        "additionalProperties": false,
        "properties": {
          "type": { "const": "markdown" },
          "markdown": { "type": "string" }
        }
      }
    },
    "video": {
      "type": "object",
      "required": ["id", "status"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string" },
        "status": { "type": "string" },
        "mime": { "type": "string" },
        "download_url": { "type": "string" },
        "data_url": { "type": "string" }
      }
    }
  }
}
```

> 비동기 작업 완료 후 chatRuntimeController가 `content.video.{data_url|url}` 형태로 반환합니다.

---

## prompt_templates
프롬프트 템플릿 (비디오용 — `prompt`, `seconds`, `size` 필드 사용)

| 필드 | 비고 |
|------|------|
| name | 예: `gpt-sora-2-pro-video-generate` |
| purpose | `video` | chat, image가 아님 |
| is_active | `true` |
| body | 아래 JSON |

> 비디오 모델은 `messages`가 아니라 `prompt`, `seconds`, `size` 필드를 사용합니다.  
> reductai는 `model_api_profiles(purpose=video)`로 호출합니다. ([models_prompt_video.md](document/models_prompt/models_prompt_video.md))

### body
```json
{
  "model": "{{model}}",
  "prompt": "{{input}}\n\nVideo direction:\n- cinematic lighting\n- smooth camera movement\n- stable frame-to-frame (avoid flicker)\n- avoid artifacts, glitches\n- avoid text/letters/logos/watermarks",
  "seconds": "{{params_seconds}}",
  "size": "{{params_size}}"
}
```

> `{{input}}` 또는 `{{userPrompt}}`는 런타임에서 사용자 입력으로 치환됩니다.  
> `{{params_seconds}}`는 capabilities.defaults 또는 UI 입력값으로, API는 문자열 `"4"`, `"8"`, `"12"`를 요구합니다.

---

## model_api_profiles
> reductai는 비디오 생성 시 **model_api_profiles(purpose=video)** 를 사용합니다.  
> OpenAI Sora는 **Videos API** `POST /videos`를 사용하며, 비동기 작업(job) → poll → content 다운로드 흐름입니다.

### transport
```
POST https://api.openai.com/v1/videos
Headers: Authorization: Bearer {apiKey}
Content-Type: application/json
```

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
    "prompt": "{{userPrompt}}",
    "seconds": "{{params_seconds}}",
    "size": "{{params_size}}"
  },
  "timeout_ms": 120000
}
```

### response_mapping
```json
{
  "result_type": "raw_json",
  "mode": "json",
  "extract": {
    "job_id_path": "id"
  }
}
```

### workflow (async_job)
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
      "max_attempts": 90,
      "status_path": "status",
      "terminal_states": ["completed", "failed", "canceled", "cancelled", "error"]
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

> **API 스펙** ([Videos API](https://platform.openai.com/docs/api-reference/videos)):  
> - `POST /videos` → job 객체 반환 (`id`, `status` 등)  
> - `GET /videos/{video_id}` → 작업 상태 조회  
> - `GET /videos/{video_id}/content` → 실제 비디오 바이너리 다운로드  
> - status: `queued` | `in_progress` | `completed` | `failed`  
>  
> download step이 `mode: "binary"`이면 chatRuntimeController가 `content.video.data_url`로 base64 인코딩하여 반환합니다.

---

## model_routing_rules
모델 라우팅 규칙 (선택)

| 필드 | 값 | 비고 |
|------|-----|------|
| conditions | 아래 JSON | video 타입 요청에 적용 |
| target_model_id | (ai_models.id) | GPT Sora 2 Pro 모델 ID |
| fallback_model_id | (선택) | 예: gpt-sora-2 |
| priority | `0` | |

### conditions
```json
{
  "feature": "chat",
  "model_type": "video"
}
```

---

## API 엔드포인트 요약
> [Videos API Reference](https://platform.openai.com/docs/api-reference/videos) 기준

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/videos` | 비디오 생성 요청 (job 생성) |
| GET | `/videos` | 비디오 목록 조회 |
| GET | `/videos/{video_id}` | 작업 상태 조회 |
| GET | `/videos/{video_id}/content` | 비디오 바이너리 다운로드 |
| DELETE | `/videos/{video_id}` | 비디오 삭제 |
| POST | `/videos/{video_id}/remix` | 리믹스(확장) |

### 생성 요청 body (sora-2-pro)
```json
{
  "model": "sora-2-pro",
  "prompt": "A serene lake at sunset...",
  "seconds": "4",
  "size": "1280x720"
}
```

> sora-2-pro는 `1024x1792`, `1792x1024`도 사용 가능합니다.

---

## 등록 순서 권장

1. **ai_providers**: OpenAI provider가 없으면 생성 (텍스트/이미지 모델과 공유)
2. **provider_api_credentials**: API Key 등록 (공유)
3. **response_schemas**: 비디오 응답 스키마 생성 → ID 확보
4. **prompt_templates**: purpose=`video`, body에 `prompt`, `seconds`, `size` 포함 → ID 확보
5. **ai_models**: model_type=`video`, response_schema_id, prompt_template_id 연결하여 생성
6. **model_api_profiles**: purpose=`video`, profile_key=`openai_sora_video_v1` 등록 (provider_family=openai)
7. **model_routing_rules**: (선택) video 타입 라우팅 규칙 추가

---

## 런타임 동작
- **purpose=video** 요청 시 `chatRuntimeController`가 `model_api_profiles` 중 `purpose=video` 프로필을 선택
- `transport` body의 `{{params_seconds}}`, `{{params_size}}`는 capabilities/UI에서 전달
- `params_seconds`는 문자열로 전달 (`"4"`, `"8"`, `"12"`)
- `videoUsage`는 `seconds`, `size` 기준으로 과금 계산
- 출력: `content.video.{mime, data_url}` 또는 `content.video.url`
