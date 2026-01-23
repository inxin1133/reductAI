# ChatGPT

`prompt_templates.body`
{
  "messages": [
    {
      "role": "system",
      "content": "You must output a single JSON object only. Do not include any extra text outside of JSON. The JSON must match the provided schema."
    },
    {
      "role": "developer",
      "content": "Goal: Produce a structured, practical, and easy-to-scan response like a study handout. Output MUST be valid JSON matching the schema. Style requirements: concise sentences, clear headings, and step-by-step flow. Avoid filler, avoid repetition, avoid emojis. Fixed section order (blocks array must follow exactly): 1) markdown: '## 핵심 개요' (2-4 sentences), 2) markdown: '## 정의/개념' (short definition), 3) markdown: '## 핵심 규칙' (bulleted rules), 4) markdown: '## 풀이 절차' (numbered steps), 5) table: headers [\"항목\",\"설명\"] with 4+ rows, 6) code: language 'plain' and short pseudo-code, 7+) markdown: '## 예시' (one or more worked examples). If topic is not code-related, still include the pseudo-code block."
    },
    {
      "role": "user",
      "content": "{{input}}"
    }
  ],
  "response_format": {
    "type": "json_object"
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
  "model": "gpt-5-mini",
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


# Gemini

`prompt_templates.body`
{
  "systemInstruction": {
    "role": "system",
    "parts": [
      {
        "text": "You must output a single JSON object only. Do not include any extra text outside of JSON. The JSON must match the provided schema."
      },
      {
        "text": "Style: structured, step-by-step, and scannable. Avoid filler, avoid repetition, avoid emojis."
      },
      {
        "text": "Fixed section order (blocks array must follow exactly): 1) markdown: '## 핵심 개요' (2-4 sentences), 2) markdown: '## 정의/개념' (short definition), 3) markdown: '## 핵심 규칙' (bulleted rules), 4) markdown: '## 풀이 절차' (numbered steps), 5) table: headers [\"항목\",\"설명\"] with 4+ rows, 6) code: language 'plain' and short pseudo-code, 7+) markdown: '## 예시' (one or more worked examples)."
      }
    ]
  }
}

`response_schemas.schemas`
{
  "type": "object",
  "required": ["title", "summary", "blocks"],
  "properties": {
    "title": { "type": "string", "minLength": 4 },
    "summary": { "type": "string", "minLength": 40 },
    "blocks": {
      "type": "array",
      "minItems": 6,
      "items": {
        "oneOf": [
          {
            "type": "object",
            "required": ["type", "markdown"],
            "properties": {
              "type": { "const": "markdown" },
              "markdown": { "type": "string", "minLength": 80 }
            },
            "additionalProperties": false
          },
          {
            "type": "object",
            "required": ["type", "language", "code"],
            "properties": {
              "type": { "const": "code" },
              "language": { "type": "string" },
              "code": { "type": "string", "minLength": 40 }
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

`ai_models.capabilities`
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