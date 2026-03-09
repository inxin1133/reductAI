# Gemini 3.1 Flash Image Preview (Nano Banana 2)

> 이 문서는 reductai 시스템에 Gemini 3.1 Flash Image Preview (Nano Banana 2)를 등록할 때 참조하는 설정 스펙입니다.
> models_prompt_image.md 및 schema_models.sql 스키마를 기준으로 검토·조정되었습니다.
>
> **공식 문서**: [Gemini API](https://ai.google.dev/gemini-api/docs) · [Image generation](https://ai.google.dev/gemini-api/docs/image-generation) · [Imagen](https://ai.google.dev/gemini-api/docs/imagen) · [모델 목록](https://ai.google.dev/gemini-api/docs/models)
>
> **시스템 통합 안내**: 현재 image 모델은 OpenAI만 지원합니다. Gemini 이미지 연동 시 `chatRuntimeController` 및 `providerClients`에 `googleGenerateImage` 등 추가가 필요합니다.

---

## ai_providers
AI 제공업체 (Gemini 텍스트 모델과 동일 Google provider 공유)

| 필드 | 값 | 비고 |
|------|-----|------|
| provider_family | `google` | 라우팅/credential 매칭용. **필수** |
| name | `Google` | 표시용 |
| product_name | `Gemini` | 표시용 |
| slug | `google` | 기존 코드가 `google`로 라우팅 |
| api_base_url | `https://generativelanguage.googleapis.com/v1beta` | **base만** 저장 |
| website_url | `https://ai.google.dev` | |
| documentation_url | `https://ai.google.dev/gemini-api/docs` | |
| logo_key | `gemini` | UI 로고 매핑 (선택) |

---

## provider_api_credentials
API Key 인증 정보 (Gemini 텍스트 모델과 공유)

| 필드 | 값 | 비고 |
|------|-----|------|
| endpoint_url | `https://generativelanguage.googleapis.com/v1beta` | 커스텀 URL이 없으면 NULL |

> Gemini API는 `x-goog-api-key` 헤더로 인증합니다.

---



## response_schemas
출력 계약 (이미지 응답 형식 — models_prompt_image.md 및 GPT Image 1.5와 호환)

| 필드 | 비고 |
|------|------|
| name | 예: `llm_image_response` (GPT Image와 공유 가능) |
| strict | `true` |
| schema | 아래 JSON |

### schema
```json
{
  "type": "object",
  "required": ["images"],
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
    "images": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "url": { "type": "string" },
          "b64_json": { "type": "string" },
          "mime_type": { "type": "string" },
          "width": { "type": "integer" },
          "height": { "type": "integer" }
        },
        "anyOf": [
          { "required": ["url"] },
          { "required": ["b64_json"] }
        ]
      }
    }
  }
}
```

> Gemini API 응답 형식은 Imagen/GPT와 다를 수 있음. 통합 시 `data`/`images`/`generatedImages` 등에서 URL 또는 base64 추출 로직 필요.

---

## prompt_templates
프롬프트 템플릿 (이미지용 — `prompt` 필드 사용)

| 필드 | 비고 |
|------|------|
| name | 예: `gemini-3.1-flash-image-generate` |
| purpose | `image` | chat가 아님 |
| is_active | `true` |
| body | 아래 JSON |

> 이미지 모델은 `prompt` 단일 필드를 사용합니다. models_prompt_image.md 스타일 규칙을 Gemini에 맞게 적용합니다.

### body
```json
{
  "prompt": "{{userPrompt}}\n\nImage usage rule (very important):\n- If a reference image is provided, you MUST use it as the primary subject.\n- Apply a transformation to the provided image, not generate a new subject.\n- Preserve identity, proportions, and core structure of the original image unless explicitly told otherwise.\n\nGlobal style guide (always apply):\n- Clear, readable composition with a strong focal subject\n- Rich, high-quality visual detail (materials, textures, lighting)\n\nHard constraints (must follow):\n- No text, no letters, no numbers, no captions, no speech bubbles (unless specifically requested for design)\n- No logos, no watermarks, no signatures, no UI\n\nQuality targets:\n- Sharp, clean, high fidelity\n- Avoid blur, noise, artifacts, distorted anatomy"
}
```

> `{{userPrompt}}`는 런타임에서 사용자 입력으로 치환됩니다. Gemini 3.1 Flash Image는 텍스트 렌더링 정확도가 높아 인포그래픽/마케팅용 텍스트 포함 요청 시 유리합니다.

---

## ai_models
AI 모델 (이미지 타입)

| 필드 | 값 | 비고 |
|------|-----|------|
| name | `gemini-3.1-flash-image-preview` | 모델 이름 (Nano Banana 2) |
| model_id | `gemini-3.1-flash-image-preview` | API 모델 ID. [모델 목록](https://ai.google.dev/gemini-api/docs/models)에서 확인 |
| display_name | `Gemini 3.1 Flash Image` | 표시용 (Nano Banana 2) |
| model_type | `image` | **text가 아님** |
| context_window | `1048576` | 1M 토큰 (텍스트+이미지 입력) |
| max_input_tokens | `850000` | 입력 토큰 상한 |
| max_output_tokens | `65536` | 텍스트 출력 64K. 이미지 출력은 별도(4K 토큰 등가) |
| prompt_template_id | (prompt_templates.id) | 아래 prompt_templates 생성 후 FK |
| response_schema_id | (response_schemas.id) | 아래 response_schemas 생성 후 FK |
| capabilities | 아래 JSON | |
| is_available | `true` | |
| is_default | `false` | image 타입 기본 모델이 있으면 false |
| status | `active` | |
| sort_order | `0` | |

### capabilities
```json
{
  "model": "gemini-3.1-flash-image-preview",
  "limits": {
    "max_images_per_request": 4,
    "max_partial_images": 3
  },
  "options": {
    "n": {
      "max": 4,
      "min": 1,
      "type": "int",
      "label": "n",
      "description": "Number of images per request (sampleCount)"
    },
    "aspect_ratio": {
      "type": "enum",
      "label": "aspect_ratio",
      "values": ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "4:1", "1:4"],
      "description": "Aspect ratio. Gemini supports extreme ratios (4:1, 1:4)."
    },
    "resolution": {
      "type": "enum",
      "label": "resolution",
      "values": ["512", "1024", "2048", "4096", "auto"],
      "description": "Output resolution (512px to 4K). API 문서 확인 필요."
    }
  },
  "defaults": {
    "n": 1,
    "aspect_ratio": "auto",
    "resolution": "auto"
  },
  "supports": {
    "n": true,
    "aspect_ratio": true,
    "resolution": true,
    "reference_image": true
  },
  "validation_hints": [
    "Gemini 3.1 Flash Image: subject consistency (up to 5 characters, 14 objects), precision text rendering.",
    "Supports conversational editing, multi-image fusion.",
    "현재 시스템은 provider=openai만 image 지원. Google 연동 시 구현 필요."
  ], 
  "description": [    
    "정밀한 텍스트 렌더링",
    "대화형 편집 및 다중 이미지 융합 지원"
  ]
}
```

> **Nano Banana 2 특징**: Pro급 품질 + Flash 속도, 캐릭터 일관성(5명), 객체 정확도(14개), 512px~4K, 4:1/1:4 비율 지원. ([Image generation](https://ai.google.dev/gemini-api/docs/image-generation))

---

## API 엔드포인트
> Gemini 이미지 생성은 **Imagen API** 또는 **generateContent (이미지 출력)** 를 사용합니다. [Image generation](https://ai.google.dev/gemini-api/docs/image-generation) 문서 확인 필요.

### 예시 (Imagen 스타일)
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:predict
Headers: x-goog-api-key: {apiKey}
Content-Type: application/json

Body: {
  "instances": [{ "prompt": "..." }],
  "parameters": {
    "sampleCount": 1,
    "aspectRatio": "1:1"
  }
}
```

### 예시 (generateContent 이미지 출력)
> Gemini 2.0+ 이미지 생성은 `generateContent`로 텍스트+이미지 멀티모달 응답을 받을 수 있습니다. 최신 [Image generation](https://ai.google.dev/gemini-api/docs/image-generation) 가이드를 참고하세요.

---

## model_routing_rules
모델 라우팅 규칙 (선택)

| 필드 | 값 | 비고 |
|------|-----|------|
| conditions | 아래 JSON | image 타입 요청에 적용 |
| target_model_id | (ai_models.id) | Gemini 3.1 Flash Image 모델 ID |
| fallback_model_id | (선택) | 예: gpt-image-1.5 |
| priority | `0` | |

### conditions
```json
{
  "feature": "chat",
  "model_type": "image"
}
```

---

## 등록 순서 권장

1. **ai_providers**: Google provider가 없으면 생성 (Gemini 텍스트와 공유)
2. **provider_api_credentials**: API Key 등록 (공유)
3. **response_schemas**: 이미지 응답 스키마 생성 또는 GPT Image와 공유 → ID 확보
4. **prompt_templates**: purpose=`image`, body에 `prompt` 포함 → ID 확보
5. **ai_models**: model_type=`image`, response_schema_id, prompt_template_id 연결하여 생성
6. **model_routing_rules**: (선택) 라우팅 규칙 추가

---

## 시스템 연동 체크리스트 (미구현 시)
> Gemini 이미지 모델을 사용하려면 아래 작업이 필요합니다.

| 항목 | 상태 |
|------|------|
| providerClients에 `googleGenerateImage` 구현 | 미구현 |
| chatRuntimeController: `providerKey === "google"` && `mt === "image"` 분기 | 미구현 (현재 openai만) |
| model_api_profiles 또는 내장 경로로 Imagen/Gemini 이미지 API 호출 | 미구현 |
| 응답 파싱: `data`/`images`/`generatedImages` → url 또는 b64_json 추출 | 미구현 |

> model_id 및 API 엔드포인트는 [공식 문서](https://ai.google.dev/gemini-api/docs/image-generation)에서 최종 확인하세요.
