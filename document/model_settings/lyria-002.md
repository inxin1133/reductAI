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

> **인증**: Vertex AI는 API Key가 아니라 **OAuth 2.0** 인증이 필요합니다.  
> reductai는 두 가지 방식을 지원합니다:
> - **google_adc**: Application Default Credentials (로컬 `gcloud auth application-default login` / GCP Workload Identity). **credential 없이** config만 설정.
> - **oauth2_service_account**: 서비스 계정 JSON을 credential로 등록. 조직 정책으로 JSON 키 발급이 가능한 환경에서 사용.

---

## ai_providers
AI 제공업체 (Vertex AI용)

> Veo 3.1과 **동일한 Vertex AI provider**를 사용합니다. [veo-3.1.md](veo-3.1.md) 참고.

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

## provider_api_credentials
> Vertex AI는 API Key 대신 **OAuth2** 인증을 사용합니다.  
> - **google_adc** 사용 시: `provider_api_credentials` 등록 **불필요**. credential 없이 `provider_auth_profiles`만 설정.
> - **oauth2_service_account** 사용 시: `provider_api_credentials`에 서비스 계정 JSON을 저장하고, `provider_auth_profiles`에서 credential_id로 연결.

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

### body (통합 템플릿)
> **seed와 sample_count 동시 사용 불가**: Lyria API 제약으로, 런타임에서 options에 따라 body가 자동 분기됩니다.  
> `model_api_profiles.transport.body`와 `prompt_templates.body`는 아래 통합 형식 하나만 사용합니다.

```json
{
  "instances": [
    {
      "prompt": "{{input}}\n\nMusic direction:\n- instrumental only\n- describe genre, mood, instrumentation, tempo in detail",
      "negative_prompt": "{{params_negative_prompt}}"
    }
  ],
  "parameters": {
    "sample_count": "{{params_sample_count}}"
  }
}
```

> - `{{input}}` 또는 `{{userPrompt}}`: 사용자 입력으로 치환  
> - `{{params_negative_prompt}}`: 비어 있으면 필드 생략  
> - `{{params_sample_count}}`: 1~4. **seed가 지정되면** runtime에서 `parameters` 비우고 `instances[0].seed` 사용  
> - **seed 미지정 시**: `parameters.sample_count` 유지 (options.sample_count 또는 1)

**런타임 분기 (executeHttpJsonProfile)**  
- `options.seed` 있음 → `instances[0].seed` 추가, `parameters = {}`  
- `options.seed` 없음 → `instances[0].seed` 제거, `parameters.sample_count` 유지

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
    "seed": {
      "type": "int",
      "label": "seed",
      "description": "같은 음악을 미세하게 수정할 때, 예)55번 선택, 생성후 55번 그대로 선택, 프로프트 미세 수정 → 생성"
    }
  },
  "defaults": {
    "negative_prompt": ""
  },
  "supports": {
    "sample_count": false,
    "seed": true,
    "negative_prompt": true
  },
  "validation_hints": [
    "프롬프트는 US English(en-us)로 작성해야 합니다.",
    "출력: 30초 WAV, 48kHz, 악기만 (보컬 미지원). SynthID 워터마크 포함."
  ],
  "description": [
    "Lyria는 실험용 모델입니다.",
    "출력: 30초 WAV, 48kHz, 악기만 (보컬 미지원)."
  ]
}
```

<!-- sample_count 있는 버전
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
``` -->

> **기술 사양** ([Lyria 2 문서](https://cloud.google.com/vertex-ai/generative-ai/docs/models/lyria/lyria-002)):  
> - 포맷: WAV  
> - 샘플레이트: 48kHz  
> - 길이: 클립당 약 30초  
> - 최대 요청당 클립: 4  
> - 프롬프트 언어: US English (en-us)  

---


## model_api_profiles
> reductai는 음악 생성 시 **model_api_profiles(purpose=music)** 를 사용합니다.  
> Lyria는 **동기 `predict`** API이므로 workflow 없이 직통 응답을 처리합니다.  
> 응답에 `predictions[0].audioContent` (base64), `predictions[0].mimeType` 포함.  
> **인증**: `auth_profile_id`로 OAuth2 프로필(google_adc 또는 oauth2_service_account)을 연결합니다.

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
      "sample_count": "{{params_sample_count}}"
    }
  },
  "timeout_ms": 60000
}
```

> `{{config_project_id}}`, `{{config_location}}`: provider_auth_profiles.config의 project_id, location이 주입됨.  
> `{{accessToken}}`: OAuth2로 발급한 토큰.  
> `params_negative_prompt`가 없으면 필드 생략.  
> **seed/sample_count 분기**: profile_key에 `lyria` 포함 시, options.seed 유무에 따라 런타임에서 body가 자동 분기됩니다 (위 prompt_templates body 참고).

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

## provider_auth_profiles
인증 프로필 (provider_auth_profiles 테이블)

> Vertex AI Lyria는 API Key가 아니라 **OAuth2** 인증이 필요합니다.  
> reductai는 **google_adc**(권장) 또는 **oauth2_service_account** 두 가지 방식을 지원합니다.

### 방식 1: google_adc (권장 — credential 없음)
로컬 개발: `gcloud auth application-default login` 실행 후 ADC 사용.  
GCP 배포: Workload Identity(서비스 계정 연결) 시 메타데이터 서버에서 자동 인증.

| 필드 | 값 | 비고 |
|------|-----|------|
| profile_key | `google_vertex_adc_v1` | 예시 (Veo와 동일 프로필 공유 가능) |
| auth_type | `google_adc` | credential 없이 config만 설정 |
| credential_id | **NULL** | google_adc는 credential 불필요 |
| config | 아래 JSON | project_id, location 필수 |

**config (google_adc)**:
```json
{
  "project_id": "YOUR_GCP_PROJECT_ID",
  "location": "us-central1"
}
```

### 방식 2: oauth2_service_account (서비스 계정 JSON)
조직 정책으로 JSON 키 발급이 가능한 환경에서 사용.

| 필드 | 값 | 비고 |
|------|-----|------|
| profile_key | `google_vertex_sa_v1` | 예시 |
| auth_type | `oauth2_service_account` | |
| credential_id | (provider_api_credentials.id) | 서비스 계정 JSON이 저장된 credential FK |
| config | 아래 JSON | scopes, token_url, project_id, location |

**config (oauth2_service_account)**:
```json
{
  "token_url": "https://oauth2.googleapis.com/token",
  "scopes": ["https://www.googleapis.com/auth/cloud-platform"],
  "project_id": "YOUR_GCP_PROJECT_ID",
  "location": "us-central1"
}
```

> **config 공통 필드**:  
> - `project_id`: GCP 프로젝트 ID. transport path의 `{{config_project_id}}`로 주입됨 (필수)  
> - `location`: 리전. `{{config_location}}`으로 주입 (기본: us-central1)

### credential (oauth2_service_account 전용)
`auth_type=oauth2_service_account`일 때만 `credential_id`로 참조하는 `provider_api_credentials` 레코드가 필요합니다.

| 필드 | 값 | 비고 |
|------|-----|------|
| credential_name | 예: `Vertex AI Service Account` | |
| api_key_encrypted | (암호화된 값) | **서비스 계정 JSON 전체** (private_key, client_email 등) |

### model_api_profiles 연결
`model_api_profiles` 생성 시 `auth_profile_id`에 위 `provider_auth_profiles.id`를 설정합니다.  
Veo와 Lyria는 **동일한 Vertex AI provider**를 사용하므로, **같은 ADC 프로필**을 공유할 수 있습니다.

> transport의 `Authorization` 헤더는 `{{accessToken}}`을 사용합니다.  
> - **google_adc**: `GoogleAuth.getApplicationDefault()`로 토큰 발급  
> - **oauth2_service_account**: JWT assertion으로 access_token 발급

> **추가 참고**: [ADC사용시설정방법.md](ADC사용시설정방법.md)에서 관리자 페이지별 설정 순서를 확인할 수 있습니다.

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

### ADC 사용 시 (권장 — credential 없음)
1. **ai_providers**: Vertex AI용 provider 생성 (api_base_url=`https://us-central1-aiplatform.googleapis.com/v1`)
2. **provider_auth_profiles**: `auth_type=google_adc`, config에 `project_id`, `location` 설정 (credential_id=NULL)
3. **response_schemas**: 음악 응답 스키마 생성 → ID 확보
4. **prompt_templates**: purpose=`music`, body에 `instances`, `parameters` 포함 → ID 확보
5. **ai_models**: model_type=`music`, response_schema_id, prompt_template_id 연결하여 생성
6. **model_api_profiles**: purpose=`music`, profile_key=`google_lyria_music_v1`, auth_profile_id 연결
7. **model_routing_rules**: (선택) music 타입 라우팅 규칙 추가

> **로컬**: `gcloud auth application-default login` 실행 후 위 설정 진행.  
> **GCP 배포**: Workload Identity로 서비스 계정 연결 시 별도 설정 없이 동작.

### oauth2_service_account 사용 시 (서비스 계정 JSON)
1. **ai_providers**: Vertex AI용 provider 생성
2. **provider_api_credentials**: 서비스 계정 JSON을 credential로 등록 (api_key_encrypted에 SA JSON 저장)
3. **provider_auth_profiles**: oauth2_service_account 프로필 생성 (credential_id, config 연결)
4. **response_schemas** ~ **model_routing_rules**: 위와 동일

---

## 런타임 동작
- **purpose=music** 요청 시 `chatRuntimeController`가 `model_api_profiles` 중 `purpose=music` 프로필을 선택
- 동기 요청 → 응답에서 `predictions[0].audioContent`, `predictions[0].mimeType` 추출 → `data_url` 생성
- 출력: `content.audio.{mime, data_url}`
- `musicUsage`: seconds(30), sample_rate(48000) 등으로 기록

---

## 주의사항
- **Vertex AI 전용**: Lyria는 Gemini API(generativelanguage.googleapis.com)와 다른 Vertex AI(aiplatform.googleapis.com) 엔드포인트를 사용합니다.
- **OAuth 필요**: API Key만으로는 호출 불가. **google_adc**(로컬: `gcloud auth application-default login` / GCP: Workload Identity) 또는 **oauth2_service_account**(서비스 계정 JSON) 필요.
- **project_id**: 모든 요청에 GCP 프로젝트 ID가 필요합니다. provider_auth_profiles.config에 설정하고 템플릿 변수 `{{config_project_id}}`로 주입됩니다.
- **프롬프트 언어**: API는 US English(en-us)만 지원합니다. reductai는 한국어/일본어/중국어 입력 시 **자동 번역** 후 Lyria에 전달합니다.
  - 1차: `GEMINI_API_KEY` 있으면 Gemini API (generativelanguage), 없으면 Vertex AI
  - 순서: gemini-2.0-flash-lite → gemini-2.5-flash-lite → gemini-2.5-flash
- **sample_count vs seed**: 둘 중 하나만 사용. 동시 사용 불가.
