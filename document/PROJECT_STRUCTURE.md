# 프로젝트 구조 (Microservices Architecture)

## 전체 아키텍처

```
reductai/
├── gateway/                    # API Gateway (진입점, 라우팅)
├── services/                   # 마이크로 서비스
│   ├── auth-service/          # 인증/권한 (RBAC, Session)
│   ├── user-service/          # 사용자 정보 (Users)
│   ├── tenant-service/        # 테넌트 및 서비스 관리
│   ├── billing-service/       # 구독, 결제, 멤버십
│   ├── post-service/          # 블록 에디터 게시판
│   ├── i18n-service/          # 다국어/번역 시스템
│   └── ai-agent-service/      # LLM 모델 및 에이전트
├── shared/                     # 공유 라이브러리 (Types, Utils, DB)
├── src/                        # Frontend (React/Vite) - 추후 frontend/로 이동 고려
└── document/                  # DB 스키마 및 설계 문서
```

## 서비스별 데이터베이스 스키마 매핑

### 1. Auth Service (`services/auth-service`)
**담당 기능:** 인증(Authentication), 인가(Authorization/RBAC), 감사(Audit)
**관리 테이블:**
- `roles`: 역할 정보
- `permissions`: 권한 정보
- `role_permissions`: 역할-권한 매핑
- `user_tenant_roles`: 사용자-테넌트별 역할 할당
- `user_sessions`: 사용자 세션 관리
- `audit_logs`: 중요 작업 감사 로그

### 2. User Service (`services/user-service`)
**담당 기능:** 사용자 프로필 및 기본 정보 관리
**관리 테이블:**
- `users`: 사용자 기본 정보

### 3. Tenant Service (`services/tenant-service`)
**담당 기능:** 테넌트 관리, 서비스 인스턴스 프로비저닝
**관리 테이블:**
- `tenants`: 테넌트 기본 정보
- `services`: 마이크로 서비스 정의 정보
- `service_instances`: 테넌트별 서비스 인스턴스
- `tenant_service_access`: 테넌트별 서비스 접근 권한

### 4. Billing Service (`services/billing-service`)
**담당 기능:** 구독, 결제, 사용량 추적, 멤버십 관리
**관리 테이블:**
- `subscription_plans`: 구독 플랜 정보
- `tenant_memberships`: 테넌트 멤버십 관계
- `tenant_invitations`: 테넌트 초대
- `tenant_subscriptions`: 테넌트 구독 상태
- `billing_accounts`: 과금 계정
- `billing_invoices`: 청구서
- `payment_transactions`: 결제 내역
- `usage_tracking`: 서비스 사용량 추적

### 5. Post Service (`services/post-service`)
**담당 기능:** 블록 에디터 기반 게시판, 콘텐츠 관리
**관리 테이블:**
- `board_categories`: 게시판 카테고리
- `posts`: 게시글 정보
- `post_blocks`: 블록 단위 콘텐츠
- `post_tags`, `post_tag_mappings`: 태그 관리
- `post_attachments`: 첨부 파일
- `post_comments`, `comment_likes`: 댓글 및 좋아요
- `post_likes`, `post_views`: 게시글 반응 및 조회수
- `post_revisions`: 수정 이력

### 6. I18n Service (`services/i18n-service`)
**담당 기능:** 다국어 지원, 번역 관리
**관리 테이블:**
- `languages`: 지원 언어
- `translation_namespaces`: 번역 키 그룹
- `translation_keys`: 번역 키
- `translations`: 번역 텍스트
- `user_language_preferences`: 사용자 언어 설정
- `tenant_language_settings`: 테넌트 언어 설정
- `translatable_content`: 번역 대상 콘텐츠
- `translation_history`: 번역 변경 이력

### 7. AI Agent Service (`services/ai-agent-service`)
**담당 기능:** LLM 연동, 프롬프트 관리, 사용량 제어
**관리 테이블:**
- `ai_providers`: AI 제공업체 (OpenAI, Anthropic 등)
- `ai_models`: AI 모델 정보
- `provider_api_credentials`: API 인증 정보
- `tenant_model_access`: 테넌트별 모델 접근 권한
- `model_usage_logs`: 모델 사용 로그
- `model_performance_metrics`: 성능 지표
- `model_routing_rules`: 모델 라우팅 규칙
- `model_conversations`: 대화 세션
- `model_messages`: 대화 메시지
