# response_schemas.schema 입력내용

> 중요:
> - 현재 런타임에서는 **OpenAI(text)** 호출 경로에서만 `response_schema_id`가 “강제 출력(json_schema)”로 활용됩니다.
> - Gemini/이미지/오디오/비디오/뮤직 등은 현재 v1 엔진에서 response schema 강제를 직접 쓰진 않지만,
>   `model_messages.content`에 저장되는 결과 구조와 일치하도록 schema를 미리 정의해두면 이후 확장(검증/계약화)에 유리합니다.

## 1️⃣ (OpenAI) ChatGPT

### schema

```json
{
  "type": "object",
  "required": [
    "title",
    "summary",
    "blocks"
  ],
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
      "items": {
        "oneOf": [
          {
            "type": "object",
            "required": [
              "type",
              "markdown"
            ],
            "properties": {
              "type": {
                "const": "markdown"
              },
              "markdown": {
                "type": "string",
                "minLength": 120,
                "description": "Markdown-formatted content block."
              }
            },
            "additionalProperties": false
          },
          {
            "type": "object",
            "required": [
              "type",
              "language",
              "code"
            ],
            "properties": {
              "type": {
                "const": "code"
              },
              "code": {
                "type": "string",
                "minLength": 120,
                "description": "Source code content."
              },
              "language": {
                "type": "string",
                "description": "Programming language of the code block."
              }
            },
            "additionalProperties": false
          },
          {
            "type": "object",
            "required": [
              "type",
              "headers",
              "rows"
            ],
            "properties": {
              "type": {
                "const": "table"
              },
              "headers": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "minItems": 2,
                "description": "Column headers of the table."
              },
              "rows": {
                "type": "array",
                "items": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "minItems": 2
                },
                "minItems": 8,
                "description": "Table row data."
              }
            },
            "additionalProperties": false
          }
        ]
      },
      "minItems": 6,
      "description": "An ordered list of content blocks composing the document."
    }
  },
  "additionalProperties": false
}
```


## 2️⃣ (google) Gemini

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
              "markdown": { "type": "string" }
            },
            "additionalProperties": false
          },
          {
            "type": "object",
            "required": ["type", "language", "code"],
            "properties": {
              "type": { "const": "code" },
              "language": { "type": "string" },
              "code": { "type": "string" }
            },
            "additionalProperties": false
          },
          {
            "type": "object",
            "required": ["type", "headers", "rows"],
            "properties": {
              "type": { "const": "table" },
              "headers": { "type": "array", "items": { "type": "string" }, "minItems": 2 },
              "rows": { "type": "array", "items": { "type": "array", "items": { "type": "string" }, "minItems": 2 }, "minItems": 2 }
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

## 3️⃣ (OpenAI) GPT-image

### schema

```json
{
  "type": "object",
  "required": ["title", "summary", "blocks", "images"],
  "properties": {
    "title": { "type": "string" },
    "summary": { "type": "string" },
    "blocks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "markdown"],
        "properties": {
          "type": { "const": "markdown" },
          "markdown": { "type": "string" }
        },
        "additionalProperties": false
      }
    },
    "images": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["url"],
        "properties": { "url": { "type": "string" } },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

## 4️⃣ (google) Vertex AI Lyria

### schema

```json
{
  "type": "object",
  "required": ["title", "summary", "blocks", "audio"],
  "properties": {
    "title": { "type": "string" },
    "summary": { "type": "string" },
    "blocks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "markdown"],
        "properties": {
          "type": { "const": "markdown" },
          "markdown": { "type": "string" }
        },
        "additionalProperties": false
      }
    },
    "audio": {
      "type": "object",
      "required": ["data_url"],
      "properties": {
        "mime": { "type": "string" },
        "data_url": { "type": "string" }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## 5️⃣ (OpenAI) GPT-4o-tts

### schema

```json
{
  "type": "object",
  "required": ["title", "summary", "blocks", "audio"],
  "properties": {
    "title": { "type": "string" },
    "summary": { "type": "string" },
    "blocks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "markdown"],
        "properties": {
          "type": { "const": "markdown" },
          "markdown": { "type": "string" }
        },
        "additionalProperties": false
      }
    },
    "audio": {
      "type": "object",
      "required": ["data_url"],
      "properties": {
        "mime": { "type": "string" },
        "data_url": { "type": "string" }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

## 6️⃣ (OpenAI) Sora

### schema

```json
{
  "type": "object",
  "required": ["title", "summary", "blocks", "video"],
  "properties": {
    "title": { "type": "string" },
    "summary": { "type": "string" },
    "blocks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "markdown"],
        "properties": {
          "type": { "const": "markdown" },
          "markdown": { "type": "string" }
        },
        "additionalProperties": false
      }
    },
    "video": {
      "type": "object",
      "required": ["data_url"],
      "properties": {
        "mime": { "type": "string" },
        "data_url": { "type": "string" }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```