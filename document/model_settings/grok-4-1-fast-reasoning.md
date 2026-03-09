# Grok 4.1 Fast (Reasoning)

> 이 문서는 reductai 시스템에 Grok 4.1 Fast Reasoning 모델을 등록할 때 참조하는 설정 스펙입니다.
> models_prompt_text(chat).md 상단 권장값과 schema_models.sql 스키마를 기준으로 검토·조정되었습니다.
>
> **공식 문서**: [xAI 문서](https://docs.x.ai/) · [Quickstart](https://docs.x.ai/developers/quickstart) · [Models & Pricing](https://docs.x.ai/developers/models) · [Responses API](https://docs.x.ai/developers/model-capabilities/text/generate-text) · [Structured outputs](https://docs.x.ai/developers/model-capabilities/text/structured-outputs)

---

## 연동 사전 요건

> **중요**: reductai의 `chatRuntimeController`는 현재 `openai`, `anthropic`, `google`만 지원합니다. xAI 연동을 위해 **provider_family=xai 분기 및 xaiSimulateChat(또는 xAI 전용 클라이언트) 구현이 필요합니다.**  
> xAI Responses API는 `instructions` 파라미터를 **지원하지 않으며**, `input`을 메시지 배열(`[{role, content}]`)로 전달해야 합니다. OpenAI Responses API와 형식이 다릅니다.

---

## ai_providers
AI 제공업체

| 필드 | 값 | 비고 |
|------|-----|------|
| provider_family | `xai` | 라우팅/credential 매칭용. **필수** (연동 코드 추가 후) |
| name | `xAI` | 표시용 |
| product_name | `Grok` | 표시용 |
| slug | `xai` | 기존 코드 확장 시 `xai`로 라우팅 |
| api_base_url | `https://api.x.ai/v1` | **base만** 저장. `/responses` path 제외 |
| website_url | `https://x.ai` | |
| documentation_url | `https://docs.x.ai` | |
| logo_key | `grok` | UI 로고 매핑 (IconGrok 사용) |


---

## provider_api_credentials
API Key 인증 정보

| 필드 | 값 | 비고 |
|------|-----|------|
| endpoint_url | `https://api.x.ai/v1` | 커스텀 URL이 없으면 NULL |

> xAI API는 `Authorization: Bearer {api_key}` 헤더로 인증합니다. API 키는 [xAI Console](https://console.x.ai/team/default/api-keys)에서 발급.


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

> xAI는 structured outputs를 지원합니다. `text.format`에 `json_schema`를 지정하여 스키마 준수 출력을 얻을 수 있습니다. 단, `minLength`/`maxLength`, `minItems`/`maxItems` 등 일부 제약은 [미지원](https://docs.x.ai/developers/model-capabilities/text/structured-outputs)일 수 있습니다.


---

## prompt_templates
프롬프트 템플릿

| 필드 | 비고 |
|------|------|
| name | 예: `grok-4-1-fast-reasoning-chat-block-json` |
| purpose | `chat` |
| is_active | `true` |
| body | 아래 JSON |

> **xAI Responses API**: `instructions` 미지원. `input`을 `[{ role, content }]` 배열로 전달합니다.  
> 템플릿의 `messages`는 xaiSimulateChat에서 `input` 배열로 변환됩니다. system/developer → 첫 메시지(role: system), user → 마지막 메시지(role: user).  
> 웹 서치 정책은 코드에서 적용됩니다. Grok은 기본적으로 실시간 이벤트를 모르며, Web Search / X Search 도구를 활성화하면 최신 정보를 활용할 수 있습니다.

### body
```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are Grok, a highly intelligent, helpful AI assistant inspired by the Hitchhiker's Guide to the Galaxy. Your primary responsibility is to output a single JSON value that matches the provided JSON Schema. Follow the schema strictly, and produce clear, well-structured, reader-friendly content within those constraints. Output JSON only (no markdown fences, no commentary)."
    },
    {
      "role": "developer",
      "content": "Write like Grok: witty, structured, and practical.\n\nTHINKING STYLE (do this silently):\n- Identify the user's real goal.\n- Decide whether a brief answer or structured explanation is needed.\n- Put the most useful insight first.\n\nOUTPUT QUALITY RULES:\n- Be specific and actionable.\n- Use short sentences.\n- Avoid filler and repetition.\n- Use structure only when it improves understanding.\n\nSTRUCTURE GUIDANCE (match the schema):\n- Always include: title and summary.\n- For simple questions, keep the response concise.\n- For complex topics, use multiple blocks.\n- Use markdown blocks for explanations.\n- Use a table block only when a checklist or comparison helps.\n- Use a code block only when a concrete example helps.\n\nVISUAL SEPARATION:\n- Use horizontal dividers (---) between major sections.\n- Do NOT overuse dividers inside tables or code blocks.\n\nFORMATTING RULES:\n- Markdown blocks must include headings (## ...).\n- Tables: compact (3–7 rows).\n- Code: copyable and runnable.\n\nTONE & EMOJIS:\n- Friendly, confident, concise. Use emojis appropriately.\n- Do NOT use emojis in code blocks or tables.\n\nWEB SEARCH POLICY (when tools enabled):\n- Use web search only for recency, prices, exact figures, legal text, schedules, or current events.\n- Do NOT search if general knowledge is sufficient.\n\nEVIDENCE RULES:\n- If web search was used, include a \"Sources\" section.\n- Do not fabricate citations or claim to have searched if you did not."
    },
    {
      "role": "user",
      "content": "{{input}}"
    }
  ]
}
```

> `developer` 역할은 xAI에서 `system`의 별칭으로 지원됩니다. 단일 system/developer 메시지만 사용하고, 대화의 첫 메시지여야 합니다.


---

## ai_models
AI 모델 (필수 필드 포함)

| 필드 | 값 | 비고 |
|------|-----|------|
| name | `grok-4-1-fast-reasoning` | 모델 이름 |
| model_id | `grok-4-1-fast-reasoning` | API 모델 ID. [Models](https://docs.x.ai/developers/models) 참조 |
| display_name | `Grok 4.1 Fast (Reasoning)` | 표시용 |
| model_type | `text` | 이미지 입력(→텍스트) 지원(멀티모달) |
| context_window | `2000000` | 200만 토큰 |
| max_input_tokens | `1500000` | 권장 (여유 확보) |
| max_output_tokens | `65536` | 64K 출력 가능 |
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
  "model": "grok-4-1-fast-reasoning",
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
    "structured_outputs": true,
    "reasoning": true,
    "image_input": true
  },
  "prompt_caching": true
}
```

> **가격**: 입력 $0.20/MTok, 캐시 입력 $0.05/MTok, 출력 $0.50/MTok ([Models & Pricing](https://docs.x.ai/developers/models)).  
> **Rate limits**: 4M TPM, 480 RPM.  
> **reasoning**: 내부 추론 토큰 사용. 비용에 포함됩니다.  
> **prompt_caching**: 자동 활성화. `usage` 객체에서 cached prompt tokens 확인 가능.


---

## model_api_profiles
> **참고**: `provider_family=xai` 연동 구현 후, 내장 xaiSimulateChat을 사용할 수 있습니다.  
> 아래는 xAI Responses API `POST /v1/responses` 형식 참고용입니다.

### transport
```
POST https://api.x.ai/v1/responses
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
    "input": [
      { "role": "system", "content": "{{systemInstructions}}" },
      { "role": "user", "content": "{{input}}" }
    ],
    "max_output_tokens": "{{maxTokens}}",
    "temperature": "{{params_temperature}}",
    "top_p": "{{params_top_p}}",
    "text": {
      "format": {
        "type": "json_schema",
        "name": "{{response_schema_name}}",
        "schema": "{{response_schema_json}}",
        "strict": "{{response_schema_strict}}"
      }
    }
  },
  "timeout_ms": 60000
}
```

> **주의**: xAI는 `instructions` 파라미터를 지원하지 않습니다. system 지시사항은 `input[0].content`에 포함해야 합니다.  
> reasoning 모델은 응답 시간이 길 수 있으므로 `timeout_ms`를 60초 이상 권장합니다.

### response_mapping
```json
{
  "result_type": "text",
  "extract": {
    "text_path": "output_text"
  }
}
```

> xAI Responses API는 `output_text` 또는 `output[].content[].text` 형식으로 텍스트를 반환할 수 있습니다. 실제 응답 구조에 맞게 `text_path`를 조정하세요.

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
| target_model_id | (ai_models.id) | Grok 4.1 Fast Reasoning 모델 ID |
| fallback_model_id | (선택) | 예: grok-4-1-fast-non-reasoning |
| priority | `0` | |

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

1. **ai_providers**: xAI provider 생성 (provider_family=xai, 연동 코드 추가 후)
2. **provider_api_credentials**: xAI API Key 등록
3. **response_schemas**: 스키마 생성 → ID 확보
4. **prompt_templates**: 프롬프트 생성 → ID 확보
5. **ai_models**: response_schema_id, prompt_template_id 연결하여 생성
6. **model_routing_rules**: (선택) 라우팅 규칙 추가
7. **model_api_profiles**: (선택) 커스텀 HTTP 경로 사용 시
