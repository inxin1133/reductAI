# GPT-5 mini

> 이 문서는 reductai 시스템에 GPT-5-mini를 등록할 때 참조하는 설정 스펙입니다.
> models_prompt_text(chat).md 상단 권장값과 schema_models.sql 스키마를 기준으로 검토·조정되었습니다.
>
> **공식 문서**: [Platform 문서](https://platform.openai.com/docs) · [모델 목록](https://platform.openai.com/api/docs/models) · [Responses API](https://platform.openai.com/api/docs/guides/migrate-to-responses) · [Structured outputs](https://platform.openai.com/api/docs/guides/structured-outputs) · [GPT-5 mini](https://platform.openai.com/api/docs/models/gpt-5-mini)

---

## ai_providers
AI 제공업체 (GPT-5.2와 동일, OpenAI 공유)

| 필드 | 값 | 비고 |
|------|-----|------|
| provider_family | `openai` | 라우팅/credential 매칭용. **필수** |
| name | `OpenAI` | 표시용 |
| product_name | `ChatGPT` | 표시용 |
| slug | `openai` | 기존 코드가 `openai`로 하드코딩 |
| api_base_url | `https://api.openai.com/v1` | **base만** 저장 |
| website_url | `https://openai.com` | |
| documentation_url | `https://platform.openai.com/docs` | |
| logo_key | `chatgpt` | UI 로고 매핑 (선택) |

---

## provider_api_credentials
API Key 인증 정보 (GPT-5.2와 동일 provider 사용)

| 필드 | 값 | 비고 |
|------|-----|------|
| endpoint_url | `https://api.openai.com/v1` | 커스텀 URL이 없으면 NULL |

---

## ai_models
AI 모델 (필수 필드 포함)

| 필드 | 값 | 비고 |
|------|-----|------|
| name | `gpt-5-mini` | 모델 이름 |
| model_id | `gpt-5-mini` | API 모델 ID. [모델 목록](https://platform.openai.com/api/docs/models)에서 확인 |
| display_name | `GPT-5 mini` | 표시용 |
| model_type | `text` | |
| context_window | `400000` | models_prompt_text(chat).md 권장 |
| max_input_tokens | `250000` | models_prompt_text(chat).md 권장 |
| max_output_tokens | `32000` | models_prompt_text(chat).md 권장 |
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
  "model": "gpt-5-mini",
  "options": {},
  "defaults": {},
  "supports": {
    "json_schema": true,
    "system_role": true,
    "developer_role": true,
    "structured_outputs": true
  },
  "prompt_caching": true
}
```

> GPT-5-mini는 top_p, temperature 옵션을 지원하지 않습니다 (공식: "faster, cost-efficient version for well-defined tasks"). options/defaults는 비워둡니다. 지원 여부는 [모델 문서](https://platform.openai.com/api/docs/models/gpt-5-mini)에서 확인하세요.

---

## response_schemas
출력 계약 (output_text 형식 — GPT-5.2 block_json과 상이)

| 필드 | 비고 |
|------|------|
| name | 예: `llm_output_text` |
| strict | `true` |
| schema | 아래 JSON |

### schema
```json
{
  "type": "object",
  "required": ["output_text"],
  "additionalProperties": false,
  "properties": {
    "output_text": {
      "type": "string",
      "minLength": 1,
      "description": "Markdown content to render directly in the UI."
    }
  }
}
```

> GPT-5-mini는 단일 Markdown 문자열(`output_text`)을 반환합니다. title/summary/blocks 구조를 사용하지 않습니다.

---

## prompt_templates
프롬프트 템플릿 (GPT-5-mini용 간소화 버전)

| 필드 | 비고 |
|------|------|
| name | 예: `gpt-5-mini-chat-output-text` |
| purpose | `chat` |
| is_active | `true` |
| body | 아래 JSON |

> 웹 서치 정책은 코드에서 적용됩니다. `web_search_config`는 템플릿에 넣지 않습니다.  
> **Responses API**: template의 `messages`는 런타임에서 `instructions` + `input`으로 변환됩니다.

### body
```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant. Your task is to output a single JSON value that strictly matches the provided JSON Schema. Output JSON only. Do not include markdown fences or commentary outside the schema."
    },
    {
      "role": "developer",
      "content": "Write like ChatGPT: clear, structured, and easy to scan.\n\nTHINKING STYLE (internal only):\n- Identify the user's main goal.\n- Decide whether a brief or structured answer is needed.\n- Put the most useful insight first.\n\nOUTPUT QUALITY RULES:\n- Be specific and actionable.\n- Use short, direct sentences.\n- Avoid repetition and filler.\n- When helpful, add one brief example.\n\nOUTPUT FORMAT (output_text schema):\n- Output a single Markdown string in `output_text`.\n- Use headings (##, ###), bullet points, numbered lists for structure.\n- Use Markdown tables for comparisons or checklists when useful.\n- Use Markdown code fences (```) for code examples when helpful.\n- Keep the response concise for simple questions; add structure only when it improves clarity.\n\nFORMATTING:\n- Markdown should include headings for sections.\n- Tables should be compact. Code must be copyable.\n\nTONE & EMOJIS:\n- Friendly and confident.\n- Use emojis sparingly (max 1–2), mainly in titles or headings.\n- Never use emojis in tables or code.\n\nWEB SEARCH POLICY:\n- Use web search ONLY when required for recency, prices, exact figures, legal/regulatory text, schedules, or current events.\n- Do NOT search if general knowledge is sufficient.\n- Use the minimum number of searches needed.\n\nEVIDENCE RULES:\n- If web search is used, include a short Markdown \"Sources\" section inside `output_text`.\n- Use one-line bullets: domain / date (if available) / key evidence.\n- Summarize in your own words. Do not paste raw snippets.\n- If no web search was used, do not include a \"Sources\" section.\n\nLIMITS & RELIABILITY:\n- Do not claim to have searched if you did not.\n- If results are insufficient or conflicting, state this briefly and provide best-effort guidance."
    },
    {
      "role": "user",
      "content": "{{input}}"
    }
  ]
}
```

---

## model_api_profiles
> **참고**: GPT-5-mini도 [Responses API](https://platform.openai.com/api/docs/guides/migrate-to-responses) `POST /v1/responses`를 사용합니다.  
> `provider_family=openai` 이면 채팅 런타임은 **내장 provider client**를 사용하고 model_api_profiles를 사용하지 않습니다.  
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

> GPT-5-mini는 top_p, temperature 파라미터를 body에 포함하지 않습니다.

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
| target_model_id | (ai_models.id) | GPT-5-mini 모델 ID |
| fallback_model_id | (선택) | 예: gpt-5.2 |
| priority | `0` | 다른 규칙과 겹치면 높은 값 우선 |

### conditions
```json
{
  "feature": "chat",
  "max_tokens": {
    "$gt": 32000
  },
  "model_type": "text"
}
```

---

## 등록 순서 권장

1. **ai_providers**: OpenAI provider가 없으면 생성 (GPT-5.2와 공유)
2. **provider_api_credentials**: API Key 등록 (GPT-5.2와 공유)
3. **response_schemas**: output_text 형식 스키마 생성 → ID 확보
4. **prompt_templates**: gpt-5-mini용 프롬프트 생성 → ID 확보
5. **ai_models**: response_schema_id, prompt_template_id 연결하여 생성
6. **model_routing_rules**: (선택) 라우팅 규칙 추가
7. **model_api_profiles**: (선택) 커스텀 호출 경로 사용 시에만
