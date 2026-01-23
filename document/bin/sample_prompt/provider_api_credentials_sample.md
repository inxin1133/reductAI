# provider_api_credentials.metadata 입력내용

> 중요:
> - `provider_api_credentials.metadata.last4`는 **서버가 생성/수정 시 자동으로 채웁니다**(마스킹 표시용).
> - `metadata`에는 **민감정보(키/토큰/SA private_key 등)를 넣지 않는 것을 권장**합니다.
> - Google Vertex(OAuth2 서비스 계정) 관련 설정(scopes/token_url/project_id/location 등)은
>   `provider_auth_profiles.config`에 두고, credential은 “서비스 계정 JSON 문자열(암호화 저장)”만 담는 구조가 맞습니다.

## 1️⃣ (OpenAI) ChatGPT (GPT-5 시리즈)


### metadata

```json
{
  "last4": "NIAA",
  "label": "prod",
  "note": "OpenAI API key (masked in UI)",
  "created_for": "ai-agent-service"
}
```


## 2️⃣ (google) Gemini 

### metadata

```json
{
  "last4": "szhI",
  "label": "prod",
  "note": "Gemini API key (x-goog-api-key)",
  "created_for": "ai-agent-service"
}
```

## 3️⃣ (google) Vertex AI

### metadata

```json
{
  "last4": "szhI",
  "label": "prod",
  "kind": "service_account_json",
  "note": "Service Account JSON is stored in api_key_encrypted. OAuth2 settings belong in provider_auth_profiles.config (google_vertex_sa_v1)."
}
```


