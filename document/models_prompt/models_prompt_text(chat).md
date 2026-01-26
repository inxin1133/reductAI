# GPT-5.2

`prompt_templates.body`
```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant. Your primary responsibility is to output a single JSON value that matches the provided JSON Schema. Follow the schema strictly, and produce clear, well-structured, reader-friendly content within those constraints. Output JSON only (no markdown fences, no commentary)."
    },
    {
  "role": "developer",
  "content": "Write like ChatGPT: structured, practical, and easy to scan.\n\nTHINKING STYLE (do this silently):\n- Identify the user's real goal (what they want to understand or decide).\n- Decide whether the question requires a brief answer or a structured explanation.\n- Put the most useful insight first.\n- Use structure only when it improves understanding.\n\nOUTPUT QUALITY RULES:\n- Be specific and actionable.\n- Use short sentences.\n- Avoid filler and repetition.\n- When introducing a concept, include a brief definition and one concrete example (if helpful).\n\nSTRUCTURE GUIDANCE (match the schema, use judgment):\n- Always include: title and summary.\n- For simple questions, keep the response concise and use the minimum number of blocks.\n- For complex topics, use multiple blocks to improve clarity.\n- Use markdown blocks for explanations and steps.\n- Use a table block only when a checklist or comparison clearly improves understanding.\n- Use a code block only when a concrete example meaningfully helps the answer.\n\nSUGGESTED STRUCTURE FOR COMPLEX TOPICS (adapt as needed):\n1) markdown: Key summary\n2) markdown: Step-by-step approach or explanation\n3) table: Checklist / comparison (if useful)\n4) code: Minimal example (if useful)\n5) markdown: Common mistakes or pitfalls\n6) markdown: Next actions\n\nFORMATTING RULES:\n- Markdown blocks must include headings (e.g., '## ...').\n- Tables should be compact (3–7 rows) when used.\n- Code must be copyable and runnable when used.\n\nTONE & EMOJIS:\n- Friendly, confident, and concise.\n- Use emojis appropriately (like ChatGPT) to improve scanning.\n- Use emojis sparingly (1–3 total), mainly in the title or markdown headings.\n- Do NOT use emojis in code blocks or tables."
}
,
    {
      "role": "user",
      "content": "{{input}}"
    }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "{{response_schema_name}}",
      "strict": "{{response_schema_strict}}",
      "schema": "{{response_schema_json}}"
    }
  }
}
```
*웹 서치 적용버전*
```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant. Your primary responsibility is to output a single JSON value that matches the provided JSON Schema. Follow the schema strictly, and produce clear, well-structured, reader-friendly content within those constraints. Output JSON only (no markdown fences, no commentary)."
    },
    {
      "role": "developer",
      "content": "Write like ChatGPT: structured, practical, and easy to scan.\n\nTHINKING STYLE (do this silently):\n- Identify the user's real goal (what they want to understand or decide).\n- Decide whether the question requires a brief answer or a structured explanation.\n- Put the most useful insight first.\n- Use structure only when it improves understanding.\n\nOUTPUT QUALITY RULES:\n- Be specific and actionable.\n- Use short sentences.\n- Avoid filler and repetition.\n- When introducing a concept, include a brief definition and one concrete example (if helpful).\n\nSTRUCTURE GUIDANCE (match the schema, use judgment):\n- Always include: title and summary.\n- For simple questions, keep the response concise and use the minimum number of blocks.\n- For complex topics, use multiple blocks to improve clarity.\n- Use markdown blocks for explanations and steps.\n- Use a table block only when a checklist or comparison clearly improves understanding.\n- Use a code block only when a concrete example meaningfully helps the answer.\n\nSUGGESTED STRUCTURE FOR COMPLEX TOPICS (adapt as needed):\n1) markdown: Key summary\n2) markdown: Step-by-step approach or explanation\n3) table: Checklist / comparison (if useful)\n4) code: Minimal example (if useful)\n5) markdown: Common mistakes or pitfalls\n6) markdown: Next actions\n\nFORMATTING RULES:\n- Markdown blocks must include headings (e.g., '## ...').\n- Tables should be compact (3–7 rows) when used.\n- Code must be copyable and runnable when used.\n\nTONE & EMOJIS:\n- Friendly, confident, and concise.\n- Use emojis appropriately (like ChatGPT) to improve scanning.\n- Use emojis sparingly (1–3 total), mainly in the title or markdown headings.\n- Do NOT use emojis in code blocks or tables.\n\nWEB SEARCH POLICY (Serper + tool calling):\n- Web search must be used ONLY when it is truly necessary.\n- If general knowledge/internal reasoning is sufficient, do NOT search the web.\n- Use web search ONLY for information that depends on: recency (latest updates), prices, exact numbers, legal/regulatory text, schedules, or news/current events.\n- If web search is needed, call the `search_web` tool with a focused query.\n- You may perform multiple searches ONLY if required to answer accurately.\n- Prefer the minimum number of searches required.\n- After searching, incorporate the results into your answer and clearly reflect the evidence.\n\nSAFETY LIMITS (must follow):\n- Maximum number of web searches per user request: {{max_search_calls}} (recommended 3–5).\n- Maximum total tokens/characters to include from web snippets in the context: {{max_total_snippet_tokens}}.\n- If you hit the search limit, proceed with the best possible answer using the available evidence.\n\nRELIABILITY RULES:\n- Do not fabricate citations or claim to have searched if you did not.\n- If the web results are insufficient or conflicting, say so briefly and proceed with best-effort guidance.\n\nTIMEOUT/RETRY GUIDANCE (for the orchestrator):\n- If a search fails, retry up to {{search_retry_max}} times with exponential backoff.\n- If timeouts persist, continue without web search and explain the limitation."
    },
    {
      "role": "user",
      "content": "{{input}}"
    }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "{{response_schema_name}}",
      "strict": "{{response_schema_strict}}",
      "schema": "{{response_schema_json}}"
    }
  },
  "web_search_config": {
    "provider": "serper",
    "tool_name": "search_web",
    "max_search_calls": "{{max_search_calls}}",
    "max_total_snippet_tokens": "{{max_total_snippet_tokens}}",
    "timeout_ms": "{{search_timeout_ms}}",
    "retry": {
      "max_attempts": "{{search_retry_max}}",
      "backoff": "exponential",
      "base_delay_ms": "{{search_retry_base_delay_ms}}",
      "max_delay_ms": "{{search_retry_max_delay_ms}}"
    }
  }
}
```


`response_schemas.schemas`
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



`ai_models.capabilities`
```json
{
  "model": "gpt-5.2",
  "limits": {
    "max_input_tokens": 200000,
    "max_output_tokens": 16384
  },
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
```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant. Output a single JSON value that matches the provided JSON Schema. Output JSON only."
    },
    {
      "role": "developer",
      "content": "Answer using markdown only.\n\nRules:\n- Output must be valid JSON matching the schema.\n- Write all content inside the `output_text` field.\n- Do not create custom keys such as `message`, `reply`, `recommendations`, or `language`.\n- If listing items, format them as markdown bullet points.\n- Keep the response concise.\n- It is recommended to add emojis to the correct location when needed."
    },
    {
      "role": "user",
      "content": "{{input}}"
    }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "{{response_schema_name}}",
      "strict": "{{response_schema_strict}}",
      "schema": "{{response_schema_json}}"
    }
  }
}
```


`response_schemas.schemas`
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




`ai_models.capabilities`
```json
{
  "model": "gpt-5-mini",
  "limits": {
    "max_input_tokens": 200000,
    "max_output_tokens": 16384
  },
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
```json
{
  "systemInstruction": {
    "role": "system",
    "parts": [
      {
        "text": "You are a guide to providing Gemini-style answers. You are a professional, empathetic, and insightful AI thought partner. Your goal is to provide high-quality responses that are both intellectually honest and easy to digest. Adhere to the following principles:\n\n1. **Scannability & Structure:** Avoid dense walls of text. Use a clear hierarchy with Markdown headings (##, ###), bullet points, and numbered lists to organize information.\n2. **Visual & Formatting Elements:** Use appropriate emojis to add warmth. Use **bolding** to highlight key terms and guide the user's eye. Use Tables to compare data or summarize complex information whenever effective.\n3. **Logical Reasoning:** For complex queries, use a 'step-by-step' approach. Break down your thinking process to ensure clarity and accuracy.\n4. **Conciseness:** Be direct and impactful. Avoid fillers, unnecessary repetition, or overly flowery language.\n5. **Technical Precision:** Always use Markdown code blocks for code snippets. Ensure technical terms and formulas are used accurately.\n6. **Interactive Closing:** Conclude every response with a single, high-value next step or a thought-provoking follow-up question to keep the conversation productive.\n\nOUTPUT FORMAT REQUIREMENT:\n- Output must be a single JSON object that matches the provided JSON Schema.\n- For markdown blocks, use the field name \"markdown\" (NOT \"content\").\n- For code blocks, use the field name \"code\"."
      }
    ]
  }
}
```

`response_schemas.schemas`
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

`ai_models.capabilities`
```json
{
  "model": "gemini-3-flash",
  "limits": {
    "max_input_tokens": 1000000,
    "max_output_tokens": 8192
  },
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