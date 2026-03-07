## 1. 관리자 페이지 설정 순서 (ADC 사용 시)

### ADC 사용 시 (provider_auth_profiles만 설정)

| 순서 | 메뉴 | 작업 |
|------|------|------|
| 1 | **AI 제공업체(ai_providers)** | Vertex AI provider 생성 (slug: `google-vertex`, api_base_url: `https://us-central1-aiplatform.googleapis.com/v1`) |
| 2 | **제공업체 인증 프로필(provider_auth_profiles)** | `auth_type=google_adc`, `config={ project_id, location }`, `credential_id`=NULL |
| 3 | **출력 계약(response_schemas)** | 비디오/음악용 스키마 생성 |
| 4 | **프롬프트 템플릿(prompt_templates)** | purpose=`video` / `music` 템플릿 생성 |
| 5 | **AI 모델 관리(ai_models)** | Veo 3.1, Lyria 2 모델 등록 |
| 6 | **모델 API 프로필(model_api_profiles)** | purpose=`video`/`music`, `auth_profile_id`=위에서 만든 ADC 프로필 |
| 7 | **모델 라우팅 규칙(model_routing_rules)** | (선택) video/music 타입 라우팅 |
| 8 | **플랜별 모델 접근(plan_model_access)** | Veo/Lyria 모델 접근 허용 |

### ADC 사용 시 설정하지 않는 것

- **AI API Key(provider_api_credentials)**: ADC 사용 시 credential 불필요.

---

## 2. 관리자 페이지별 상세

### 2.1 AI 제공업체 (`/admin/ai/providers`)

- **name**: `Vertex AI`
- **slug**: `google-vertex` (또는 `google`로 통합 시 기존과 구분)
- **api_base_url**: `https://us-central1-aiplatform.googleapis.com/v1`
- **provider_family**: `google`

### 2.2 제공업체 인증 프로필 (`/admin/ai/provider-auth-profiles`)

- **profile_key**: `google_vertex_adc_v1`
- **auth_type**: `google_adc`
- **credential_id**: (NULL 허용 시 비움)
- **config**:
  ```json
  {
    "project_id": "YOUR_GCP_PROJECT_ID",
    "location": "us-central1"
  }
  ```

### 2.3 모델 API 프로필 (`/admin/ai/model-api-profiles`)

**Veo 3.1 (video)**  
- purpose: `video`  
- profile_key: `google_veo_video_v1`  
- auth_profile_id: 위 ADC 프로필  
- transport / response_mapping / workflow: `veo-3.1.md` 참고  

**Lyria 2 (music)**  
- purpose: `music`  
- profile_key: `google_lyria_music_v1`  
- auth_profile_id: 동일 ADC 프로필  
- transport / response_mapping / workflow: `lyria-002.md` 참고  

### 2.4 AI 모델 관리 (`/admin/ai/models`)

- Veo 3.1: model_id=`veo-3.1-generate-preview`, model_type=`video`
- Lyria 2: model_id=`lyria-002`, model_type=`music`

---

