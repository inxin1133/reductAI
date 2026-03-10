# GPT Image 1.5

> 이 문서는 reductai 시스템에 GPT Image 1.5를 등록할 때 참조하는 설정 스펙입니다.
> models_prompt_image.md 및 schema_models.sql 스키마를 기준으로 검토·조정되었습니다.
>
> **공식 문서**: [Platform 문서](https://developers.openai.com/api/docs) · [모델 목록](https://platform.openai.com/api/docs/models) · [Image generation](https://platform.openai.com/api/docs/guides/image-generation) · [GPT Image 1.5](https://platform.openai.com/api/docs/models/gpt-image-1.5)

---

## ai_providers
AI 제공업체 (GPT 텍스트 모델과 동일 OpenAI 공유)

| 필드 | 값 | 비고 |
|------|-----|------|
| provider_family | `openai` | 라우팅/credential 매칭용. **필수** |
| name | `OpenAI` | 표시용 |
| product_name | `ChatGPT` | 표시용 |
| slug | `openai` | 기존 코드가 `openai`로 하드코딩 |
| api_base_url | `https://api.openai.com/v1` | **base만** 저장 |
| website_url | `https://openai.com` | |
| documentation_url | `https://developers.openai.com/api/docs` | |
| logo_key | `chatgpt` | UI 로고 매핑 (선택) |

---

## provider_api_credentials
API Key 인증 정보 (OpenAI 공유)

| 필드 | 값 | 비고 |
|------|-----|------|
| endpoint_url | `https://api.openai.com/v1` | 커스텀 URL이 없으면 NULL |

---

## response_schemas
출력 계약 (이미지 응답 형식)

| 필드 | 비고 |
|------|------|
| name | 예: `llm_image_response` |
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

> API 응답은 `data` 또는 `images` 배열. 각 항목은 `url` 또는 `b64_json` 포함. 런타임에서 block_json 형태로 변환하여 반환합니다.

---

## prompt_templates
프롬프트 템플릿 (이미지용 — `prompt` 필드 사용)

| 필드 | 비고 |
|------|------|
| name | 예: `gpt-image-1.5-generate` |
| purpose | `image` | chat가 아님 |
| is_active | `true` |
| body | 아래 JSON |

> 이미지 모델은 `messages`가 아니라 `prompt` 단일 필드를 사용합니다.  
> 런타임에서 `promptFromTemplate || prompt` (user 입력)로 적용됩니다.

### body
```json
{
  "prompt": "{{userPrompt}}\n\nImage usage rule (very important):\n- If a reference image is provided, you MUST use it as the primary subject.\n- Apply a transformation to the provided image, not generate a new subject.\n- Preserve identity, proportions, and core structure of the original image unless explicitly told otherwise.\n\nGlobal style guide (always apply):\n- Clear, readable composition with a strong focal subject\n- Rich, high-quality visual detail (materials, textures, lighting)\n\nHard constraints (must follow):\n- No text, no letters, no numbers, no captions, no speech bubbles\n- No logos, no watermarks, no signatures, no UI\n\nQuality targets:\n- Sharp, clean, high fidelity\n- Avoid blur, noise, artifacts, distorted anatomy"
}
```

> `{{userPrompt}}`는 런타임에서 사용자 입력으로 치환됩니다. ([models_prompt_image.md](document/models_prompt/models_prompt_image.md))

---

## ai_models
AI 모델 (이미지 타입)

| 필드 | 값 | 비고 |
|------|-----|------|
| name | `gpt-image-1.5` | 모델 이름 |
| model_id | `gpt-image-1.5` | API 모델 ID. [모델 목록](https://platform.openai.com/api/docs/models/gpt-image-1.5)에서 확인 |
| display_name | `GPT Image 1.5` | 표시용 |
| model_type | `image` | **text가 아님** |
| context_window | NULL | 이미지 모델은 해당 없음 |
| max_input_tokens | NULL | 이미지 모델은 해당 없음 |
| max_output_tokens | NULL | 이미지 모델은 해당 없음 |
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
  "model": "gpt-image-1.5",
  "limits": {
    "max_images_per_request": 10,
    "max_partial_images": 3
  },
  "options": {
    "n": {
      "max": 10,
      "min": 1,
      "type": "int",
      "label": "n",
      "description": "Number of images per request"
    },
    "size": {
      "type": "enum",
      "label": "size",
      "values": ["auto", "1024x1024", "1536x1024", "1024x1536"],
      "description": "Image size (GPT Image models). Image edit supports size only."
    },
    "quality": {
      "type": "enum",
      "label": "quality",
      "values": ["auto", "high", "medium", "low"],
      "description": "Image quality (GPT Image models)"
    },
    "background": {
      "type": "enum",
      "label": "background",
      "values": ["auto", "transparent", "opaque"],
      "description": "Background mode (transparent requires png/webp)"
    },
    "input_fidelity": {
      "type": "enum",
      "label": "input_fidelity",
      "values": ["high", "low"],
      "description": "Image edit only. Preserve input image features (faces, logos). 'high' for better fidelity."
    }
  },
  "defaults": {
    "n": 1,
    "size": "auto",
    "quality": "auto",
    "background": "auto",
    "input_fidelity": "low"
  },
  "supports": {
    "n": true,
    "size": true,
    "quality": true,
    "background": true,
    "input_fidelity": true
  },
  "validation_hints": [
    "Image edit (with reference image) currently applies size only; quality/background are ignored.",
    "input_fidelity is supported for gpt-image-1.5 (not gpt-image-1-mini)."
  ]
}
```

> **이미지 생성 vs 편집**: 생성 시 `n`, `size`, `quality`, `style`, `background` 사용. 편집(참조 이미지 첨부) 시 `n`, `size`만 사용. ([Image generation](https://platform.openai.com/api/docs/guides/image-generation))

---


## API 엔드포인트
> 이미지 모델은 Responses API가 아니라 **Images API**를 사용합니다. 
> 프로그램 소스에 코딩된 내용을 사용합니다.

### 이미지 생성 (텍스트 → 이미지)
```
POST https://api.openai.com/v1/images/generations
Headers: Authorization: Bearer {apiKey}
Content-Type: application/json

Body: {
  "model": "gpt-image-1.5",
  "prompt": "...",
  "n": 1,
  "size": "1024x1024",
  "quality": "high",
  "response_format": "url",
  "style": "vivid",
  "background": "opaque"
}
```

### 이미지 편집 (참조 이미지 + 프롬프트)
```
POST https://api.openai.com/v1/images/edits
Headers: Authorization: Bearer {apiKey}
Content-Type: multipart/form-data

Body: model, prompt, image (file), n, size
```
> 편집 시 `quality`, `background`는 무시됨. `size`만 적용.

---

## model_routing_rules
모델 라우팅 규칙 (선택)

| 필드 | 값 | 비고 |
|------|-----|------|
| conditions | 아래 JSON | image 타입 요청에 적용 |
| target_model_id | (ai_models.id) | GPT Image 1.5 모델 ID |
| fallback_model_id | (선택) | 예: gpt-image-1-mini |
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

1. **ai_providers**: OpenAI provider가 없으면 생성 (텍스트 모델과 공유)
2. **provider_api_credentials**: API Key 등록 (공유)
3. **response_schemas**: 이미지 응답 스키마 생성 → ID 확보
4. **prompt_templates**: purpose=`image`, body에 `prompt` 포함 → ID 확보
5. **ai_models**: model_type=`image`, response_schema_id, prompt_template_id 연결하여 생성
6. **model_routing_rules**: (선택) 라우팅 규칙 추가

---

## 런타임 동작
- **참조 이미지 없음**: `openaiGenerateImage` → `POST /images/generations` (n, size, quality, style, background)
- **참조 이미지 있음**: `openaiEditImage` → `POST /images/edits` (n, size만. quality/background 무시)
- 현재 `input_fidelity`는 providerClients에 전달되지 않음. 편집 시 facial/identity 보존 강화가 필요하면 providerClients 수정 필요.
