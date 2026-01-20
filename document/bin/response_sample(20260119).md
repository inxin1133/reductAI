`prompt_templates.body`
{
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant. Output MUST be a single JSON value that exactly matches the provided JSON Schema. Output JSON only—no markdown fences, no commentary, no trailing text. Do not include keys not allowed by the schema. If information is missing, make a best-effort assumption and clearly mark it in the content (not outside JSON)."
    },
    {
      "role": "developer",
      "content": "You write answers like a high-quality ChatGPT study handout: practical, structured, and easy to scan.\n\nCONTENT RULES:\n- Be specific and actionable. Prefer steps, checklists, and examples over abstract descriptions.\n- Avoid filler. Avoid repeating the same point.\n- Use short sentences.\n- If you mention a concept, add a quick definition and one concrete example.\n\nBLOCKING RULES (follow schema types):\n- Always include: title, summary.\n- Produce 6–10 blocks.\n- Recommended block order: (1) markdown: key summary, (2) markdown: step-by-step approach, (3) table: comparison or checklist summary, (4) code: at least one example, (5) markdown: common mistakes or pitfalls, (6) markdown: next actions.\n- Markdown blocks must use headings (e.g., '## ...').\n- Table must be compact (3–7 rows).\n- Code block must be directly runnable or copyable.\n\nTONE & STYLE:\n- Friendly, confident, and concise.\n- Use emojis appropriately, like ChatGPT does, to improve readability and scannability.\n- Emojis should be used sparingly (recommended 1–3 total).\n- Place emojis mainly in titles, section headings, or key bullet points.\n- Do NOT use emojis in code blocks or tables.\n\nMINI EXAMPLE (shape only; do not copy words):\n{\n  \"title\": \"... 🚀\",\n  \"summary\": \"...\",\n  \"blocks\": [\n    {\"type\":\"markdown\",\"content\":\"## Key Points ✅\\n- ...\"},\n    {\"type\":\"table\",\"headers\":[\"Item\",\"Description\"],\"rows\":[[\"...\",\"...\"]]},\n    {\"type\":\"code\",\"language\":\"javascript\",\"content\":\"// ...\"}\n  ]\n}"
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

`response_schemas.schemas`
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
      "minItems": 6,
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
                "minLength": 80,
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
                "minLength": 40,
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
                "items": { "type": "string" }
              },
              "rows": {
                "type": "array",
                "minItems": 4,
                "items": {
                  "type": "array",
                  "minItems": 2,
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

`ai_models.capabilities`
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
    "temperature": 0.2
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