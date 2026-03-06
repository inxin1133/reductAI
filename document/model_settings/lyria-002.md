# Lyria 2

> 이 문서는 reductai 시스템에 Lyria 2(음악 생성 모델)를 등록할 때 참조하는 설정 스펙입니다.
> schema_models.sql 스키마를 기준으로 검토·조정되었습니다.
>
> **공식 문서**: [Gemini API](https://ai.google.dev/gemini-api/docs) · [Lyria 2 모델](https://cloud.google.com/vertex-ai/generative-ai/docs/models/lyria/lyria-002) · [Lyria Music Generation API](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/lyria-music-generation)

---

## 개요

Lyria 2 (`lyria-002`)는 Google의 음악 생성 모델로, **Vertex AI**를 통해 제공됩니다.  
텍스트 프롬프트로부터 악기 음악을 생성하며, WAV 포맷(48kHz, 약 30초)으로 반환합니다.  
reductai는 음악 생성 시 `model_api_profiles(purpose=music)`를 사용합니다.

> **동기 API**: Lyria는 Veo와 달리 **`predictLongRunning`이 아닌 `predict`** 를 사용합니다.  
> 비동기 poll 없이 **요청 직후 응답**에 base64 오디오가 포함됩니다.  
>  
> **인증**: Vertex AI는 **OAuth 2.0(서비스 계정)** 이 필요합니다.  
> `auth_profile_id`로 OAuth2 프로필을 연결해야 합니다.

---

## ai_providers
AI 제공업체 (Vertex AI용)

| 필드 | 값 | 비고 |
|------|-----|------|
| provider_family | `google` | 라우팅/credential 매칭용. **필수** |
| name | `Google` | 표시용 |
| product_name | `Vertex AI` | Lyria는 Vertex AI 제품 |
| slug | `google` 또는 `google-vertex` | 기존 코드가 `google`로 라우팅 |
| api_base_url | `https://us-central1-aiplatform.googleapis.com/v1` | **Vertex AI base**. Gemini(generativelanguage)와 다름 |
| website_url | `https://cloud.google.com/vertex-ai` | |
| documentation_url | `https://cloud.google.com/vertex-ai/generative-ai/docs` | |
| logo_key | `gemini` | UI 로고 매핑 (선택) |

---

## provider_api_credentials / provider_auth_profiles
> Vertex AI는 API Key 대신 **OAuth2 서비스 계정** 인증을 사용합니다.  
> [veo-3.1.md](veo-3.1.md)의 `provider_auth_profiles` 섹션을 참고하여 동일하게 설정합니다.  
> (credential에 서비스 계정 JSON, profile에 oauth2_service_account, config에 project_id, location)

---

## ai_models
AI 모델 (음악 타입)

| 필드 | 값 | 비고 |
|------|-----|------|
| name | `lyria-002` | reductai 모델 이름 |
| model_id | `lyria-002` | API 모델 ID. [Lyria 2 문서](https://cloud.google.com/vertex-ai/generative-ai/docs/models/lyria/lyria-002) 참고 |
| display_name | `Lyria 2` | 표시용 |
| model_type | `music` | **text, image, video가 아님** |
| context_window | NULL | 음악 모델은 해당 없음 |
| max_input_tokens | NULL | 음악 모델은 해당 없음 |
| max_output_tokens | NULL | 음악 모델은 해당 없음 |
| prompt_template_id | (prompt_templates.id) | 아래 prompt_templates 생성 후 FK |
| response_schema_id | (response_schemas.id) | 아래 response_schemas 생성 후 FK |
| capabilities | 아래 JSON | |
| is_available | `true` | |
| is_default | `false` | music 타입 기본 모델이 있으면 false |
| status | `active` | |
| sort_order | `0` | |

### capabilities
```json
{
  "model": "lyria-002",
  "limits": {
    "duration_seconds": 30,
    "max_clips_per_request": 4
  },
  "options": {
    "sample_count": {
      "type": "int",
      "label": "sample_count",
      "min": 1,
      "max": 4,
      "description": "생성할 오디오 클립 수. seed 사용 시 불가"
    },
    "seed": {
      "type": "int",
      "label": "seed",
      "description": "재현 가능한 출력용 시드. sample_count와 동시 사용 불가"
    },
    "negative_prompt": {
      "type": "string",
      "label": "negative_prompt",
      "description": "제외할 요소 기술 (예: vocals, slow tempo)"
    }
  },
  "defaults": {
    "sample_count": 1,
    "negative_prompt": ""
  },
  "supports": {
    "sample_count": true,
    "seed": true,
    "negative_prompt": true
  },
  "validation_hints": [
    "sample_count와 seed는 동시에 사용할 수 없습니다.",
    "프롬프트는 US English(en-us)로 작성해야 합니다.",
    "출력: 30초 WAV, 48kHz, 악기만 (보컬 미지원). SynthID 워터마크 포함."
  ]
}
```

> **기술 사양** ([Lyria 2 문서](https://cloud.google.com/vertex-ai/generative-ai/docs/models/lyria/lyria-002)):  
> - 포맷: WAV  
> - 샘플레이트: 48kHz  
> - 길이: 클립당 약 30초  
> - 최대 요청당 클립: 4  
> - 프롬프트 언어: US English (en-us)  

---

## response_schemas
출력 계약 (block_json 형식 — 오디오 포함)

| 필드 | 비고 |
|------|------|
| name | 예: `llm_music_response` |
| strict | `true` |
| schema | 아래 JSON |

### schema
```json
{
  "type": "object",
  "required": ["title", "summary", "blocks", "audio"],
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
    "audio": {
      "type": "object",
      "required": ["mime", "data_url"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string" },
        "status": { "type": "string" },
        "mime": { "type": "string" },
        "data_url": { "type": "string" }
      }
    }
  }
}
```

> chatRuntimeController가 `content.audio.{mime, data_url}` 형태로 반환합니다.

---

## prompt_templates
프롬프트 템플릿 (음악용)

| 필드 | 비고 |
|------|------|
| name | 예: `lyria-002-music-generate` |
| purpose | `music` | chat, image, video가 아님 |
| is_active | `true` |
| body | 아래 JSON |

> Lyria API는 `instances[0].prompt`와 `instances[0].negative_prompt`, `parameters.sample_count` 등을 사용합니다.

### body
```json
{
  "instances": [
    {
      "prompt": "{{input}}\n\nMusic direction:\n- instrumental only\n- describe genre, mood, instrumentation, tempo in detail",
      "negative_prompt": "{{params_negative_prompt}}"
    }
  ],
  "parameters": {
    "sample_count": {{params_sample_count}}
  }
}
```

> `{{input}}` 또는 `{{userPrompt}}`는 런타임에서 사용자 입력으로 치환됩니다.  
> `params_negative_prompt`가 비어 있으면 해당 필드 생략 권장.  
> `params_sample_count`는 1~4. **seed** 사용 시 `sample_count`와 **동시 사용 불가** — body에서 `parameters.sample_count` 제거하고 `instances[0].seed` 추가.

### body (seed 사용 시)
```json
{
  "instances": [
    {
      "prompt": "{{input}}",
      "negative_prompt": "{{params_negative_prompt}}",
      "seed": {{params_seed}}
    }
  ],
  "parameters": {}
}
```

---

## model_api_profiles
> reductai는 음악 생성 시 **model_api_profiles(purpose=music)** 를 사용합니다.  
> Lyria는 **동기 `predict`** API이므로 workflow 없이 직통 응답을 처리합니다.  
> 응답에 `predictions[0].audioContent` (base64), `predictions[0].mimeType` 포함.

### transport
```
POST https://us-central1-aiplatform.googleapis.com/v1/projects/{project_id}/locations/us-central1/publishers/google/models/lyria-002:predict
Headers: Authorization: Bearer {access_token}
Content-Type: application/json
```

```json
{
  "kind": "http_json",
  "method": "POST",
  "path": "/projects/{{config_project_id}}/locations/{{config_location}}/publishers/google/models/lyria-002:predict",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{accessToken}}"
  },
  "body": {
    "instances": [
      {
        "prompt": "{{userPrompt}}",
        "negative_prompt": "{{params_negative_prompt}}"
      }
    ],
    "parameters": {
      "sample_count": {{params_sample_count}}
    }
  },
  "timeout_ms": 60000
}
```

> `{{config_project_id}}`, `{{config_location}}`: provider_auth_profiles.config에서 주입  
> `{{accessToken}}`: OAuth2 토큰  
> `params_negative_prompt`가 없으면 빈 문자열 또는 필드 생략.

### response_mapping
```json
{
  "result_type": "raw_json",
  "mode": "json_base64",
  "extract": {
    "audio_base64_path": "predictions[0].audioContent",
    "mime_path": "predictions[0].mimeType"
  }
}
```

> **json_base64 모드**: 동기 응답에서 base64 + mime을 추출하여 `data_url`로 변환합니다.

### workflow
```json
{}
```

> Lyria는 **동기 API**이므로 async_job workflow 없음.

---

## model_routing_rules
모델 라우팅 규칙 (선택)

| 필드 | 값 | 비고 |
|------|-----|------|
| conditions | 아래 JSON | music 타입 요청에 적용 |
| target_model_id | (ai_models.id) | Lyria 2 모델 ID |
| fallback_model_id | (선택) | |
| priority | `0` | |

### conditions
```json
{
  "feature": "chat",
  "model_type": "music"
}
```

---

## API 엔드포인트 요약
> [Lyria Music Generation API](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/lyria-music-generation) 기준

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `.../models/lyria-002:predict` | 음악 생성 (동기, 응답에 오디오 포함) |

### 생성 요청
```json
{
  "instances": [
    {
      "prompt": "A calm acoustic folk song with a gentle guitar melody and soft strings.",
      "negative_prompt": "drums, electric guitar",
      "seed": 98765
    }
  ],
  "parameters": {}
}
```

### 생성 요청 (sample_count 사용)
```json
{
  "instances": [
    {
      "prompt": "An energetic electronic dance track with a fast tempo.",
      "negative_prompt": "vocals"
    }
  ],
  "parameters": {
    "sample_count": 2
  }
}
```

### 응답
```json
{
  "predictions": [
    {
      "audioContent": "BASE64_ENCODED_WAV_STRING",
      "mimeType": "audio/wav"
    }
  ]
}
```

---

## 등록 순서 권장

1. **ai_providers**: Vertex AI용 provider 생성 (veo-3.1과 동일)
2. **provider_api_credentials**: 서비스 계정 JSON 등록
3. **provider_auth_profiles**: oauth2_service_account 프로필 생성
4. **response_schemas**: 음악 응답 스키마 생성 → ID 확보
5. **prompt_templates**: purpose=`music`, body에 `instances`, `parameters` 포함 → ID 확보
6. **ai_models**: model_type=`music`, response_schema_id, prompt_template_id 연결하여 생성
7. **model_api_profiles**: purpose=`music`, profile_key=`google_lyria_music_v1`, auth_profile_id 연결
8. **model_routing_rules**: (선택) music 타입 라우팅 규칙 추가

---

## 런타임 동작
- **purpose=music** 요청 시 `chatRuntimeController`가 `model_api_profiles` 중 `purpose=music` 프로필을 선택
- 동기 요청 → 응답에서 `predictions[0].audioContent`, `predictions[0].mimeType` 추출 → `data_url` 생성
- 출력: `content.audio.{mime, data_url}`
- `musicUsage`: seconds(30), sample_rate(48000) 등으로 기록

---

## 주의사항
- **Vertex AI 전용**: Lyria는 Vertex AI(aiplatform.googleapis.com)를 사용합니다.
- **OAuth 필요**: API Key만으로는 호출 불가.
- **프롬프트 언어**: US English(en-us)만 지원됩니다.
- **sample_count vs seed**: 둘 중 하나만 사용. 동시 사용 불가.
