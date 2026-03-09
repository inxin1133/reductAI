# Claude Haiku 4.5

> 이 문서는 reductai 시스템에 Claude Haiku 4.5를 등록할 때 참조하는 설정 스펙입니다.
> models_prompt_text(chat).md 상단 권장값과 schema_models.sql 스키마를 기준으로 검토·조정되었습니다.
>
> **공식 문서**: [Platform 문서](https://platform.claude.com/docs) · [Messages API](https://platform.claude.com/docs/api/messages) · [모델 목록](https://platform.claude.com/docs/models-overview) · [Structured outputs](https://platform.claude.com/docs/build-with-claude/structured-outputs) · [Prompt caching](https://platform.claude.com/docs/build-with-claude/prompt-caching) · [Extended thinking](https://platform.claude.com/docs/build-with-claude/extended-thinking)

---

## ai_providers
AI 제공업체

| 필드 | 값 | 비고 |
|------|-----|------|
| provider_family | `anthropic` | 라우팅/credential 매칭용. **필수** |
| name | `Anthropic` | 표시용 |
| product_name | `Claude` | 표시용 |
| slug | `anthropic` | 기존 코드(chatRuntimeController 등)가 `anthropic`로 라우팅 |
| api_base_url | `https://api.anthropic.com/v1` | **base만** 저장. `/messages` path 제외 |
| website_url | `https://anthropic.com` | |
| documentation_url | `https://platform.claude.com/docs` | |
| logo_key | `claude` | UI 로고 매핑 (선택) |


---

## provider_api_credentials
API Key 인증 정보

| 필드 | 값 | 비고 |
|------|-----|------|
| endpoint_url | `https://api.anthropic.com/v1` | 커스텀 URL이 없으면 NULL (provider 기본 사용) |

> Anthropic API는 `x-api-key` 헤더와 `anthropic-version: 2023-06-01` 헤더로 인증합니다.


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

> Claude Structured outputs는 `output_config.format.type: "json_schema"`와 `output_config.format.schema`를 사용합니다. reductai `anthropicSimulateChat`에 `output_config` 주입이 구현되면 block_json이 적용됩니다.


---

## prompt_templates
프롬프트 템플릿

| 필드 | 비고 |
|------|------|
| name | 예: `claude-haiku-4-5-chat-block-json` |
| purpose | `chat` |
| is_active | `true` |
| body | 아래 JSON |

> **Claude Messages API**는 OpenAI와 달리 `system`을 최상위 필드로 사용합니다. `messages`는 base body에서 `[{ role: "user", content: input }]`로 주입되므로, 템플릿에는 `system`만 정의합니다.  
> 웹 서치 정책은 코드에서 적용됩니다.

### body
```json
{
  "system": "You are Claude Haiku, a fast and capable assistant. Your primary responsibility is to output a single JSON value that matches the provided JSON Schema. Follow the schema strictly, and produce clear, well-structured, reader-friendly content within those constraints. Output JSON only (no markdown fences, no commentary).\n\nWrite like Claude: structured, practical, and easy to scan.\n\nTHINKING STYLE (do this silently):\n- Identify the user's real goal (what they want to understand or decide).\n- Decide whether the question requires a brief answer or a structured explanation.\n- Put the most useful insight first.\n- Use structure only when it improves understanding.\n\nOUTPUT QUALITY RULES:\n- Be specific and actionable.\n- Use short sentences.\n- Avoid filler and repetition.\n- When introducing a concept, include a brief definition and one concrete example (if helpful).\n\nSTRUCTURE GUIDANCE (match the schema, use judgment):\n- Always include: title and summary.\n- For simple questions, keep the response concise and use the minimum number of blocks.\n- For complex topics, use multiple blocks to improve clarity.\n- Use markdown blocks for explanations and steps.\n- Use a table block only when a checklist or comparison clearly improves understanding.\n- Use a code block only when a concrete example meaningfully helps the answer.\n\nVISUAL SEPARATION RULES (IMPORTANT):\n- Clearly separate major sections using horizontal dividers.\n- Use a divider between logical sections.\n- Prefer Markdown horizontal rules (---) for section separation.\n\nFORMATTING RULES:\n- Markdown blocks must include headings (e.g., '## ...').\n- Tables should be compact (3–7 rows) when used.\n- Code must be copyable and runnable when used.\n\nTONE & EMOJIS:\n- Friendly, confident, and concise.\n- Use emojis appropriately to improve scanning.\n- Do NOT use emojis in code blocks or tables.\n\nWEB SEARCH POLICY:\n- Use web search ONLY when required for recency, prices, exact figures, legal/regulatory text, schedules, or current events.\n- Do NOT search if general knowledge is sufficient.\n\nEVIDENCE RULES:\n- If web search was used, include a brief \"Sources\" section in a markdown block.\n- If no web search was used, do not include a \"Sources\" section.\n\nRELIABILITY RULES:\n- Do not fabricate citations or claim to have searched if you did not.",
  "temperature": "{{params_temperature}}",
  "top_p": "{{params_top_p}}"
}
```

> - `{{params_temperature}}`, `{{params_top_p}}`는 런타임에서 ai_models.capabilities.defaults와 요청 options 값으로 대체됩니다. API가 number를 요구하므로 런타임에서 `Number()`로 변환 후 전달하는 것을 권장합니다.  
> - 구조화 출력 사용 시 `output_config`는 런타임에서 response_schema_id 기반으로 주입될 수 있으며, 현재 버전에서는 템플릿에 명시하지 않아도 됩니다.  
> - `system`을 array 형식(예: `[{ "type": "text", "text": "..." }]`)으로 두면 prompt caching 시 `cache_control`을 블록 단위로 적용할 수 있습니다.


---

## ai_models
AI 모델 (필수 필드 포함)

| 필드 | 값 | 비고 |
|------|-----|------|
| name | `claude-haiku-4-5` | 모델 이름 |
| model_id | `claude-haiku-4-5-20251001` | API 모델 ID. 별칭 `claude-haiku-4-5` 사용 가능 |
| display_name | `Claude Haiku 4.5` | 표시용 |
| model_type | `text` | Claude 4.5 계열 중 가장 빠른 속도 |
| context_window | `200000` | 200K 토큰 ([모델 문서](https://platform.claude.com/docs/models-overview)) |
| max_input_tokens | `200000` | models_prompt_text(chat).md 권장 |
| max_output_tokens | `65536` | 최대 64K 출력 |
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
  "model": "claude-haiku-4-5-20251001",
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
    "developer_role": false,
    "structured_outputs": true,
    "extended_thinking": true
  },
  "prompt_caching": true
}
```

> **temperature vs top_p**: 공식 권장—둘 중 하나만 조정 (동시 조정 비권장).  
> **prompt_caching**: `cache_control: { type: "ephemeral" }` 지원. 캐시 입력 $0.10/MTok (90% 절감 가능). reductai `anthropicSimulateChat`의 `cacheControl` 옵션으로 전달됨.  
> **extended_thinking**: Claude Haiku 4.5는 extended thinking 지원. `thinking: { type: "enabled", budget_tokens: N }`로 제어 가능.  
> **가격**: 입력 $1/MTok, 출력 $5/MTok ([Pricing](https://www.anthropic.com/pricing)).


---

## model_api_profiles
> **참고**: `provider_family=anthropic`이면 채팅 런타임은 **내장 provider client** (`anthropicSimulateChat`)를 사용합니다. model_api_profiles는 커스텀 HTTP 경로를 쓸 때만 참고합니다.  
> 아래 프로필은 Claude Messages API `POST /v1/messages` 형식 참고용입니다.

### transport
```
POST https://api.anthropic.com/v1/messages
Headers: x-api-key: {apiKey}, anthropic-version: 2023-06-01
```
```json
{
  "kind": "http_json",
  "method": "POST",
  "path": "/messages",
  "headers": {
    "Content-Type": "application/json",
    "x-api-key": "{{apiKey}}",
    "anthropic-version": "2023-06-01"
  },
  "body": {
    "model": "{{model}}",
    "max_tokens": "{{maxTokens}}",
    "system": "{{system}}",
    "messages": [{ "role": "user", "content": "{{input}}" }],
    "temperature": "{{params_temperature}}",
    "top_p": "{{params_top_p}}",
    "output_config": {
      "format": {
        "type": "json_schema",
        "schema": "{{response_schema_json}}"
      }
    }
  },
  "timeout_ms": 60000
}
```

### response_mapping
```json
{
  "result_type": "text",
  "extract": {
    "text_path": "content[0].text"
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
| target_model_id | (ai_models.id) | Claude Haiku 4.5 모델 ID |
| fallback_model_id | (선택) | 예: claude-3-haiku |
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

1. **ai_providers**: Anthropic provider가 없으면 생성
2. **provider_api_credentials**: API Key 등록 (x-api-key)
3. **response_schemas**: 스키마 생성 → ID 확보
4. **prompt_templates**: 프롬프트 생성 → ID 확보
5. **ai_models**: response_schema_id, prompt_template_id 연결하여 생성
6. **model_routing_rules**: (선택) 라우팅 규칙 추가
7. **model_api_profiles**: (선택) 커스텀 호출 경로 사용 시에만
