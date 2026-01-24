# GPT-Sora-2

`prompt_templates.body`
{
  "model": "{{model}}",
  "prompt": "{{input}}\n\nVideo direction:\n- cinematic lighting\n- smooth camera movement\n- stable frame-to-frame (avoid flicker)\n- avoid artifacts, glitches\n- avoid text/letters/logos/watermarks",
  "seconds": "{{params_seconds}}",
  "size": "{{params_size}}"
}


`response_schemas.schemas`
{
  "type": "object",
  "required": ["title", "summary", "blocks", "video"],
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
    "video": {
      "type": "object",
      "required": ["id", "status"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string" },
        "status": { "type": "string" },
        "mime": { "type": "string" },
        "download_url": { "type": "string" },
        "data_url": { "type": "string" }
      }
    }
  }
}



`ai_models.capabilities`
{
  "model": "sora-2",
  "limits": {
    "max_duration_seconds": 12
  },
  "options": {
    "seconds": {
      "type": "int",
      "label": "seconds",
      "min": 4,
      "max": 12,
      "step": 4,
      "description": "Clip duration in seconds (API allowed values)."      
    },
    "size": {
      "type": "enum",
      "label": "size",
      "values": ["720x1280", "1280x720", "1024x1792", "1792x1024"],
      "description": "Output resolution formatted as width x height."
    }
  },
  "defaults": {
    "seconds": 4,
    "size": "720x1280"
  },
  "supports": {
    "seconds": true,
    "size": true
  }
}

IMPORTANT: 현재 reductai는 video 생성이 `model_api_profiles(purpose=video)`로 호출됩니다.
아래는 OpenAI(Sora) 계열을 위한 기본 프로필 예시입니다. (환경/버전에 따라 path/필드명이 다를 수 있어 필요시 조정하세요.)
`model_api_profiles` 
{
  "provider_family": "openai",
  "purpose": "video",
  "profile_key": "openai_sora_video_v1",
  "transport": {
    "kind": "http_json",
    "method": "POST",
    "path": "/videos",
    "headers": { "Content-Type": "application/json", "Authorization": "Bearer {{apiKey}}" },
    "body": {
      "model": "{{model}}",
      "prompt": "{{userPrompt}}",
      "seconds": "{{params_seconds}}",
      "size": "{{params_size}}"
    },
    "timeout_ms": 120000
  },
  "response_mapping": {
    "result_type": "raw_json",
    "mode": "json",
    "extract": { "job_id_path": "id" }
  },
  "workflow": {
    "type": "async_job",
    "job_id_path": "id",
    "steps": [
      { "name": "poll", "method": "GET", "path": "/videos/{{job_id}}", "interval_ms": 2000, "max_attempts": 90, "status_path": "status",
        "terminal_states": ["completed", "failed", "canceled", "cancelled", "error"] },
      { "name": "download", "method": "GET", "path": "/videos/{{job_id}}/content", "mode": "binary", "content_type": "video/mp4" }
    ]
  }
}

----------------------------------------------------------

