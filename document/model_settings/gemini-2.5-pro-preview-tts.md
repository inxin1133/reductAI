# Gemini 2.5 Pro TTS

> 이 문서는 reductai 시스템에 Gemini 2.5 Pro Preview TTS(텍스트→음성 모델)를 등록할 때 참조하는 설정 스펙입니다.
> schema_models.sql 스키마를 기준으로 검토·조정되었습니다.
>
> **공식 문서**: [Gemini API](https://ai.google.dev/gemini-api/docs) · [Text-to-speech (TTS)](https://ai.google.dev/gemini-api/docs/speech-generation) · [모델 목록](https://ai.google.dev/gemini-api/docs/models)

---

## 개요

Gemini 2.5 Pro Preview TTS (`gemini-2.5-pro-preview-tts`)는 Google의 **고품질 텍스트→음성** 모델로, **Gemini API**를 통해 제공됩니다.  
스튜디오급 오디오 품질과 자연스러운 억양으로, 장편 콘텐츠·전문 내레이션·복잡한 창작 워크플로에 적합합니다.

reductai는 음성 생성 시 `model_api_profiles(purpose=audio)`를 사용합니다.

> **API 방식**: `generateContent` 엔드포인트에 `responseModalities: ["AUDIO"]` 및 `speechConfig`를 설정합니다.  
> **인증**: Gemini API는 `x-goog-api-key` 헤더로 API Key 인증합니다. (Vertex AI와 별개)

---

## ai_providers
AI 제공업체 (Gemini 텍스트 모델과 동일 Google provider 공유)

| 필드 | 값 | 비고 |
|------|-----|------|
| provider_family | `google` | 라우팅/credential 매칭용. **필수** |
| name | `Google` | 표시용 |
| product_name | `Gemini` | 표시용 |
| slug | `google` | 기존 코드가 `google`로 라우팅 |
| api_base_url | `https://generativelanguage.googleapis.com/v1beta` | **base만** 저장. `:generateContent` path 제외 |
| website_url | `https://ai.google.dev` | |
| documentation_url | `https://ai.google.dev/gemini-api/docs` | |
| logo_key | `gemini` | UI 로고 매핑 (선택) |

---

## provider_api_credentials
API Key 인증 (Gemini 텍스트 모델과 공유)

| 필드 | 값 | 비고 |
|------|-----|------|
| endpoint_url | `https://generativelanguage.googleapis.com/v1beta` | 커스텀 URL이 없으면 NULL |
| api_key_encrypted | (암호화된 API Key) | [Google AI Studio](https://aistudio.google.com/)에서 발급 |

> Gemini API는 `x-goog-api-key` 헤더 또는 URL query `key=` 로 인증합니다.

---

## provider_auth_profiles
인증 프로필 (API Key 방식)

> Gemini API는 **API Key** 인증을 사용합니다.  
> model_api_profiles는 `auth_profile_id`로 provider_auth_profiles를 연결해야 합니다.

| 필드 | 값 | 비고 |
|------|-----|------|
| profile_key | `google_gemini_api_key_v1` | 예시 |
| auth_type | `api_key` | |
| credential_id | (provider_api_credentials.id) | Gemini API Key가 저장된 credential FK |
| config | `{}` 또는 빈 객체 | api_key는 config 불필요 |

> provider_api_credentials에 Gemini API Key를 등록한 후, provider_auth_profiles에서 credential_id로 연결합니다.

---

## response_schemas
출력 계약 (block_json 형식 — 오디오 포함)

| 필드 | 비고 |
|------|------|
| name | 예: `llm_audio_response` |
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
프롬프트 템플릿 (TTS용)

| 필드 | 비고 |
|------|------|
| name | 예: `gemini-2.5-pro-tts-generate` |
| purpose | `audio` | chat, image, music가 아님 |
| is_active | `true` |
| body | 아래 JSON |

> Gemini TTS는 `contents[0].parts[0].text`에 변환할 텍스트를 넣습니다.  
> 자연어로 스타일·억양·속도를 지시할 수 있습니다 (예: "Say cheerfully: ...").

### body
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "{{userPrompt}}" }]
    }
  ]
}
```

> `{{userPrompt}}`: 사용자 입력(변환할 텍스트). 스타일 지시 포함 가능 (예: "Say calmly in Korean: 안녕하세요").

---

## ai_models
AI 모델 (오디오/TTS 타입)

| 필드 | 값 | 비고 |
|------|-----|------|
| name | `gemini-2.5-pro-preview-tts` | reductai 모델 이름 |
| model_id | `gemini-2.5-pro-preview-tts` | API 모델 ID. [모델 목록](https://ai.google.dev/gemini-api/docs/models) 참고 |
| display_name | `Gemini 2.5 Pro TTS` | 표시용 |
| model_type | `audio` | **text, image, music, video가 아님** |
| context_window | `8192` | 입력 토큰 상한 |
| max_input_tokens | `8192` | |
| max_output_tokens | `16384` | 오디오 출력 토큰 상한 |
| prompt_template_id | (prompt_templates.id) | 아래 prompt_templates 생성 후 FK |
| response_schema_id | (response_schemas.id) | 아래 response_schemas 생성 후 FK |
| capabilities | 아래 JSON | |
| is_available | `true` | |
| is_default | `false` | audio 타입 기본 모델이 있으면 false |
| status | `active` | |
| sort_order | `0` | |

### capabilities
```json
{
  "model": "gemini-2.5-pro-preview-tts",
  "limits": {
    "max_input_tokens": 8192,
    "max_output_tokens": 16384
  },
  "options": {
    "voice": {
      "type": "string",
      "label": "voice",
      "description": "음성 이름. Kore, Callirrhoe 등. 공식 문서 참고"
    },
    "format": {
      "type": "enum",
      "label": "format",
      "values": ["mp3", "wav", "pcm", "ogg_opus"],
      "description": "출력 오디오 포맷"
    },
    "speed": {
      "type": "number",
      "label": "speed",
      "min": 0.25,
      "max": 4,
      "step": 0.25,
      "description": "재생 속도 배율"
    },
    "style_prompt": {
      "type": "string",
      "label": "style_prompt",
      "description": "자연어 스타일 지시 (예: Say cheerfully, in a calm tone)"
    }
  },
  "defaults": {
    "voice": "Callirrhoe",
    "format": "mp3",
    "speed": 1
  },
  "supports": {
    "voice": true,
    "format": true,
    "speed": true,
    "style_prompt": true
  },
  "validation_hints": [
    "프롬프트에 자연어로 스타일·억양·속도 지시를 포함할 수 있습니다.",
    "멀티 스피커(2명) 지원. Pro TTS는 고품질 스튜디오급 출력에 최적화."
  ]
}
```

> **기술 사양** ([공식 문서](https://ai.google.dev/gemini-api/docs/speech-generation)):  
> - 샘플레이트: 24kHz  
> - 포맷: LINEAR16(PCM), MP3, OGG_OPUS 등  
> - 음성: Kore, Callirrhoe 등 30+ 스피커, 80+ 로케일  
> - 멀티 스피커: 단일 요청에서 2명까지 정의 가능  

---

## model_api_profiles
> reductai는 음성 생성 시 **model_api_profiles(purpose=audio)** 를 사용합니다.  
> chatRuntimeController가 `provider_family=google` + `mt=audio`에서 **model_api_profile**이 있으면 `executeHttpJsonProfile`으로 호출합니다.  
> (내장 `openaiTextToSpeech`는 OpenAI 전용이므로, Gemini TTS는 반드시 model_api_profiles 필요)

### transport
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-tts:generateContent
Headers: 
  Content-Type: application/json
  x-goog-api-key: {apiKey}
```

```json
{
  "kind": "http_json",
  "method": "POST",
  "path": "/models/gemini-2.5-pro-preview-tts:generateContent",
  "headers": {
    "Content-Type": "application/json",
    "x-goog-api-key": "{{apiKey}}"
  },
  "body": {
    "contents": [
      {
        "role": "user",
        "parts": [{ "text": "{{userPrompt}}" }]
      }
    ],
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "speechConfig": {
        "voiceConfig": {
          "prebuiltVoiceConfig": {
            "voiceName": "{{params_voice}}"
          }
        }
      }
    }
  },
  "timeout_ms": 60000
}
```

> `{{apiKey}}`: provider_api_credentials에서 조회.  
> `{{userPrompt}}`: 사용자 입력(변환할 텍스트).  
> `{{params_voice}}`: capabilities.options.voice (기본: Callirrhoe).  
> `speechConfig`에 `outputAudioConfig`로 포맷(MP3 등)·샘플레이트 설정 가능. (공식 문서 참고)

### response_mapping
```json
{
  "result_type": "raw_json",
  "mode": "json_base64",
  "extract": {
    "audio_base64_path": "candidates[0].content.parts[0].inlineData.data",
    "mime_path": "candidates[0].content.parts[0].inlineData.mimeType"
  }
}
```

> **json_base64 모드**: 응답에서 base64 + mime을 추출하여 `data_url`로 변환합니다.  
> Gemini 응답 형식: `candidates[0].content.parts[0].inlineData`에 `data`(base64), `mimeType` 포함.

### workflow
```json
{}
```

> TTS는 **동기 API**이므로 async_job workflow 없음.

---

## model_routing_rules
모델 라우팅 규칙 (선택)

| 필드 | 값 | 비고 |
|------|-----|------|
| conditions | 아래 JSON | audio 타입 요청에 적용 |
| target_model_id | (ai_models.id) | Gemini 2.5 Pro TTS 모델 ID |
| fallback_model_id | (선택) | 예: gemini-2.5-flash-preview-tts |
| priority | `0` | |

### conditions
```json
{
  "feature": "chat",
  "model_type": "audio"
}
```

---

## 등록 순서 권장

1. **ai_providers**: Google provider가 없으면 생성 (Gemini 텍스트 모델과 공유)
2. **provider_api_credentials**: API Key 등록 (Gemini 텍스트 모델과 공유)
3. **response_schemas**: 오디오 응답 스키마 생성 → ID 확보
4. **prompt_templates**: purpose=`audio`, body에 `contents` 포함 → ID 확보
5. **ai_models**: model_type=`audio`, response_schema_id, prompt_template_id 연결하여 생성
6. **model_api_profiles**: purpose=`audio`, profile_key=`google_gemini_pro_tts_v1`, auth_profile_id 또는 credential 연동
7. **model_routing_rules**: (선택) audio 타입 라우팅 규칙 추가

---

## 런타임 동작
- **purpose=audio** 요청 시 `chatRuntimeController`가 `model_api_profiles` 중 `purpose=audio` 프로필을 선택
- `executeHttpJsonProfile`으로 Gemini `generateContent` 호출
- 응답에서 `candidates[0].content.parts[0].inlineData` 추출 → `data_url` 생성
- 출력: `content.audio.{mime, data_url}`
- `llm_audio_usages` 또는 `llm_usage_logs`에 audio cost 기록

---

## Pro TTS vs Flash TTS

| 항목 | Gemini 2.5 Pro TTS | Gemini 2.5 Flash TTS |
|------|---------------------|----------------------|
| model_id | `gemini-2.5-pro-preview-tts` | `gemini-2.5-flash-preview-tts` |
| 용도 | 고품질, 장편, 스튜디오급 | 저지연, 비용 효율, 일상용 |
| 멀티 스피커 | 지원 | 지원 |
| 지연 시간 | 상대적으로 높음 | 낮음 |
| 과금 | Pro 단가 | Flash 단가 (저렴) |

---

## 주의사항
- **Gemini API**: Vertex AI(aiplatform)가 아닌 **Gemini API**(generativelanguage.googleapis.com)를 사용합니다.
- **API Key**: Vertex AI OAuth가 아니라 **API Key**(x-goog-api-key) 인증입니다.
- **시스템 통합**: 현재 audio는 OpenAI만 내장 지원합니다. Gemini TTS 사용 시 **model_api_profiles**(purpose=audio)가 반드시 필요하며, 해당 프로필이 없으면 `audio is not supported for provider=google` 오류가 발생합니다.
