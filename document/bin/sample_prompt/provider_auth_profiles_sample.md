## provider_auth_profiles 샘플 (v1: oauth2_service_account)

이 파일은 **Vertex 등 access token이 필요한 provider**만 대상으로 합니다.

> 전제
> - `ai_providers.slug`가 존재해야 합니다. (예: `google-vertex`)
> - `provider_api_credentials`에 “서비스 계정 JSON 문자열”이 **암호화되어** 저장되어 있어야 합니다.
>   - 현재 시스템은 `provider_api_credentials.api_key_encrypted`를 사용하므로, credential 생성 시 `api_key` 입력에 **서비스 계정 JSON 전체를 그대로** 넣는 방식으로 운용합니다.
> - 아래 SQL은 **system tenant**(공용 테넌트) 기준입니다. (`ensureSystemTenantId()`가 사용하는 tenant)

---

## 1) Google Vertex 서비스 계정 인증 프로필

### 권장 profile_key

```
google_vertex_sa_v1
```


### config 예시 (필수 키)
- `scopes`: 배열(권장) 또는 string
- `token_url`: 기본값은 `https://oauth2.googleapis.com/token`
- `project_id`, `location`: Vertex 호출에서 base_url/path에 사용

```json
{
  "scopes": ["https://www.googleapis.com/auth/cloud-platform"],
  "token_url": "https://oauth2.googleapis.com/token",
  "project_id": "YOUR_GCP_PROJECT_ID",
  "location": "us-central1"
}
```

### DB INSERT (UUID 몰라도 동작하도록 subquery 사용)

아래에서 `google-vertex` / `Vertex SA JSON`는 **본인 DB 값으로 바꾸세요**.

```sql
INSERT INTO provider_auth_profiles
  (tenant_id, provider_id, profile_key, auth_type, credential_id, config, token_cache_key, is_active)
VALUES
(
  (SELECT id FROM tenants WHERE slug = 'system' LIMIT 1),
  (SELECT id FROM ai_providers WHERE slug = 'google-vertex' LIMIT 1),
  'google_vertex_sa_v1',
  'oauth2_service_account',
  (
    SELECT c.id
    FROM provider_api_credentials c
    JOIN ai_providers p ON p.id = c.provider_id
    JOIN tenants t ON t.id = c.tenant_id
    WHERE t.slug = 'system'
      AND p.slug = 'google-vertex'
      AND c.credential_name = 'Vertex SA JSON'
      AND c.is_active = TRUE
    ORDER BY c.is_default DESC, c.created_at DESC
    LIMIT 1
  ),
  '{
    "scopes": ["https://www.googleapis.com/auth/cloud-platform"],
    "token_url": "https://oauth2.googleapis.com/token",
    "project_id": "YOUR_GCP_PROJECT_ID",
    "location": "us-central1"
  }'::jsonb,
  'google_vertex_sa_default',
  TRUE
)
ON CONFLICT (tenant_id, provider_id, profile_key)
DO UPDATE SET
  auth_type = EXCLUDED.auth_type,
  credential_id = EXCLUDED.credential_id,
  config = EXCLUDED.config,
  token_cache_key = EXCLUDED.token_cache_key,
  is_active = EXCLUDED.is_active,
  updated_at = CURRENT_TIMESTAMP;
```

