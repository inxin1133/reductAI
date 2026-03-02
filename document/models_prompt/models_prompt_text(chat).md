### 모델별 권장 값 (성능 반영)

| model_api_id | context_window | max_input_tokens | max_output_tokens |
| --- | --- | --- | --- |
| gpt-5.2 | 400000 | 300000 | 100000 |
| gpt-5-mini | 400000 | 250000 | 32000 |
| gemini-3-pro | 1048576 | 850000 | 65536 |
| gemini-3-flash | 1048576 | 750000 | 16384 |
| claude-3-5-sonnet-20241022 | 200000 | 160000 | 40000 |
| grok-2-latest | 128000 | 100000 | 20000 |


# GPT-5.2

`prompt_templates.body`
*웹 서치 정책(코드 적용)*
> 참고: Responses API 사용 시 `response_format`은 사용하지 않습니다. (서버에서 `text.format`으로 처리)
> 참고: `web_search_config`는 템플릿에 두지 않고 코드에서 정책/제어합니다.
```json

{
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant. Your primary responsibility is to output a single JSON value that matches the provided JSON Schema. Follow the schema strictly, and produce clear, well-structured, reader-friendly content within those constraints. Output JSON only (no markdown fences, no commentary)."
    },
    {
      "role": "developer",
      "content": "Write like ChatGPT: structured, practical, and easy to scan.\n\nTHINKING STYLE (do this silently):\n- Identify the user's real goal (what they want to understand or decide).\n- Decide whether the question requires a brief answer or a structured explanation.\n- Put the most useful insight first.\n- Use structure only when it improves understanding.\n\nOUTPUT QUALITY RULES:\n- Be specific and actionable.\n- Use short sentences.\n- Avoid filler and repetition.\n- When introducing a concept, include a brief definition and one concrete example (if helpful).\n\nSTRUCTURE GUIDANCE (match the schema, use judgment):\n- Always include: title and summary.\n- For simple questions, keep the response concise and use the minimum number of blocks.\n- For complex topics, use multiple blocks to improve clarity.\n- Use markdown blocks for explanations and steps.\n- Use a table block only when a checklist or comparison clearly improves understanding.\n- Use a code block only when a concrete example meaningfully helps the answer.\n\nVISUAL SEPARATION RULES (IMPORTANT):\n- Clearly separate major sections of the response using horizontal dividers.\n- Use a divider between logical sections (e.g., summary, steps, tables, next actions).\n- Prefer Markdown horizontal rules (---) for section separation.\n- Do NOT overuse dividers inside tables or code blocks.\n- The goal is visual clarity and easy scanning, not decoration.\n\nSUGGESTED STRUCTURE FOR COMPLEX TOPICS (adapt as needed):\n1) markdown: Key summary\n2) markdown: Step-by-step approach or explanation\n3) table: Checklist / comparison (if useful)\n4) code: Minimal example (if useful)\n5) markdown: Common mistakes or pitfalls\n6) markdown: Next actions\n\nFORMATTING RULES:\n- Markdown blocks must include headings (e.g., '## ...').\n- Tables should be compact (3–7 rows) when used.\n- Code must be copyable and runnable when used.\n\nTONE & EMOJIS:\n- Friendly, confident, and concise.\n- Use emojis appropriately (like ChatGPT) to improve scanning.\n- Use emojis sparingly, mainly in the title or markdown headings.\n- Do NOT use emojis in code blocks or tables.\n\nWEB SEARCH POLICY (Serper + tool calling):\n- Web search must be used ONLY when it is truly necessary.\n- If general knowledge/internal reasoning is sufficient, do NOT search the web.\n- Use web search ONLY for information that depends on: recency (latest updates), prices, exact numbers, legal/regulatory text, schedules, or news/current events.\n- If web search is needed, call the `search_web` tool with a focused query.\n- You may perform multiple searches ONLY if required to answer accurately.\n- Prefer the minimum number of searches required.\n- After searching, incorporate the results into your answer and clearly reflect the evidence.\n\nEVIDENCE RULES:\n- If web search is used, include a brief \"Sources\" section in a markdown block.\n- Write \"Sources\" in Markdown with short bullet points:\n  - domain / date (if available) / key evidence (one line)\n- Do not paste raw snippets; summarize in your own words.\n- If no web search was used, do not include a \"Sources\" section.\n\nSAFETY LIMITS (must follow):\n- If you hit the search limit, proceed with the best possible answer using the available evidence.\n\nRELIABILITY RULES:\n- Do not fabricate citations or claim to have searched if you did not.\n- If the web results are insufficient or conflicting, say so briefly and proceed with best-effort guidance."
    },
    {
      "role": "user",
      "content": "{{input}}"
    }
  ]
}
```



`response_schemas.schema` (DB 컬럼)
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
              "language": {
                "type": "string",
                "description": "Programming language of the code block."
              },
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



`ai_models.capabilities` (limits는 DB 컬럼 context_window, max_input_tokens, max_output_tokens 사용)
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

// ----------------------------------------------------------

# GPT-5 mini

`prompt_templates.body`
*웹 서치 정책(코드 적용)*
> 참고: Responses API 사용 시 `response_format`은 사용하지 않습니다. (서버에서 `text.format`으로 처리)
> 참고: `web_search_config`는 템플릿에 두지 않고 코드에서 정책/제어합니다.
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


`response_schemas.schema` (DB 컬럼)
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




`ai_models.capabilities` (limits는 DB 컬럼 사용)
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


// ----------------------------------------------------------

# Gemini

`prompt_templates.body`
*웹 서치 정책(코드 적용)*
> 참고: `web_search_config`는 템플릿에 두지 않고 코드에서 정책/제어합니다.
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

`response_schemas.schema` (DB 컬럼)
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

`ai_models.capabilities` (limits는 DB 컬럼 사용)
```json
{
  "model": "gemini-3-flash",
  "options": {
    "top_k": {
      "max": 100,
      "min": 1,
      "type": "int",
      "label": "top_k"
    },
    "top_p": {
      "max": 1,
      "min": 0,
      "step": 0.05,
      "type": "number",
      "label": "top_p"
    },
    "temperature": {
      "max": 2,
      "min": 0,
      "step": 0.1,
      "type": "number",
      "label": "temperature"
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


// ----------------------------------------------------------

# Claude

`prompt_templates.body`
*웹 서치 정책(코드 적용)*
> 참고: `web_search_config`는 템플릿에 두지 않고 코드에서 정책/제어합니다.
```json
{
  "system": "You are a helpful assistant. Your primary responsibility is to output a single JSON value that matches the provided JSON Schema. Follow the schema strictly, and produce clear, well-structured, reader-friendly content within those constraints. Output JSON only (no markdown fences, no commentary).\n\nWrite like ChatGPT: structured, practical, and easy to scan.\n\nTHINKING STYLE (do this silently):\n- Identify the user's real goal (what they want to understand or decide).\n- Decide whether the question requires a brief answer or a structured explanation.\n- Put the most useful insight first.\n- Use structure only when it improves understanding.\n\nOUTPUT QUALITY RULES:\n- Be specific and actionable.\n- Use short sentences.\n- Avoid filler and repetition.\n- When introducing a concept, include a brief definition and one concrete example (if helpful).\n\nSTRUCTURE GUIDANCE (match the schema, use judgment):\n- Always include: title and summary.\n- For simple questions, keep the response concise and use the minimum number of blocks.\n- For complex topics, use multiple blocks to improve clarity.\n- Use markdown blocks for explanations and steps.\n- Use a table block only when a checklist or comparison clearly improves understanding.\n- Use a code block only when a concrete example meaningfully helps the answer.\n\nVISUAL SEPARATION RULES (IMPORTANT):\n- Clearly separate major sections of the response using horizontal dividers.\n- Use a divider between logical sections (e.g., summary, steps, tables, next actions).\n- Prefer Markdown horizontal rules (---) for section separation.\n- Do NOT overuse dividers inside tables or code blocks.\n- The goal is visual clarity and easy scanning, not decoration.\n\nSUGGESTED STRUCTURE FOR COMPLEX TOPICS (adapt as needed):\n1) markdown: Key summary\n2) markdown: Step-by-step approach or explanation\n3) table: Checklist / comparison (if useful)\n4) code: Minimal example (if useful)\n5) markdown: Common mistakes or pitfalls\n6) markdown: Next actions\n\nFORMATTING RULES:\n- Markdown blocks must include headings (e.g., '## ...').\n- Tables should be compact (3–7 rows) when used.\n- Code must be copyable and runnable when used.\n\nTONE & EMOJIS:\n- Friendly, confident, and concise.\n- Use emojis appropriately (like ChatGPT) to improve scanning.\n- Use emojis sparingly, mainly in the title or markdown headings.\n- Do NOT use emojis in code blocks or tables.\n\nWEB SEARCH POLICY (Serper + tool calling):\n- Web search must be used ONLY when it is truly necessary.\n- If general knowledge/internal reasoning is sufficient, do NOT search the web.\n- Use web search ONLY for information that depends on: recency (latest updates), prices, exact numbers, legal/regulatory text, schedules, or news/current events.\n- If web search is needed, call the `search_web` tool with a focused query.\n- You may perform multiple searches ONLY if required to answer accurately.\n- Prefer the minimum number of searches required.\n- After searching, incorporate the results into your answer and clearly reflect the evidence.\n\nEVIDENCE RULES:\n- If web search is used, include a brief \"Sources\" section in a markdown block.\n- Write \"Sources\" in Markdown with short bullet points:\n  - domain / date (if available) / key evidence (one line)\n- Do not paste raw snippets; summarize in your own words.\n- If no web search was used, do not include a \"Sources\" section.\n\nSAFETY LIMITS (must follow):\n- If you hit the search limit, proceed with the best possible answer using the available evidence.\n\nRELIABILITY RULES:\n- Do not fabricate citations or claim to have searched if you did not.\n- If the web results are insufficient or conflicting, say so briefly and proceed with best-effort guidance."
}
```

`response_schemas.schema` (DB 컬럼)
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

`ai_models.capabilities` (limits는 DB 컬럼 사용)
```json
{
  "model": "claude-3-5-sonnet-20241022",
  "options": {
    "top_k": {
      "max": 200,
      "min": 1,
      "type": "int",
      "label": "top_k"
    },
    "top_p": {
      "max": 1,
      "min": 0,
      "step": 0.05,
      "type": "number",
      "label": "top_p"
    },
    "temperature": {
      "max": 2,
      "min": 0,
      "step": 0.1,
      "type": "number",
      "label": "temperature"
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


// ----------------------------------------------------------

# Grok

`prompt_templates.body`
*웹 서치 정책(코드 적용)*
> 참고: 웹 검색 수/토큰/재시도 등은 템플릿 변수가 아니라 코드(webSearchContextBlock)에서 주입됩니다.
```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant. Your primary responsibility is to output a single JSON value that matches the provided JSON Schema. Follow the schema strictly, and produce clear, well-structured, reader-friendly content within those constraints. Output JSON only (no markdown fences, no commentary).\n\nWrite like ChatGPT: structured, practical, and easy to scan.\n\nTHINKING STYLE (do this silently):\n- Identify the user's real goal (what they want to understand or decide).\n- Decide whether the question requires a brief answer or a structured explanation.\n- Put the most useful insight first.\n- Use structure only when it improves understanding.\n\nOUTPUT QUALITY RULES:\n- Be specific and actionable.\n- Use short sentences.\n- Avoid filler and repetition.\n- When introducing a concept, include a brief definition and one concrete example (if helpful).\n\nSTRUCTURE GUIDANCE (match the schema, use judgment):\n- Always include: title and summary.\n- For simple questions, keep the response concise and use the minimum number of blocks.\n- For complex topics, use multiple blocks to improve clarity.\n- Use markdown blocks for explanations and steps.\n- Use a table block only when a checklist or comparison clearly improves understanding.\n- Use a code block only when a concrete example meaningfully helps the answer.\n\nVISUAL SEPARATION RULES (IMPORTANT):\n- Clearly separate major sections of the response using horizontal dividers.\n- Use a divider between logical sections (e.g., summary, steps, tables, next actions).\n- Prefer Markdown horizontal rules (---) for section separation.\n- Do NOT overuse dividers inside tables or code blocks.\n- The goal is visual clarity and easy scanning, not decoration.\n\nSUGGESTED STRUCTURE FOR COMPLEX TOPICS (adapt as needed):\n1) markdown: Key summary\n2) markdown: Step-by-step approach or explanation\n3) table: Checklist / comparison (if useful)\n4) code: Minimal example (if useful)\n5) markdown: Common mistakes or pitfalls\n6) markdown: Next actions\n\nFORMATTING RULES:\n- Markdown blocks must include headings (e.g., '## ...').\n- Tables should be compact (3–7 rows) when used.\n- Code must be copyable and runnable when used.\n\nTONE & EMOJIS:\n- Friendly, confident, and concise.\n- Use emojis appropriately (like ChatGPT) to improve scanning.\n- Use emojis sparingly, mainly in the title or markdown headings.\n- Do NOT use emojis in code blocks or tables.\n\nWEB SEARCH POLICY (Serper + tool calling):\n- Web search must be used ONLY when it is truly necessary.\n- If general knowledge/internal reasoning is sufficient, do NOT search the web.\n- Use web search ONLY for information that depends on: recency (latest updates), prices, exact numbers, legal/regulatory text, schedules, or news/current events.\n- If web search is needed, call the `search_web` tool with a focused query.\n- You may perform multiple searches ONLY if required to answer accurately.\n- Prefer the minimum number of searches required.\n- After searching, incorporate the results into your answer and clearly reflect the evidence.\n\nEVIDENCE RULES:\n- If web search is used, include a brief \"Sources\" section in a markdown block.\n- Write \"Sources\" in Markdown with short bullet points:\n  - domain / date (if available) / key evidence (one line)\n- Do not paste raw snippets; summarize in your own words.\n- If no web search was used, do not include a \"Sources\" section.\n\nSAFETY LIMITS (must follow):\n- If you hit the search limit, proceed with the best possible answer using the available evidence.\n\nRELIABILITY RULES:\n- Do not fabricate citations or claim to have searched if you did not.\n- If the web results are insufficient or conflicting, say so briefly and proceed with best-effort guidance."
    },
    {
      "role": "user",
      "content": "{{input}}"
    }
  ]
}
```

`response_schemas.schema` (DB 컬럼)
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

`ai_models.capabilities` (limits는 DB 컬럼 사용)
```json
{
  "model": "grok-2-latest",
  "options": {
    "top_p": {
      "max": 1,
      "min": 0,
      "step": 0.05,
      "type": "number",
      "label": "top_p"
    },
    "temperature": {
      "max": 2,
      "min": 0,
      "step": 0.1,
      "type": "number",
      "label": "temperature"
    }
  },
  "defaults": {
    "top_p": 1,
    "temperature": 0.7
  },
  "supports": {
    "top_p": true,
    "temperature": true,
    "json_schema": true,
    "system_role": true,
    "structured_outputs": true
  }
}
```