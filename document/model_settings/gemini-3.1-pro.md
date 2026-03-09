# Gemini 3.1 Pro

> 이 문서는 reductai 시스템에 Gemini 3.1 Pro를 등록할 때 참조하는 설정 스펙입니다.
> **Gemini 3 Pro 대체 모델** — Gemini 3 Pro가 종료되므로 Gemini 3.1 Pro(gemini-3.1-pro-preview) 사용을 권장합니다.
> models_prompt_text(chat).md 상단 권장값과 schema_models.sql 스키마를 기준으로 검토·조정되었습니다.
>
> **공식 문서**: [Gemini API](https://ai.google.dev/gemini-api/docs) · [모델 목록](https://ai.google.dev/gemini-api/docs/models) · [generateContent](https://ai.google.dev/api/generate-content) · [Structured output](https://ai.google.dev/gemini-api/docs/structured-output)

---

## ai_providers
AI 제공업체 (Gemini 3 Pro와 동일 Google provider 공유)

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
API Key 인증 정보 (Gemini 3 Pro와 공유)

| 필드 | 값 | 비고 |
|------|-----|------|
| endpoint_url | `https://generativelanguage.googleapis.com/v1beta` | 커스텀 URL이 없으면 NULL |

> Gemini API는 `x-goog-api-key` 헤더 또는 URL query `key=` 로 인증합니다.

---



## response_schemas
출력 계약 (block_json 형식 — Gemini 3 Pro와 동일)

| 필드 | 비고 |
|------|------|
| name | 예: `llm_block_response` (Pro와 공유 가능) |
| strict | `true` |
| schema | 아래 JSON |

### schema
```json
{
  "type": "object",
  "required": ["title", "summary", "blocks"],
  "properties": {
    "title": { "type": "string", "minLength": 4 },
    "summary": { "type": "string", "minLength": 40 },
    "blocks": {
      "type": "array",
      "minItems": 3,
      "items": {
        "oneOf": [
          {
            "type": "object",
            "required": ["type", "markdown"],
            "properties": {
              "type": { "const": "markdown" },
              "markdown": { "type": "string", "minLength": 40 }
            },
            "additionalProperties": false
          },
          {
            "type": "object",
            "required": ["type", "language", "code"],
            "properties": {
              "type": { "const": "code" },
              "language": { "type": "string" },
              "code": { "type": "string", "minLength": 20 }
            },
            "additionalProperties": false
          },
          {
            "type": "object",
            "required": ["type", "headers", "rows"],
            "properties": {
              "type": { "const": "table" },
              "headers": {
                "type": "array",
                "minItems": 2,
                "maxItems": 6,
                "items": { "type": "string" }
              },
              "rows": {
                "type": "array",
                "minItems": 4,
                "items": {
                  "type": "array",
                  "minItems": 2,
                  "maxItems": 6,
                  "items": { "type": "string" }
                }
              }
            },
            "additionalProperties": false
          }
        ]
      }
    }
  },
  "additionalProperties": false
}
```

> markdown 블록은 `markdown` 필드, code 블록은 `code` 필드 사용 (content 아님).

---

## prompt_templates
프롬프트 템플릿 (Gemini용 systemInstruction 형식)

| 필드 | 비고 |
|------|------|
| name | 예: `gemini-3.1-pro-chat-block-json` |
| purpose | `chat` |
| is_active | `true` |
| body | 아래 JSON |

> Gemini API는 `messages` 형식이 아니라 `systemInstruction` + `contents`를 사용합니다.  
> 웹 검색 시 `[웹 검색 결과]` 섹션이 user input 앞에 코드에서 주입됩니다.

### body
```json
{
  "systemInstruction": {
    "role": "system",
    "parts": [
      {
        "text": "You are a guide to providing Gemini-style answers. You are a professional, empathetic, and insightful AI thought partner. Your goal is to provide high-quality responses that are both intellectually honest and easy to digest. Adhere to the following principles:\n\n1. **Scannability & Structure:** Avoid dense walls of text. Use a clear hierarchy with Markdown headings (##, ###), bullet points, and numbered lists to organize information.\n2. **Visual & Formatting Elements:** Use appropriate emojis to add warmth. Use **bolding** to highlight key terms and guide the user's eye. Use Tables to compare data or summarize complex information whenever effective.\n3. **Logical Reasoning:** For complex queries, use a 'step-by-step' approach. Break down your thinking process to ensure clarity and accuracy.\n4. **Conciseness:** Be direct and impactful. Avoid fillers, unnecessary repetition, or overly flowery language.\n5. **Technical Precision:** Always use Markdown code blocks for code snippets. Ensure technical terms and formulas are used accurately.\n6. **Interactive Closing:** Conclude every response with a single, high-value next step or a thought-provoking follow-up question to keep the conversation productive.\n\nWEB SEARCH RESULTS (server-injected):\n- When the user message includes a [웹 검색 결과] section, it contains pre-fetched search results. You MUST use that information to answer. Do NOT ignore it.\n- The [시간 참고] block provides the current date/time. Use it to interpret relative dates (\"오늘\", \"today\", \"최근\", etc.) correctly.\n\nEVIDENCE RULES:\n- When [웹 검색 결과] is present, include a \"Sources\" section in a markdown block with cited links (title + URL as bullet points).\n- Format: domain / date (if available) / key evidence (one line). Summarize in your own words; do not paste raw snippets.\n- If no [웹 검색 결과] section was provided, do not include a Sources section.\n\nRELIABILITY RULES:\n- Do not fabricate citations or claim to have used web results if none were provided.\n- If the web results are insufficient or conflicting, say so briefly and proceed with best-effort guidance.\n\nOUTPUT FORMAT REQUIREMENT:\n- Output must be a single JSON object that matches the provided JSON Schema.\n- For markdown blocks, use the field name \"markdown\" (NOT \"content\").\n- For code blocks, use the field name \"code\"."
      }
    ]
  }
}
```

> 채팅 런타임은 templateBody를 `googleSimulateChat`에 전달하고, baseBody의 `contents`(user input)와 merge합니다.  
> `{{input}}` 변수는 런타임에서 `contents[0].parts[0].text`로 주입됩니다.  
> **구조화 출력**: 현재 `googleSimulateChat`은 `responseSchema`를 주입하지 않습니다. JSON 형식은 systemInstruction 프롬프트로 유도합니다. 공식 [Structured output](https://ai.google.dev/gemini-api/docs/structured-output)을 활용하려면 templateBody에 `generationConfig.responseMimeType: "application/json"` 및 `responseSchema`를 포함하거나, providerClients 수정이 필요합니다.

---


## ai_models
AI 모델 (필수 필드 포함)

| 필드 | 값 | 비고 |
|------|-----|------|
| name | `gemini-3.1-pro-preview` | 모델 이름 |
| model_id | `gemini-3.1-pro-preview` | API 모델 ID. [모델 목록](https://ai.google.dev/gemini-api/docs/models)에서 확인 |
| display_name | `Gemini 3.1 Pro` | 표시용 |
| model_type | `text` | |
| context_window | `1048576` | 1M 토큰 (Gemini 3 Pro와 동일) |
| max_input_tokens | `850000` | Gemini 3 Pro와 동일 권장 |
| max_output_tokens | `65536` | 64K. 기본 8192 — `maxOutputTokens` 명시 필요 |
| prompt_template_id | (prompt_templates.id) | 아래 prompt_templates 생성 후 FK |
| response_schema_id | (response_schemas.id) | 아래 response_schemas 생성 후 FK |
| capabilities | 아래 JSON | |
| is_available | `true` | |
| is_default | `false` | |
| status | `active` | |
| sort_order | `0` | |

### capabilities
```json
{
  "model": "gemini-3.1-pro-preview",
  "options": {
    "top_k": {
      "max": 100,
      "min": 1,
      "type": "int",
      "label": "top_k",
      "description": "샘플링 후보 수"
    },
    "top_p": {
      "max": 1,
      "min": 0,
      "step": 0.05,
      "type": "number",
      "label": "top_p",
      "description": "샘플링 누적 확률"
    },
    "temperature": {
      "max": 2,
      "min": 0,
      "step": 0.1,
      "type": "number",
      "label": "temperature",
      "description": "창의성/랜덤성"
    }
  },
  "defaults": {
    "top_k": 40,
    "top_p": 1,
    "temperature": 0.2
  },
  "supports": {
    "top_k": true,
    "top_p": true,
    "temperature": true,
    "json_schema": true,
    "system_role": true,
    "structured_outputs": true
  }
}
```

> Gemini는 `developer_role`을 별도 지원하지 않습니다. `systemInstruction` 하나로 통합합니다.  
> `prompt_caching`은 [Caching API](https://ai.google.dev/api/caching)로 지원되나, capabilities에는 생략 가능합니다.  
> **temperature vs topP**: 공식 권장—둘 중 하나만 조정 (동시 조정 비권장).

---

## model_api_profiles
> **참고**: `provider_family=google`이면 채팅 런타임은 **내장 `googleSimulateChat`**을 사용합니다.  
> model_api_profiles는 사용하지 않습니다. 아래는 [generateContent API](https://ai.google.dev/api/generate-content) 구조 참고용입니다.

### Gemini 3.1 Pro generateContent 요청 구조
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent
Headers: 
  Content-Type: application/json
  x-goog-api-key: {apiKey}

Body: {
  "systemInstruction": { "parts": [{ "text": "..." }] },
  "contents": [{ "role": "user", "parts": [{ "text": "{{input}}" }] }],
  "generationConfig": {
    "maxOutputTokens": 65536,
    "temperature": 0.2,
    "topP": 1,
    "topK": 40,
    "responseMimeType": "application/json",
    "responseSchema": { "type": "object", "properties": {...} }
  }
}
```
> **중요**: 기본 `maxOutputTokens`는 8192입니다. 64K 출력을 쓰려면 반드시 `maxOutputTokens: 65536`을 명시하세요.  
> systemInstruction의 `parts`는 text만 지원. [GenerationConfig](https://cloud.google.com/vertex-ai/docs/reference/rest/v1/GenerationConfig) 참고.

### response_mapping (참고)
```json
{
  "result_type": "text",
  "extract": {
    "text_path": "candidates[0].content.parts[0].text"
  }
}
```

---

## model_routing_rules
모델 라우팅 규칙 (선택)

| 필드 | 값 | 비고 |
|------|-----|------|
| conditions | 아래 JSON | 채팅 + text 타입 요청에 적용 |
| target_model_id | (ai_models.id) | Gemini 3.1 Pro 모델 ID |
| fallback_model_id | (선택) | 예: gemini-3-flash |
| priority | `0` | |

### conditions
```json
{
  "feature": "chat",
  "model_type": "text"
}
```

---

## 등록 순서 권장

1. **ai_providers**: Google provider가 없으면 생성 (Gemini 3 Pro와 공유)
2. **provider_api_credentials**: API Key 등록 (Gemini 3 Pro와 공유)
3. **response_schemas**: block_json 스키마 생성 또는 Pro와 공유 → ID 확보
4. **prompt_templates**: systemInstruction 형식 프롬프트 생성 (3.1 Pro 전용 또는 Pro와 공유)
5. **ai_models**: response_schema_id, prompt_template_id 연결하여 생성
6. **model_routing_rules**: (선택) 라우팅 규칙 추가

---

## Gemini 3 Pro → 3.1 Pro 마이그레이션

| 항목 | Gemini 3 Pro | Gemini 3.1 Pro |
|------|--------------|----------------|
| model_id | gemini-3-pro (종료) | **gemini-3.1-pro-preview** |
| display_name | Gemini 3 Pro | Gemini 3.1 Pro |
| max_output_tokens | 65536 | 65536 (동일, 명시 필요) |
| 기본 maxOutputTokens | — | 8192 (API 기본값) |

> 기존 Gemini 3 Pro 사용 중이면 `model_id`를 `gemini-3.1-pro-preview`로 변경하고, `maxOutputTokens`를 65536으로 명시하세요.
