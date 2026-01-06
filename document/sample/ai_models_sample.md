# ai_models 입력내용

> 중요: `ai_models.capabilities`는 UI의 `ModelOptionsPanel`이 그대로 읽습니다.
> - `capabilities.options`: 사용자 입력 컨트롤 정의 (type: enum/int/number)
> - `capabilities.defaults`: 초기값
> - `capabilities.supports`: 특정 옵션을 숨기고 싶을 때 `{ "<optionKey>": false }` 로 사용
> - `capabilities.limits`: “헬퍼/검증 보조”용 숫자 제한 (예: max_images_per_request)

## 1️⃣.1 (OpenAI) ChatGPT - gpt-5-mini

### capabilities

```json
{
  "model": "gpt-5-mini",
  "limits": {
    "max_input_tokens": 200000,
    "max_output_tokens": 16384
  },
  "supports": {
    "temperature": true,
    "top_p": true,
    "json_schema": true,
    "system_role": true,
    "developer_role": true,
    "structured_outputs": true
  },
  "options": {
    "temperature": { "type": "number", "min": 0, "max": 2, "step": 0.1, "label": "temperature", "description": "창의성/랜덤성" },
    "top_p": { "type": "number", "min": 0, "max": 1, "step": 0.05, "label": "top_p", "description": "샘플링 누적 확률" }
  },
  "defaults": {
    "temperature": 0.2,
    "top_p": 1
  },
  "prompt_caching": true
}
```

### metadata

```json
{}
```

## 1️⃣.2 (OpenAI) ChatGPT - gpt-5.2

### capabilities

```json
{
  "model": "gpt-5.2",
  "limits": {
    "max_input_tokens": 200000,
    "max_output_tokens": 16384
  },
  "supports": {
    "temperature": true,
    "top_p": true,
    "json_schema": true,
    "system_role": true,
    "developer_role": true,
    "structured_outputs": true
  },
  "options": {
    "temperature": { "type": "number", "min": 0, "max": 2, "step": 0.1, "label": "temperature" },
    "top_p": { "type": "number", "min": 0, "max": 1, "step": 0.05, "label": "top_p" }
  },
  "defaults": {
    "temperature": 0.2,
    "top_p": 1
  },
  "prompt_caching": true
}
```

### metadata

```json
{
  "recommended_for": [
    "general_chat"
  ]
}
```


## 2️⃣.1 (google) Gemini - gemini-3-flash-preview

### capabilities

```json
{
  "model": "gemini-3-flash-preview",
  "limits": {
    "max_input_tokens": 1000000,
    "max_output_tokens": 8192
  },
  "supports": {
    "temperature": true,
    "top_p": true,
    "top_k": true
  },
  "options": {
    "temperature": { "type": "number", "min": 0, "max": 2, "step": 0.1, "label": "temperature" },
    "top_p": { "type": "number", "min": 0, "max": 1, "step": 0.05, "label": "top_p" },
    "top_k": { "type": "int", "min": 1, "max": 100, "label": "top_k" }
  },
  "defaults": {
    "temperature": 0.2,
    "top_p": 1,
    "top_k": 40
  }
}
```

### metadata

```json
{}
```

## 2️⃣.2 (google) Gemini - gemini-3-pro-preview

### capabilities

```json
{
  "model": "gemini-3-pro-preview",
  "limits": {
    "max_input_tokens": 1000000,
    "max_output_tokens": 8192
  },
  "supports": {
    "temperature": true,
    "top_p": true,
    "top_k": true
  },
  "options": {
    "temperature": { "type": "number", "min": 0, "max": 2, "step": 0.1, "label": "temperature" },
    "top_p": { "type": "number", "min": 0, "max": 1, "step": 0.05, "label": "top_p" },
    "top_k": { "type": "int", "min": 1, "max": 100, "label": "top_k" }
  },
  "defaults": {
    "temperature": 0.2,
    "top_p": 1,
    "top_k": 40
  }
}
```

### metadata

```json
{}
```

## 3️⃣ (OpenAI) GPT-image - gpt-image-1

### capabilities

```json
{
  "model": "gpt-image-1",
  "limits": {
    "max_images_per_request": 10
  },
  "supports": {
    "n": true,
    "size": true,
    "quality": true,
    "style": true,
    "background": true
  },
  "options": {
    "n": { "type": "int", "min": 1, "max": 10, "label": "n", "description": "요청 당 이미지 수" },
    "size": {
      "type": "enum",
      "values": ["256x256", "512x512", "1024x1024"],
      "label": "size"
    },
    "quality": { "type": "enum", "values": ["standard", "hd"], "label": "quality" },
    "style": { "type": "enum", "values": ["natural", "vivid"], "label": "style" },
    "background": { "type": "enum", "values": ["auto", "transparent", "opaque"], "label": "background" }
  },
  "defaults": {
    "n": 1,
    "size": "1024x1024",
    "quality": "standard",
    "style": "natural",
    "background": "auto"
  }
}
```

### metadata

```json
{}
```

## 4️⃣ (google) Vertex AI Lyria - lyria-002

### capabilities

```json
{
  "model": "lyria-002",
  "limits": {
    "max_duration_seconds": 60
  },
  "supports": {
    "duration_seconds": true
  },
  "options": {
    "duration_seconds": { "type": "int", "min": 5, "max": 60, "label": "duration_seconds", "description": "생성 길이(초)" }
  },
  "defaults": {
    "duration_seconds": 20
  }
}
```

## 5️⃣ (OpenAI) GPT-4o-tts - gpt-4o-mini-tts

### capabilities

```json
{
  "model": "gpt-4o-mini-tts",
  "limits": {},
  "supports": {
    "voice": true,
    "format": true,
    "speed": true
  },
  "options": {
    "voice": {
      "type": "enum",
      "values": ["alloy", "verse", "aria", "sage", "coral"],
      "label": "voice"
    },
    "format": {
      "type": "enum",
      "values": ["mp3", "wav", "opus", "aac", "flac"],
      "label": "format"
    },
    "speed": { "type": "number", "min": 0.25, "max": 4, "step": 0.05, "label": "speed" }
  },
  "defaults": {
    "voice": "alloy",
    "format": "mp3",
    "speed": 1
  }
}
```

### metadata

```json
{}
```

## 6️⃣ (OpenAI) Sora - sora-2

### capabilities

```json
{
  "model": "sora-2",
  "limits": {
    "max_duration_seconds": 20
  },
  "supports": {
    "duration_seconds": true,
    "fps": true,
    "resolution": true
  },
  "options": {
    "duration_seconds": { "type": "int", "min": 1, "max": 20, "label": "duration_seconds" },
    "fps": { "type": "int", "min": 12, "max": 60, "label": "fps" },
    "resolution": { "type": "enum", "values": ["480p", "720p", "1080p"], "label": "resolution" }
  },
  "defaults": {
    "duration_seconds": 6,
    "fps": 24,
    "resolution": "720p"
  }
}
```

### metadata

```json
{}
```