# Models & Pricing 스키마 검토

> 작성일: 2026-03-02  
> 대상: `schema_models.sql`, `schema_pricing.sql`

---

## 1. 전체 구조 요약

현재 시스템은 크게 **두 개의 스키마**로 나뉘어 있다.

### schema_models.sql — "모델 관리 + 사용 추적"

AI 제공업체, 모델, 인증, 대화 등 **운영 전반**을 담당한다.

```
ai_providers          → AI 제공업체 (OpenAI, Google, Anthropic 등)
  └── ai_models       → 각 제공업체의 모델들 (GPT-5.2, Gemini 3 Pro 등)
        ├── input_token_cost_per_1k   ← ⚠️ 여기에 단가가 있음
        └── output_token_cost_per_1k  ← ⚠️ 여기에도 단가가 있음
```

부가 테이블들:

| 테이블 | 역할 |
|--------|------|
| `provider_api_credentials` | 테넌트별 API 키 관리 (암호화 저장) |
| `provider_auth_profiles` | 인증 방식 추상화 (api_key, oauth2 등) |
| `tenant_model_access` | 테넌트별 모델 접근 권한/우선순위 |
| `model_routing_rules` | 조건 기반 자동 모델 선택 규칙 |
| `model_api_profiles` | Provider별 API 호출/응답 매핑 |
| `prompt_templates` | 재사용 가능한 프롬프트 템플릿 |
| `response_schemas` | 모델 출력 형식 계약 (JSON Schema) |
| `prompt_suggestions` | UI용 예시 프롬프트 |
| `ai_web_search_settings` | 웹검색 정책 (테넌트별) |
| `model_conversations` | 대화 세션 |
| `model_messages` | 대화 메시지 (input/output 토큰 기록) |
| `model_conversation_reads` | 대화 읽음 상태 |
| `model_performance_metrics` | 모델 성능 메트릭 |

### schema_pricing.sql — "요금 체계"

비용 계산과 마진을 관리하는 **독립적인 요금 시스템**이다.

| 테이블 | 역할 |
|--------|------|
| `pricing_rate_cards` | 요금표 버전 관리 (스냅샷). "2026년 3월 요금표 v1" 같은 개념 |
| `pricing_skus` | 과금 단위 정의. 모델+모달리티+사용종류별 SKU |
| `pricing_rates` | SKU별 실제 단가. 계층형 요금(tier) 지원 |
| `pricing_markup_rules` | 서비스 마진 규칙 (원가에 얼마를 더 붙일지) |
| `pricing_model_cost_summaries` | (뷰) 최종 사용자 노출용 가격 요약 |

---

## 2. 연결 관계 (데이터 흐름)

### 2.1 모델 관리 쪽 연결

```
ai_providers (제공업체)
  │
  ├──< ai_models (모델 목록)
  │     ├──< tenant_model_access (어떤 테넌트가 어떤 모델 쓸 수 있는지)
  │     ├──< model_routing_rules (자동 모델 선택 규칙)
  │     ├──< model_conversations (대화 세션)
  │     │     └──< model_messages (개별 메시지 + 토큰 기록)
  │     └──< model_performance_metrics (성능 지표)
  │
  ├──< provider_api_credentials (테넌트별 API 키)
  │     └──< provider_auth_profiles (인증 방식 프로필)
  │
  └──< model_api_profiles (API 호출 스펙)
```

### 2.2 요금 쪽 연결

```
pricing_rate_cards (요금표 v1, v2 ...)
  │
  └──< pricing_rates (SKU별 단가)
         │
         └── pricing_skus (과금 단위 정의)
               ├── provider_id → ai_providers (선택적 FK)
               └── model_id → ai_models (선택적 FK)

pricing_markup_rules (마진 규칙) → ai_models (선택적 FK)
```

### 2.3 두 스키마 사이의 연결

```
                schema_models.sql                    schema_pricing.sql
               ┌──────────────────┐                ┌──────────────────────┐
               │   ai_providers   │←── provider_id ──│   pricing_skus      │
               │   ai_models      │←── model_id ─────│                     │
               │                  │                   │   pricing_rates     │
               │  (cost_per_1k)   │    ← 중복! →     │   (rate_value)      │
               └──────────────────┘                └──────────────────────┘
```

**연결은 `pricing_skus`의 `provider_id`와 `model_id` FK를 통해 이루어진다.**  
다만 이 FK는 `LEFT JOIN`으로 삽입되어 NULL이 될 수 있다 (모델이 아직 등록 안 된 경우).  
대신 `provider_slug`와 `model_key` 문자열로도 식별 가능하게 설계되어 있다.

---

## 3. 비용 계산 흐름 (현재 상태)

사용자가 모델을 호출하면 아래 순서로 처리된다:

```
1. 사용자 요청 → model_messages에 기록 (input_tokens, output_tokens)
2. model_conversations.total_tokens 자동 업데이트 (트리거)
3. 비용 계산은...?
   ├── 방법 A: ai_models.input_token_cost_per_1k 사용 (calculate_model_usage_cost 함수)
   └── 방법 B: pricing_skus + pricing_rates 사용 (pricing 시스템)
```

**여기서 "어디를 기준으로 비용을 계산해야 하는가?"가 불명확하다.**

---

## 4. 발견된 문제점

### 문제 1: 비용 정보 이중 관리 (가장 중요)

**현재 비용이 두 곳에 저장되어 있다:**

| 위치 | 컬럼/테이블 | 용도 |
|------|------------|------|
| `ai_models` | `input_token_cost_per_1k`, `output_token_cost_per_1k` | 모델별 단가 직접 저장 |
| `pricing_skus` + `pricing_rates` | `rate_value` | SKU 기반 단가 + 계층형 요금 |

`ai_models`에도 단가가 있고, `pricing_rates`에도 단가가 있다.  
**이 두 값이 서로 다르면 어떤 걸 써야 하는지 알 수 없다.**

또한 `calculate_model_usage_cost()` 함수는 `ai_models`의 단가를 인자로 받도록 설계되어 있어서,  
pricing 시스템의 SKU/rate card를 전혀 참조하지 않는다.

**권장 방향:**  
- `pricing_skus` + `pricing_rates`를 **유일한 비용 기준(Single Source of Truth)**으로 삼는다.
- `ai_models.input_token_cost_per_1k` / `output_token_cost_per_1k`는 제거하거나, "참고용 표시 가격(관리자 UI에서 빠르게 보여주는 용도)"로만 쓴다고 명시적으로 역할을 한정한다.
- `calculate_model_usage_cost()` 함수를 pricing 시스템 기반으로 재작성한다.

-> 처리완료

---

### 문제 2: pricing_markup_rules에 tenant_id가 없음

현재 마진 규칙은 **모든 테넌트에 동일하게 적용**된다.

```sql
-- 현재 마진 시드 데이터
('text_margin', 'modality', 'text', 40, ...)   -- 텍스트 모달리티 40% 마진
('image_margin', 'modality', 'image', 30, ...) -- 이미지 모달리티 30% 마진
```

B2B SaaS에서 고객(테넌트)별로 다른 마진을 적용하고 싶다면 현재 구조로는 불가능하다.  
예를 들어 "A사는 마진 20%, B사는 마진 50%"를 설정할 수 없다.

**권장 방향:**
- 초기에 모든 테넌트 동일 마진이면 현재 구조도 OK.
- 향후 테넌트별 차등 과금이 필요하면 `tenant_id` 컬럼(nullable) 추가를 고려.

---

### 문제 3: Gemini 모델에 cached_input_tokens SKU 누락

OpenAI 모델들은 `cached_input_tokens` SKU가 있는데, Google 모델에는 없다:

```
✅ openai.gpt-5.2.text.cached_input
✅ openai.gpt-5-mini.text.cached_input
❌ google.gemini-3-pro.text.cached_input   ← 없음
❌ google.gemini-3-flash.text.cached_input ← 없음
```

Google API도 Context Caching을 지원하므로, 실제로 캐시된 입력 토큰이 발생할 수 있다.
지금 추가하거나, 해당 provider가 캐시를 지원하지 않는다면 의도적 누락임을 주석으로 명시하면 좋다.

---

### 문제 4: Whisper/TTS 초당 비용이 0

```sql
('openai.gpt-o4-mini-tts.audio.seconds', 0.00, ...)
('openai.whisper-1.audio.seconds', 0.00, ...)
```

초당 비용이 0으로 설정되어 있다. 실제로 OpenAI는 TTS/STT에 대해 별도 과금을 한다.
의도적 설정(토큰 기반으로만 과금하겠다)인지, 미설정 상태인지 명확히 해야 한다.

---

### 문제 5: pricing_model_cost_summaries 뷰의 한계

이 뷰는 **text 토큰만 조회**하고, image 토큰은 필터링한다:

```sql
WHERE s_in.usage_kind = 'input_tokens'
  AND s_in.unit = 'tokens'
  AND (s_in.token_category IS NULL OR s_in.token_category = 'text');
```

또한 **input/output 평균 비용**만 보여주는데, 실제 과금은 input과 output이 각각 다른 단가로 적용되므로 평균값은 실제 청구와 다를 수 있다.

**권장 방향:**
- 이 뷰의 용도를 "관리자 대시보드 참고용"으로 한정하고, 실제 과금 로직에는 사용하지 않는다.
- 또는 image token, video, audio 등 모든 모달리티를 포함하는 종합 뷰로 확장한다.

---

### 문제 6: ai_models.currency vs pricing_skus.currency

두 테이블 모두 `currency` 컬럼이 있고 기본값은 `USD`이다.
하지만 이론적으로 서로 다른 통화가 설정될 수 있다.
**비용의 Single Source of Truth를 pricing 쪽으로 통일하면 이 문제도 자연스럽게 해결된다.**

-> 처리 완료

---

## 5. 잘 설계된 부분

문제점만 있는 것은 아니다. 현재 구조에서 잘 된 점도 분명히 있다:

1. **Rate Card 버전 관리**: `pricing_rate_cards`로 요금표를 스냅샷/버전 관리할 수 있다. 요금 변경 시 기존 요금표는 'retired' 처리하고 새 버전을 만들면 된다. 과거 시점의 요금을 추적할 수 있어 좋다.

2. **SKU 기반 설계**: 모델마다 모달리티/사용종류별로 SKU를 분리한 것은 유연하다. 이미지 모델처럼 text token과 image token이 다른 단가를 가지는 경우를 잘 처리할 수 있다.

3. **계층형 요금(Tier)**: `pricing_rates`의 `tier_min`/`tier_max`로 사용량 구간별 차등 요금을 적용할 수 있다 (예: Gemini 3 Pro의 200K 토큰 기준 단가 차등).

4. **마진 규칙의 4단계 scope**: global → modality → model → model_usage 순서로 점점 구체적인 마진 규칙을 적용할 수 있다. 우선순위가 명확하다.

5. **모델 인증 추상화**: `provider_auth_profiles`로 api_key, oauth2, aws_sigv4 등 다양한 인증 방식을 지원할 수 있다.

---

## 6. 정리: 바로잡아야 할 것

| 우선순위 | 문제 | 조치 | 상태 |
|---------|------|------|------|
| **높음** | 비용 이중 관리 | `ai_models`에서 `input_token_cost_per_1k`, `output_token_cost_per_1k`, `currency` 컬럼 삭제. pricing 시스템이 유일한 비용 기준. | **완료** |
| **높음** | `calculate_model_usage_cost()` 함수 | pricing 시스템(`pricing_skus` + `pricing_rates`) 기반으로 재작성 완료. | **완료** |
| **높음** | 백엔드 비용 계산 | `chatController.ts`, `chatRuntimeController.ts`에서 `pricingService.ts`를 통해 pricing 테이블 조회로 전환. | **완료** |
| **높음** | Admin UI | `ModelManager.tsx`에서 cost/currency 폼 필드 제거. | **완료** |
| **높음** | 모델 CRUD API | `modelsController.ts`의 INSERT/UPDATE 쿼리에서 cost/currency 컬럼 제거. | **완료** |
| **중간** | Gemini cached_input SKU 누락 | 해당 SKU 추가 또는 의도적 누락 주석 추가 | 미처리 |
| **중간** | Whisper/TTS 초당 비용 0 | 실제 비용 확인 후 반영 | 미처리 |
| **낮음** | 뷰가 text token만 커버 | pricing_model_cost_summaries를 모든 모달리티 포함 뷰로 확장 | **완료** |
| **낮음** | markup_rules에 tenant_id 없음 | 당장은 OK, 테넌트별 차등 과금 필요 시 추가 | 미처리 |

### 변경된 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `document/schema_models.sql` | `ai_models` 테이블에서 3개 컬럼 제거, `calculate_model_usage_cost()` 함수 pricing 기반으로 재작성 |
| `services/pricing-service/migrations/002_drop_ai_models_cost_columns.sql` | DB 마이그레이션 (ALTER TABLE DROP COLUMN + 함수 교체) |
| `services/ai-agent-service/src/services/pricingService.ts` | **신규** — pricing 테이블에서 단가 조회 + 비용 계산 유틸리티 |
| `services/ai-agent-service/src/controllers/chatController.ts` | `resolveAiModelId()` 에서 cost 컬럼 제거, `pricingService` 사용으로 전환 |
| `services/ai-agent-service/src/controllers/chatRuntimeController.ts` | SELECT에서 cost 컬럼 제거, `pricingService` 사용으로 전환 |
| `services/ai-agent-service/src/controllers/modelsController.ts` | INSERT/UPDATE SQL에서 3개 컬럼 제거 |
| `src/pages/admin/ai/ModelManager.tsx` | AIModel 인터페이스, 폼 타입, 폼 UI에서 cost/currency 제거 |
| `document/schema_pricing.sql` | pricing_model_cost_summaries 뷰를 text+image 토큰 + image_gen/video/audio/web_search 단일단가 UNION으로 확장 |
| `services/pricing-service/migrations/003_expand_pricing_model_cost_summaries_view.sql` | **신규** — 뷰 확장 마이그레이션 |
| `services/pricing-service/src/controllers/pricingController.ts` | listPublicPrices SELECT에 usage_kind, token_category, unit_type, cost_per_unit, cost_per_unit_with_margin 추가 |
| `src/pages/admin/pricing/PublicPrices.tsx` | Unit, Cost/Unit 컬럼 추가, token/unit 혼합 행 표시 |

---

## 7. 현재 마진 시드 데이터 요약

| 모달리티 | 마진(%) | 의미 |
|---------|---------|------|
| global (기본) | 0% | 별도 규칙 없으면 마진 없음 |
| text | 40% | 텍스트 모델 사용 시 원가 대비 40% 마진 |
| code | 40% | 코드 모델 사용 시 40% 마진 |
| image | 30% | 이미지 모델 사용 시 30% 마진 |
| video | 30% | 비디오 모델 사용 시 30% 마진 |
| audio | 30% | 오디오 모델 사용 시 30% 마진 |
| web_search | 30% | 웹검색 사용 시 30% 마진 |

예시: GPT-5.2의 input 원가가 $1.75/1M tokens일 때,  
사용자에게 청구하는 가격 = $1.75 × 1.4 = **$2.45/1M tokens**

---

## 8. 시드 데이터에 등록된 모델별 단가

### 텍스트 모델 (단위: USD per 1M tokens)

| 모델 | Input | Cached Input | Output |
|------|-------|-------------|--------|
| GPT-5.2 | $1.75 | $0.175 | $14.00 |
| GPT-5 mini | $0.25 | $0.025 | $2.00 |
| Gemini 3 Pro (≤200K ctx) | $2.00 | - | $12.00 |
| Gemini 3 Pro (>200K ctx) | $4.00 | - | $18.00 |
| Gemini 3 Flash | $0.50 | - | $3.00 |

### 코드 모델

| 모델 | Input | Cached Input | Output |
|------|-------|-------------|--------|
| GPT-5.2-Codex | $1.75 | $0.175 | $14.00 |
| GPT-5.1-Codex | $1.25 | $0.125 | $10.00 |

### 이미지 모델 (GPT Image 1.5)

**토큰 기반 (per 1M tokens):**

| 종류 | Input | Cached Input | Output |
|------|-------|-------------|--------|
| Text tokens | $5.00 | $1.25 | $10.00 |
| Image tokens | $8.00 | $2.00 | $32.00 |

**이미지 생성 (per image):**

| 품질 | 1024x1024 | 1024x1536 |
|------|-----------|-----------|
| Low | $0.009 | $0.013 |
| Medium | $0.034 | $0.050 |
| High | $0.133 | $0.200 |

### 비디오 모델 (per second)

| 모델 | 720p | 1024x1792 |
|------|------|-----------|
| Sora 2 | $0.10 | - |
| Sora 2 Pro | $0.30 | $0.50 |

### 오디오 모델

| 모델 | Input (1M tok) | Cached (1M tok) | Output (1M tok) | Per Second |
|------|---------------|-----------------|-----------------|------------|
| GPT-o4 mini TTS | $1.10 | $0.28 | $4.40 | $0.00 ⚠️ |
| Whisper 1 (STT) | - | - | - | $0.00 ⚠️ |
| Google STT | - | - | - | $0.0001 |

### 웹검색

| 서비스 | Per Request |
|--------|------------|
| Serper | $0.001 |
