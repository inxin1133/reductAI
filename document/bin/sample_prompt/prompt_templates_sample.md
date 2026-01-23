# prompt_templates.body 입력내용

> 중요: `prompt_templates.body`는 **“LLM 호출 body의 일부(JSON object)”**로 저장됩니다.
> - 런타임에서 `model_api_profiles.transport.body`와 **JSON merge**되어 최종 요청 body가 됩니다. (template 쪽이 우선)
> - 따라서 여기에는 “별도 DSL(input/variables 등)”이 아니라, **각 Provider API가 실제로 받는 body 형태**를 넣어야 합니다.
> - 템플릿 변수는 `{{userPrompt}}`, `{{input}}`, `{{language}}`, `{{maxTokens}}`, `{{shortHistory}}`, `{{longSummary}}`, `{{params_<key>}}` 등을 사용할 수 있습니다.

## 1️⃣ (OpenAI) ChatGPT

### body

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You must output a single JSON object only. Do not include any extra text outside of JSON."
    },
    {
      "role": "developer",
      "content": "Goal: Produce a document-style response usable in real-world practice. Requirements: at least 6 blocks; include markdown, a table, and code blocks; write clearly and precisely without exaggeration."
    },
    {
      "role": "user",
      "content": "{{input}}"
    }
  ],
  "response_format": { "type": "json_object" }
}
```


## 2️⃣ (google) Gemini

### body

```json
{
  "systemInstruction": {
    "role": "system",
    "parts": [
      {
        "text": "You must output a single JSON object only. Do not include any extra text outside of JSON."
      }
    ]
  }
}
```

## 3️⃣ (OpenAI) GPT-image

### body

```json
{
  "prompt": "{{userPrompt}}\n\nStyle guide:\n- Keep composition clear and readable\n- Add rich visual details\n- Avoid text/letters/watermarks"
}
```

## 4️⃣ (google) Vertex AI Lyria

### body

```json
{
  "instances": [
    {
      "prompt": "{{userPrompt}}\n\nMusic direction:\n- coherent melody\n- clean mix\n- avoid abrupt noise"
    }
  ]
}
```

## 5️⃣ (OpenAI) GPT-4o-tts

### body

```json
{
  "voice": "{{params_voice}}",
  "format": "{{params_format}}"
}
```

## 6️⃣ (OpenAI) Sora

### body

```json
{
  "prompt": "{{userPrompt}}\n\nVideo direction:\n- cinematic lighting\n- smooth camera movement\n- avoid flicker and artifacts"
}
```