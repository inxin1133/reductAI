# Veo 3.1 Generate Preview

> 이 문서는 reductai 시스템에 Veo 3.1 Generate Preview(비디오 생성 모델)를 등록할 때 참조하는 설정 스펙입니다.
> models_prompt_video.md 및 schema_models.sql 스키마를 기준으로 검토·조정되었습니다.
>
> **공식 문서**: [Gemini API](https://ai.google.dev/gemini-api/docs) · [Veo 3.1 모델](https://cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-1-generate-preview) · [Veo Video Generation API](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation)

---

## 개요

Veo 3.1 Generate Preview는 Google의 비디오 생성 모델로, **Vertex AI**를 통해 제공됩니다.  
(Gemini API(ai.google.dev)에도 Veo가 추가되었으나, 본 문서는 Vertex AI API를 기준으로 합니다.)  
reductai는 비디오 생성 시 `model_api_profiles(purpose=video)`를 사용합니다.

> **인증**: Vertex AI는 API Key가 아니라 **OAuth 2.0(서비스 계정 또는 사용자 인증)** 이 필요합니다.  
> `auth_profile_id`로 OAuth2 프로필을 연결해야 합니다.

---

## ai_providers
AI 제공업체 (Vertex AI용)

| 필드 | 값 | 비고 |
|------|-----|------|
| provider_family | `google` | 라우팅/credential 매칭용. **필수** |
| name | `Google` | 표시용 |
| product_name | `Vertex AI` | Veo는 Vertex AI 제품 |
| slug | `google` 또는 `google-vertex` | 기존 코드가 `google`로 라우팅 |
| api_base_url | `https://us-central1-aiplatform.googleapis.com/v1` | **Vertex AI base**. Gemini(generativelanguage)와 다름 |
| website_url | `https://cloud.google.com/vertex-ai` | |
| documentation_url | `https://cloud.google.com/vertex-ai/generative-ai/docs` | |
| logo_key | `gemini` | UI 로고 매핑 (선택) |

---

## provider_api_credentials
> Vertex AI는 API Key 대신 **OAuth2 서비스 계정** 인증을 사용합니다.  
> `provider_api_credentials` 대신 `auth_profiles`(oauth2_service_account 등)를 연결합니다.

---

## ai_models
AI 모델 (비디오 타입)

| 필드 | 값 | 비고 |
|------|-----|------|
| name | `veo-3.1` | reductai 모델 이름 |
| model_id | `veo-3.1-generate-preview` | API 모델 ID. [Veo 3.1 문서](https://cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-1-generate-preview) 참고 |
| display_name | `Veo 3.1 Generate Preview` | 표시용 |
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
  "model": "veo-3.1-generate-preview",
  "limits": {
    "max_duration_seconds": 8,
    "max_videos_per_prompt": 4
  },
  "options": {
    "seconds": {
      "type": "int",
      "label": "seconds",
      "min": 4,
      "max": 8,
      "step": 2,
      "description": "클립 길이(초). API 허용값: 4, 6, 8 (reference image 사용 시 8만)"
    },
    "aspect_ratio": {
      "type": "enum",
      "label": "aspect_ratio",
      "values": ["16:9", "9:16"],
      "description": "가로:세로 비율. 16:9=가로, 9:16=세로"
    },
    "resolution": {
      "type": "enum",
      "label": "resolution",
      "values": ["720p", "1080p", "4k"],
      "description": "출력 해상도. 4k는 Preview 전용"
    },
    "generate_audio": {
      "type": "bool",
      "label": "generate_audio",
      "description": "오디오 생성 여부 (Veo 3 필수)"
    }
  },
  "defaults": {
    "seconds": 8,
    "aspect_ratio": "16:9",
    "resolution": "720p",
    "generate_audio": true
  },
  "supports": {
    "seconds": true,
    "aspect_ratio": true,
    "resolution": true,
    "generate_audio": true
  },
  "validation_hints": [
    "durationSeconds는 정수(4, 6, 8)로 전달됩니다. Sora와 달리 문자열 아님.",
    "reference image 사용 시 durationSeconds는 8만 지원됩니다.",
    "generateAudio는 Veo 3 모델에서 필수입니다."
  ]
}
```

> **기술 사양** ([Veo 3.1 문서](https://cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-1-generate-preview)):  
> - 해상도: 720p, 1080p, 4k(Preview 전용)  
> - 화면비: 9:16(세로), 16:9(가로)  
> - 길이: 4, 6, 8초  
> - 프레임: 24 FPS  
> - 포맷: video/mp4  

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
> Vertex AI는 완료 시 `response.videos[].gcsUri` 또는 base64를 반환합니다.

---

## prompt_templates
프롬프트 템플릿 (비디오용)

| 필드 | 비고 |
|------|------|
| name | 예: `veo-3.1-video-generate` |
| purpose | `video` | chat, image가 아님 |
| is_active | `true` |
| body | 아래 JSON |

> Vertex AI Veo는 `instances[0].prompt`와 `parameters` 객체를 사용합니다.  
> reductai는 `model_api_profiles(purpose=video)`로 호출합니다.

### body
```json
{
  "instances": [
    {
      "prompt": "{{input}}\n\nVideo direction:\n- cinematic lighting\n- smooth camera movement\n- stable frame-to-frame (avoid flicker)\n- avoid artifacts, glitches\n- avoid text/letters/logos/watermarks"
    }
  ],
  "parameters": {
    "durationSeconds": {{params_seconds}},
    "aspectRatio": "{{params_aspect_ratio}}",
    "resolution": "{{params_resolution}}",
    "generateAudio": "{{params_generate_audio}}",
    "sampleCount": 1
  }
}
```

> `{{input}}` 또는 `{{userPrompt}}`는 런타임에서 사용자 입력으로 치환됩니다.  
> `params_seconds`는 정수(4, 6, 8)로 전달. `params_aspect_ratio`는 "16:9" 또는 "9:16".  
> `params_resolution`은 "720p", "1080p", "4k". `params_generate_audio`는 boolean.

---

## model_api_profiles
> reductai는 비디오 생성 시 **model_api_profiles(purpose=video)** 를 사용합니다.  
> Vertex AI Veo는 **predictLongRunning** + **fetchPredictOperation**(poll) 흐름을 사용합니다.  
> **인증**: `auth_profile_id`로 OAuth2 서비스 계정 프로필을 연결해야 합니다.

### transport (초기 요청)
```
POST https://us-central1-aiplatform.googleapis.com/v1/projects/{project_id}/locations/us-central1/publishers/google/models/veo-3.1-generate-preview:predictLongRunning
Headers: Authorization: Bearer {access_token}
Content-Type: application/json
```

```json
{
  "kind": "http_json",
  "method": "POST",
  "path": "/projects/{{config_project_id}}/locations/{{config_location}}/publishers/google/models/veo-3.1-generate-preview:predictLongRunning",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{accessToken}}"
  },
  "body": {
    "instances": [
      {
        "prompt": "{{userPrompt}}"
      }
    ],
    "parameters": {
      "durationSeconds": "{{params_seconds}}",
      "aspectRatio": "{{params_aspect_ratio}}",
      "resolution": "{{params_resolution}}",
      "generateAudio": "{{params_generate_audio}}",
      "sampleCount": 1
    }
  },
  "timeout_ms": 120000
}
```

> `{{config_project_id}}`, `{{config_location}}`: provider_auth_profiles.config의 project_id, location이 주입됨.  
> `{{accessToken}}`: OAuth2로 발급한 토큰.  
> `path`의 `:predictLongRunning`은 path에 포함되거나, 실제 URL path가 `.../models/MODEL_ID:predictLongRunning` 형태여야 합니다.  
> (일부 HTTP 클라이언트는 path에 `:` 포함 시 제약이 있을 수 있어, 구현 시 확인 필요.)

### response_mapping
```json
{
  "result_type": "raw_json",
  "mode": "json",
  "extract": {
    "job_id_path": "name"
  }
}
```

> 초기 응답: `{ "name": "projects/.../operations/OPERATION_ID" }`  
> `name` 전체가 job_id로 사용됩니다.

### workflow (async_job)
```json
{
  "type": "async_job",
  "job_id_path": "name",
  "steps": [
    {
      "name": "poll",
      "method": "POST",
      "path": "/projects/{{config_project_id}}/locations/{{config_location}}/publishers/google/models/veo-3.1-generate-preview:fetchPredictOperation",
      "interval_ms": 5000,
      "max_attempts": 60,
      "status_path": "done",
      "terminal_states": ["true"]
    },
    {
      "name": "download",
      "method": "POST",
      "path": "/projects/{{config_project_id}}/locations/{{config_location}}/publishers/google/models/veo-3.1-generate-preview:fetchPredictOperation",
      "mode": "json",
      "url_path": "response.videos[0].gcsUri"
    }
  ]
}
```

> **Vertex AI Poll**: `fetchPredictOperation`은 **POST**이며 body에 `{ "operationName": "{{job_id}}" }` 가 필요합니다.  
> 현재 chatRuntimeController의 poll/download 단계는 **body를 지원하지 않을 수 있습니다**.  
> 이 경우 백엔드 확장( poll step에 body 지원) 또는 Vertex Operations API(GET) 활용이 필요할 수 있습니다.  
>  
> **완료 응답**: `done: true` 시 `response.videos[]`에 `gcsUri` 또는 `bytesBase64Encoded` 포함.  
> `storageUri`를 지정하면 출력이 GCS에 저장되고 `gcsUri`로 반환됩니다. 미지정 시 base64가 응답에 포함될 수 있습니다.  
>  
> **구현 참고**: Vertex API 구조가 OpenAI Sora와 달라, 실제 연동 시 workflow step별 method/body/경로 검증이 필요합니다.

---

## model_routing_rules
모델 라우팅 규칙 (선택)

| 필드 | 값 | 비고 |
|------|-----|------|
| conditions | 아래 JSON | video 타입 요청에 적용 |
| target_model_id | (ai_models.id) | Veo 3.1 모델 ID |
| fallback_model_id | (선택) | 예: 다른 비디오 모델 |
| priority | `0` | |

### conditions
```json
{
  "feature": "chat",
  "model_type": "video"
}
```

---

## provider_auth_profiles
인증 프로필 (provider_auth_profiles 테이블)

> Vertex AI Veo는 API Key가 아니라 **OAuth2 서비스 계정** 인증이 필요합니다.  
> `provider_auth_profiles`에 oauth2_service_account 프로필을 등록하고, `model_api_profiles.auth_profile_id`로 연결합니다.

| 필드 | 값 | 비고 |
|------|-----|------|
| tenant_id | (tenants.id) | 테넌트 ID |
| provider_id | (ai_providers.id) | Vertex AI provider ID |
| profile_key | `google_vertex_sa_v1` | 인증 프로필 키 (예: google_vertex_sa_v1) |
| auth_type | `oauth2_service_account` | **api_key 아님**. Vertex AI는 OAuth2 필수 |
| credential_id | (provider_api_credentials.id) | 서비스 계정 JSON이 저장된 credential FK |
| config | 아래 JSON | scopes, token_url, project_id, location 등 |
| token_cache_key | (선택) | access_token 캐시 키. NULL이면 `auth:{tenant_id}:{profile_id}` 사용 |
| is_active | `true` | |

### config
```json
{
  "token_url": "https://oauth2.googleapis.com/token",
  "scopes": ["https://www.googleapis.com/auth/cloud-platform"],
  "project_id": "YOUR_GCP_PROJECT_ID",
  "location": "us-central1"
}
```

> **config 필드** ([schema_models.sql](document/schema_models.sql) 기준):  
> - `scopes`: OAuth2 scope 배열. Vertex AI는 `cloud-platform` 권한 필요  
> - `token_url`: (선택) 기본 `https://oauth2.googleapis.com/token`  
> - `project_id`: GCP 프로젝트 ID. transport path의 `{{config_project_id}}`로 주입됨  
> - `location`: (선택) 리전. `{{config_location}}`으로 주입  

### credential (provider_api_credentials)
`credential_id`로 참조하는 `provider_api_credentials` 레코드에는:

| 필드 | 값 | 비고 |
|------|-----|------|
| credential_name | 예: `Vertex AI Service Account` | |
| api_key_encrypted | (암호화된 값) | **서비스 계정 JSON 전체** (private_key, client_email 등) |
| provider_id | (ai_providers.id) | 동일 provider |
| is_active | `true` | |

> oauth2_service_account일 때 `api_key_encrypted`에는 복호화 시 **서비스 계정 키 JSON** 문자열이 들어갑니다.  
> 예: `{ "type": "service_account", "project_id": "...", "private_key_id": "...", "private_key": "...", "client_email": "...", ... }`

### model_api_profiles 연결
`model_api_profiles` 생성 시 `auth_profile_id`에 위 `provider_auth_profiles.id`를 설정합니다.

```sql
-- 예: model_api_profiles.auth_profile_id = provider_auth_profiles.id
UPDATE model_api_profiles SET auth_profile_id = '...' WHERE profile_key = 'google_veo_video_v1';
```

> transport의 `Authorization` 헤더는 `{{accessToken}}`을 사용합니다.  
> oauth2_service_account 프로필이면 `resolveAuthForModelApiProfile`이 JWT assertion으로 access_token을 발급하고, 그 값이 `{{accessToken}}`에 주입됩니다.

---

## API 엔드포인트 요약
> [Veo Video Generation API](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation) 기준

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `.../models/veo-3.1-generate-preview:predictLongRunning` | 비디오 생성 요청 (LRO 시작) |
| POST | `.../models/veo-3.1-generate-preview:fetchPredictOperation` | 작업 상태 조회 (poll) |

### 텍스트→비디오 생성 요청
```json
{
  "instances": [{ "prompt": "A serene lake at sunset..." }],
  "parameters": {
    "durationSeconds": 8,
    "aspectRatio": "16:9",
    "resolution": "720p",
    "generateAudio": true
  }
}
```

### Poll 응답 (완료 시)
```json
{
  "done": true,
  "response": {
    "videos": [
      { "gcsUri": "gs://BUCKET/.../sample_0.mp4", "mimeType": "video/mp4" }
    ]
  }
}
```

---

## Sora vs Veo 파라미터 매핑

| Sora (OpenAI) | Veo (Vertex AI) |
|---------------|-----------------|
| `prompt` | `instances[0].prompt` |
| `seconds` (문자열 "4","8","12") | `durationSeconds` (정수 4,6,8) |
| `size` ("1280x720" 등) | `aspectRatio` + `resolution` |
| - | `generateAudio` (Veo 3 필수) |

---

## 등록 순서 권장

1. **ai_providers**: Vertex AI용 provider 생성 (api_base_url=`https://us-central1-aiplatform.googleapis.com/v1`)
2. **provider_api_credentials**: 서비스 계정 JSON을 credential로 등록 (api_key_encrypted에 SA JSON 저장)
3. **provider_auth_profiles**: oauth2_service_account 프로필 생성 (credential_id, config 연결)
4. **response_schemas**: 비디오 응답 스키마 생성 → ID 확보
5. **prompt_templates**: purpose=`video`, body에 `instances`, `parameters` 포함 → ID 확보
6. **ai_models**: model_type=`video`, response_schema_id, prompt_template_id 연결하여 생성
7. **model_api_profiles**: purpose=`video`, profile_key=`google_veo_video_v1`, auth_profile_id 연결
8. **model_routing_rules**: (선택) video 타입 라우팅 규칙 추가

---

## 런타임 동작
- **purpose=video** 요청 시 `chatRuntimeController`가 `model_api_profiles` 중 `purpose=video` 프로필을 선택
- `transport` body의 `{{params_seconds}}`, `{{params_aspect_ratio}}`, `{{params_resolution}}` 등은 capabilities/UI에서 전달
- `params_seconds`는 정수로 전달 (4, 6, 8)
- `videoUsage`는 `seconds`, `resolution`(또는 size) 기준으로 과금 계산
- 출력: `content.video.{mime, data_url}` 또는 `content.video.url` (gcsUri → signed URL 변환 시)

---

## 주의사항
- **Vertex AI 전용**: Veo는 Gemini API( generativelanguage.googleapis.com )와 다른 Vertex AI( aiplatform.googleapis.com ) 엔드포인트를 사용합니다.
- **OAuth 필요**: API Key만으로는 호출 불가. 서비스 계정 또는 사용자 OAuth2 설정이 필요합니다.
- **project_id**: 모든 요청에 GCP 프로젝트 ID가 필요합니다. 템플릿 변수로 주입해야 합니다.
