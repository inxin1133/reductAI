# GPT-4o-mini-tts

`prompt_templates.body`
{
  "input": "{{input}}",
  "voice": "{{params_voice}}",
  "format": "{{params_format}}",
  "speed": "{{params_speed}}"
}


`response_schemas.schemas`
{
  "type": "object",
  "required": ["audio"],
  "additionalProperties": false,
  "properties": {
    "title": { "type": "string" },
    "summary": { "type": "string" },
    "blocks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "markdown"],
        "additionalProperties": false,
        "properties": {
          "type": { "const": "markdown" },
          "markdown": { "type": "string" }
        }
      }
    },
    "audio": {
      "type": "object",
      "required": ["mime", "data_url"],
      "additionalProperties": false,
      "properties": {
        "mime": { "type": "string" },
        "data_url": { "type": "string" }
      }
    }
  }
}


`ai_models.capabilities`
{
  "model": "gpt-4o-mini-tts",
  "limits": {
    "max_input_chars": 4096
  },
  "options": {
    "speed": {
      "max": 4,
      "min": 0.25,
      "step": 0.05,
      "type": "number",
      "label": "speed"
    },
    "voice": {
      "type": "enum",
      "label": "voice",
      "values": [
        "alloy",
        "ash",
        "ballad",
        "coral",
        "echo",
        "fable",
        "onyx",
        "nova",
        "sage",
        "shimmer",
        "verse",
        "marin",
        "cedar"
      ]
    },
    "format": {
      "type": "enum",
      "label": "format",
      "values": [
        "mp3",
        "wav",
        "opus",
        "aac",
        "flac",
        "pcm"
      ]
    },
    "instructions": {
      "type": "string",
      "label": "instructions",
      "maxLength": 500
    }
  },
  "defaults": {
    "speed": 1,
    "voice": "alloy",
    "format": "mp3"
  },
  "supports": {
    "speed": true,
    "voice": true,
    "format": true,
    "instructions": true
  }
}

// ----------------------------------------------------------

