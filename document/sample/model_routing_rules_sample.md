# model_routing_rules 입력내용

> 중요: 현재 서버 런타임(`chatRuntimeController.ts`)에서 `conditions`로 평가하는 키는 아래 4개만입니다.
> - `feature`: 현재는 항상 `"chat"`로 들어갑니다.
> - `model_type`: `"text" | "image" | "audio" | "music" | "video" | ...`
> - `language`: `"ko" | "en" | "ja" | "zh" | ...`
> - `max_tokens`: number
>
> 지원 연산자(숫자 비교): `{ "max_tokens": { "$gte": 1200 } }` 처럼 `$lt/$lte/$gt/$gte`
>
> 위 4개 외 키를 `conditions`에 넣으면, ctx에 값이 없어서 **매칭이 실패**할 수 있습니다.
> (추가 정보는 `metadata`에 넣어두는 것을 권장합니다.)

## 1️⃣ (OpenAI) ChatGPT (GPT-5 시리즈)

### conditions

```json
{
  "feature": "chat",
  "model_type": "text",
  "max_tokens": { "$gte": 1200 }
}
```

### metadata

```json
{
  "intent": "documentation",
  "requires": {
    "schema_name": "block_json",
    "structured_output": true
  }
}
```


## 2️⃣ (google) Gemini (Gemini-3 시리즈)

### conditions

```json
{
  "feature": "chat",
  "model_type": "text",
  "max_tokens": { "$lt": 1200 }
}
```

### metadata

```json
{}
```

## 3️⃣ (OpenAI) GPT-image

### conditions

```json
{
  "feature": "chat",
  "model_type": "image"
}
```

### metadata

```json
{}
```


## 4️⃣ (google) Vertex AI Lyria

### conditions

```json
{
  "feature": "chat",
  "model_type": "music"
}
```

### metadata

```json
{}
```

## 5️⃣ (OpenAI) GPT-4o-tts (GPT-4o tts 시리즈)

### conditions

```json
{
  "feature": "chat",
  "model_type": "audio"
}
```

### metadata

```json
{}
```

## 6️⃣ (OpenAI) Sora 

### conditions

```json
{
  "feature": "chat",
  "model_type": "video"
}
```

### metadata

```json
{}
```