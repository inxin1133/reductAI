# GPT-5.2

> 이 문서는 reductai 시스템에 GPT-5.2를 등록할 때 참조하는 설정 스펙입니다.
> models_prompt_text(chat).md 상단 권장값과 schema_models.sql 스키마를 기준으로 검토·조정되었습니다.
>
> **공식 문서**: [Platform 문서](https://developers.openai.com/api/docs) · [모델 목록](https://platform.openai.com/api/docs/models) · [Responses API](https://platform.openai.com/api/docs/guides/migrate-to-responses) · [Structured outputs](https://platform.openai.com/api/docs/guides/structured-outputs) · [Prompt caching](https://platform.openai.com/api/docs/guides/prompt-caching)

---

## ai_providers
AI 제공업체

| 필드 | 값 | 비고 |
|------|-----|------|
| provider_family | `openai` | 라우팅/credential 매칭용. **필수** (기본: slug 첫 토큰) |
| name | `OpenAI` | 표시용 |
| product_name | `ChatGPT` | 표시용 |
| slug | `openai` | **권장**: 기존 코드(timelineController, chatController 등)가 `openai`로 하드코딩. `openai-chatgpt`도 동작(provider_family 자동 추론) |
| api_base_url | `https://api.openai.com/v1` | **base만** 저장. `/chat/completions`, `/responses` 등 path는 제외 |
| website_url | `https://openai.com` | |
| documentation_url | `https://developers.openai.com/api/docs` | |
| logo_key | `chatgpt` | UI 로고 매핑 (선택) |


---

## provider_api_credentials
API Key 인증 정보

| 필드 | 값 | 비고 |
|------|-----|------|
| endpoint_url | `https://api.openai.com/v1` | 커스텀 URL이 없으면 NULL (provider 기본 사용) |

---

## response_schemas
출력 계약 (block_json 형식)

| 필드 | 비고 |
|------|------|
| name | 예: `llm_block_response` |
| strict | `true` |
| schema | 아래 JSON |

### schema
```json
{
  "type": "object",
  "required": ["title", "summary", "blocks"],
  "properties": {
    "title": {
      "type": "string",
      "minLength": 4,
      "description": "A concise and descriptive title for the document."
    },
    "summary": {
      "type": "string",
      "minLength": 40,
      "description": "A high-level summary of the document content."
    },
    "blocks": {
      "type": "array",
      "minItems": 3,
      "description": "An ordered list of content blocks composing the document.",
      "items": {
        "oneOf": [
          {
            "type": "object",
            "required": ["type", "markdown"],
            "properties": {
              "type": { "const": "markdown" },
              "markdown": {
                "type": "string",
                "minLength": 20,
                "description": "Markdown-formatted content block."
              }
            },
            "additionalProperties": false
          },
          {
            "type": "object",
            "required": ["type", "language", "code"],
            "properties": {
              "type": { "const": "code" },
              "language": { "type": "string" },
              "code": {
                "type": "string",
                "minLength": 20,
                "description": "Source code content."
              }
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
                },
                "description": "Table row data."
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

---

## prompt_templates
프롬프트 템플릿

| 필드 | 비고 |
|------|------|
| name | 예: `gpt-5.2-chat-block-json` |
| purpose | `chat` |
| is_active | `true` |
| body | 아래 JSON |

> 웹 서치 정책은 코드에서 적용됩니다. `web_search_config`는 템플릿에 넣지 않습니다.  
> **Responses API**: template의 `messages`(system/developer/user)는 런타임에서 `instructions`(system+developer) + `input`(user)로 변환됩니다. ([Migrate to Responses](https://platform.openai.com/api/docs/guides/migrate-to-responses))

### body
```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant. Your primary responsibility is to output a single JSON value that matches the provided JSON Schema. Follow the schema strictly, and produce clear, well-structured, reader-friendly content within those constraints. Output JSON only (no markdown fences, no commentary)."
    },
    {
      "role": "developer",
      "content": "Write like ChatGPT: structured, practical, and easy to scan.\n\nTHINKING STYLE (do this silently):\n- Identify the user's real goal (what they want to understand or decide).\n- Decide whether the question requires a brief answer or a structured explanation.\n- Put the most useful insight first.\n- Use structure only when it improves understanding.\n\nOUTPUT QUALITY RULES:\n- Be specific and actionable.\n- Use short sentences.\n- Avoid filler and repetition.\n- When introducing a concept, include a brief definition and one concrete example (if helpful).\n\nSTRUCTURE GUIDANCE (match the schema, use judgment):\n- Always include: title and summary.\n- For simple questions, keep the response concise and use the minimum number of blocks.\n- For complex topics, use multiple blocks to improve clarity.\n- Use markdown blocks for explanations and steps.\n- Use a table block only when a checklist or comparison clearly improves understanding.\n- Use a code block only when a concrete example meaningfully helps the answer.\n\nVISUAL SEPARATION RULES (IMPORTANT):\n- Clearly separate major sections of the response using horizontal dividers.\n- Use a divider between logical sections (e.g., summary, steps, tables, next actions).\n- Prefer Markdown horizontal rules (---) for section separation.\n- Do NOT overuse dividers inside tables or code blocks.\n\nFORMATTING RULES:\n- Markdown blocks must include headings (e.g., '## ...').\n- Tables should be compact (3–7 rows) when used.\n- Code must be copyable and runnable when used.\n\nTONE & EMOJIS:\n- Friendly, confident, and concise.\n- Use emojis appropriately (like ChatGPT) to improve scanning.\n- Do NOT use emojis in code blocks or tables.\n\nWEB SEARCH POLICY:\n- Use web search ONLY when required for recency, prices, exact figures, legal/regulatory text, schedules, or current events.\n- Do NOT search if general knowledge is sufficient.\n\nEVIDENCE RULES:\n- If web search was used, include a brief \"Sources\" section in a markdown block.\n- If no web search was used, do not include a \"Sources\" section.\n\nRELIABILITY RULES:\n- Do not fabricate citations or claim to have searched if you did not."
    },
    {
      "role": "user",
      "content": "{{input}}"
    }
  ]
}
```

---

## ai_models
AI 모델 (필수 필드 포함)

| 필드 | 값 | 비고 |
|------|-----|------|
| name | `gpt-5.2` | 모델 이름 |
| model_id | `gpt-5.2` | API 모델 ID. [모델 목록](https://platform.openai.com/api/docs/models)에서 확인 (예: gpt-5.4, gpt-5.2 등) |
| display_name | `GPT-5.2` | 표시용 |
| model_type | `text` | |
| context_window | `400000` | models_prompt_text(chat).md 권장 |
| max_input_tokens | `300000` | models_prompt_text(chat).md 권장 |
| max_output_tokens | `100000` | models_prompt_text(chat).md 권장 |
| prompt_template_id | (prompt_templates.id) | 아래 prompt_templates 생성 후 FK |
| response_schema_id | (response_schemas.id) | 아래 response_schemas 생성 후 FK |
| capabilities | 아래 JSON | |
| is_available | `true` | |
| is_default | `false` | text 타입 기본 모델이 있으면 false |
| status | `active` | |
| sort_order | `0` | 드래그 정렬 시 자동 조정 |

### capabilities
```json
{
  "model": "gpt-5.2",
  "options": {
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
    "top_p": 1,
    "temperature": 0.35
  },
  "supports": {
    "top_p": true,
    "json_schema": true,
    "system_role": true,
    "temperature": true,
    "developer_role": true,
    "structured_outputs": true
  },
  "prompt_caching": true
}
```

> **temperature vs top_p**: 공식 권장—둘 중 하나만 조정 (동시 조정 비권장).  
> **prompt_caching**: 1024 토큰 이상 시 자동 적용. gpt-5 계열은 `prompt_cache_retention: "24h"` 지원 ([Prompt caching](https://platform.openai.com/api/docs/guides/prompt-caching)).

---

## model_api_profiles
> **참고**: GPT-5.2는 [Responses API](https://platform.openai.com/api/docs/guides/migrate-to-responses) `POST /v1/responses`를 사용합니다.  
> `provider_family=openai` 이고 profile_key가 `openai.responses*`로 시작하면, 채팅 런타임은 **내장 provider client**를 사용하고 model_api_profiles를 사용하지 않습니다.  
> 아래 프로필은 커스텀 경로 사용 시 참고용입니다.

### transport
```
POST https://api.openai.com/v1/responses
Headers: Authorization: Bearer {apiKey}
```
```json
{
  "kind": "http_json",
  "method": "POST",
  "path": "/responses",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{apiKey}}"
  },
  "body": {
    "model": "{{model}}",
    "input": "{{input}}",
    "top_p": "{{params_top_p}}",
    "temperature": "{{params_temperature}}",
    "max_output_tokens": "{{maxTokens}}",
    "text": {
      "format": {
        "name": "{{response_schema_name}}",
        "type": "json_schema",
        "schema": "{{response_schema_json}}",
        "strict": "{{response_schema_strict}}"
      }
    }
  },
  "timeout_ms": 60000
}
```

> `{{response_schema_name}}`, `{{response_schema_json}}`, `{{response_schema_strict}}`는 ai_models.response_schema_id에서 로드된 스키마로 채워집니다.  
> model_api_profiles 경로 사용 시, executeHttpJsonProfile에 이 변수들이 전달되어야 하므로, 해당 경로가 구현된 경우에만 정상 동작합니다.

### response_mapping
```json
{
  "result_type": "text",
  "extract": {
    "text_path": "output[0].content[0].text"
  }
}
```

### workflow
```json
{}
```

---

## model_routing_rules
모델 라우팅 규칙 (선택)

| 필드 | 값 | 비고 |
|------|-----|------|
| conditions | 아래 JSON | 채팅 + text 타입 요청에 적용 |
| target_model_id | (ai_models.id) | GPT-5.2 모델 ID |
| fallback_model_id | (선택) | 예: gpt-5-mini |
| priority | `0` | 다른 규칙과 겹치면 높은 값 우선 |

### conditions
```json
{
  "feature": "chat",
  "max_tokens": {
    "$gt": 16384
  },
  "model_type": "text"
}
```

---

## 등록 순서 권장

1. **ai_providers**: OpenAI provider가 없으면 생성
2. **provider_api_credentials**: API Key 등록
3. **response_schemas**: 스키마 생성 → ID 확보
4. **prompt_templates**: 프롬프트 생성 → ID 확보
5. **ai_models**: response_schema_id, prompt_template_id 연결하여 생성
6. **model_routing_rules**: (선택) 라우팅 규칙 추가
7. **model_api_profiles**: (선택) 커스텀 호출 경로 사용 시에만
