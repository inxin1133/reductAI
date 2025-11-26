# 프로젝트 구조 (Microservices Architecture)

## 전체 아키텍처

```
reductai/
├── gateway/                    # API Gateway
│   ├── src/
│   │   ├── routes/            # 라우팅 설정
│   │   ├── middleware/        # 인증, 권한, 로깅 등
│   │   ├── config/            # 게이트웨이 설정
│   │   └── main.ts            # 진입점
│   ├── package.json
│   └── Dockerfile
│
├── frontend/                   # 프론트엔드 애플리케이션
│   ├── src/
│   │   ├── components/        # 재사용 가능한 컴포넌트
│   │   ├── pages/            # 페이지 컴포넌트
│   │   ├── services/         # API 서비스 클라이언트
│   │   ├── store/            # 상태 관리
│   │   └── utils/            # 유틸리티 함수
│   ├── package.json
│   └── Dockerfile
│
├── services/                   # 마이크로 서비스들
│   ├── auth-service/          # 인증/권한 서비스
│   │   ├── src/
│   │   │   ├── controllers/  # 컨트롤러
│   │   │   ├── services/      # 비즈니스 로직
│   │   │   ├── models/       # 데이터 모델
│   │   │   ├── routes/       # API 라우트
│   │   │   ├── middleware/   # 서비스 미들웨어
│   │   │   ├── config/       # 설정
│   │   │   └── main.ts       # 진입점
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── .env.example
│   │
│   ├── tenant-service/        # 테넌트 관리 서비스
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── models/
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   ├── config/
│   │   │   └── main.ts
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── .env.example
│   │
│   ├── user-service/          # 사용자 관리 서비스
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── models/
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   ├── config/
│   │   │   └── main.ts
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── .env.example
│   │
│   ├── ai-search-service/     # AI 검색 서비스
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   │   ├── search.service.ts
│   │   │   │   └── token.service.ts  # 토큰 사용 관리
│   │   │   ├── models/
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   │   └── token-check.middleware.ts  # 토큰 체크
│   │   │   ├── config/
│   │   │   └── main.ts
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── .env.example
│   │
│   ├── post-service/          # 게시물 서비스
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   │   └── token.service.ts  # 토큰 사용 관리
│   │   │   ├── models/
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   │   └── token-check.middleware.ts
│   │   │   ├── config/
│   │   │   └── main.ts
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── .env.example
│   │
│   └── token-service/         # 토큰 관리 서비스 (중앙 관리)
│       ├── src/
│       │   ├── controllers/
│       │   │   ├── balance.controller.ts
│       │   │   ├── purchase.controller.ts
│       │   │   ├── usage.controller.ts
│       │   │   └── quota.controller.ts
│       │   ├── services/
│       │   │   ├── balance.service.ts
│       │   │   ├── purchase.service.ts
│       │   │   ├── usage.service.ts
│       │   │   ├── quota.service.ts
│       │   │   └── billing.service.ts
│       │   ├── models/
│       │   ├── routes/
│       │   ├── middleware/
│       │   ├── config/
│       │   └── main.ts
│       ├── package.json
│       ├── Dockerfile
│       └── .env.example
│
├── shared/                     # 공유 라이브러리
│   ├── types/                 # TypeScript 타입 정의
│   │   ├── user.types.ts
│   │   ├── tenant.types.ts
│   │   ├── token.types.ts
│   │   └── index.ts
│   ├── utils/                 # 공유 유틸리티
│   │   ├── logger.ts
│   │   ├── errors.ts
│   │   └── validation.ts
│   ├── database/              # 데이터베이스 클라이언트
│   │   ├── connection.ts
│   │   └── migrations/
│   └── package.json
│
├── document/                  # 문서 및 스키마
│   ├── schema.sql
│   ├── schema_tenant_membership.sql
│   ├── schema_blocks.sql
│   ├── schema_tokens.sql
│   └── README.md
│
├── docker-compose.yml         # 개발 환경 Docker Compose
├── docker-compose.prod.yml   # 프로덕션 환경 Docker Compose
├── .env.example              # 환경 변수 예시
├── .gitignore
└── README.md
```

## 서비스별 상세 구조

### 1. Gateway (API Gateway)

**역할:**
- 모든 클라이언트 요청의 진입점
- 라우팅 및 로드 밸런싱
- 인증/인가 처리
- 요청/응답 로깅
- Rate Limiting

**주요 파일:**
```
gateway/src/
├── routes/
│   ├── auth.routes.ts        # 인증 라우트
│   ├── tenant.routes.ts      # 테넌트 라우트
│   ├── user.routes.ts        # 사용자 라우트
│   ├── ai-search.routes.ts   # AI 검색 라우트
│   ├── post.routes.ts        # 게시물 라우트
│   └── token.routes.ts       # 토큰 라우트
├── middleware/
│   ├── auth.middleware.ts    # 인증 미들웨어
│   ├── tenant.middleware.ts  # 테넌트 컨텍스트 설정
│   ├── token-check.middleware.ts  # 토큰 사용량 체크
│   └── error-handler.middleware.ts
└── config/
    ├── gateway.config.ts
    └── service-registry.ts   # 서비스 레지스트리
```

### 2. Auth Service (인증/권한 서비스)

**역할:**
- 사용자 인증 (로그인, 로그아웃)
- JWT 토큰 발급/검증
- RBAC 권한 관리
- 역할 및 권한 CRUD

**주요 엔드포인트:**
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/refresh`
- `GET /roles`
- `POST /roles`
- `GET /permissions`

### 3. Tenant Service (테넌트 관리 서비스)

**역할:**
- 테넌트 CRUD
- 테넌트 멤버십 관리
- 테넌트 초대 관리
- 구독 관리

**주요 엔드포인트:**
- `GET /tenants`
- `POST /tenants`
- `GET /tenants/:id/members`
- `POST /tenants/:id/invitations`
- `GET /tenants/:id/subscription`

### 4. User Service (사용자 관리 서비스)

**역할:**
- 사용자 CRUD
- 사용자 프로필 관리
- 사용자 세션 관리

**주요 엔드포인트:**
- `GET /users`
- `POST /users`
- `GET /users/:id`
- `PUT /users/:id`
- `DELETE /users/:id`

### 5. AI Search Service (AI 검색 서비스)

**역할:**
- AI 기반 검색 기능 제공
- 토큰 사용량 추적
- 검색 결과 캐싱

**주요 엔드포인트:**
- `POST /search`
- `POST /search/semantic`
- `GET /search/history`

**토큰 사용:**
- 검색 요청마다 토큰 차감
- 검색 복잡도에 따라 토큰 수량 변동

### 6. Post Service (게시물 서비스)

**역할:**
- 게시물 CRUD
- 블록 에디터 콘텐츠 관리
- 댓글 관리
- 첨부 파일 관리

**주요 엔드포인트:**
- `GET /posts`
- `POST /posts`
- `GET /posts/:id`
- `PUT /posts/:id`
- `DELETE /posts/:id`
- `POST /posts/:id/comments`

**토큰 사용:**
- 이미지 생성/처리 시 토큰 차감
- AI 기반 콘텐츠 생성 시 토큰 차감

### 7. Token Service (토큰 관리 서비스)

**역할:**
- 토큰 잔액 관리
- 토큰 구매/충전 처리
- 토큰 사용량 추적
- 토큰 할당량 관리
- 후불 청구 처리

**주요 엔드포인트:**
- `GET /tokens/balance` - 잔액 조회
- `POST /tokens/purchase` - 토큰 구매
- `GET /tokens/usage` - 사용량 조회
- `POST /tokens/allocate` - 사용자에게 토큰 할당
- `GET /tokens/quotas` - 할당량 조회
- `POST /tokens/quotas` - 할당량 설정
- `POST /tokens/check` - 토큰 사용 가능 여부 체크 (내부 API)

## 토큰 시스템 통합

### 토큰 사용 플로우

1. **서비스에서 토큰 사용 요청**
   ```
   Client → Gateway → Service (AI Search/Post)
   Service → Token Service (토큰 체크 및 차감)
   Token Service → Database (잔액 업데이트)
   ```

2. **토큰 체크 미들웨어**
   ```typescript
   // services/ai-search-service/src/middleware/token-check.middleware.ts
   async function tokenCheck(req, res, next) {
     const { tenantId, userId } = req.context;
     const estimatedTokens = calculateTokenCost(req);
     
     // Token Service에 토큰 사용 가능 여부 확인
     const canUse = await tokenService.checkAndReserve(
       tenantId, 
       userId, 
       estimatedTokens
     );
     
     if (!canUse) {
       return res.status(402).json({ error: 'Insufficient tokens' });
     }
     
     req.tokenReservation = { tokens: estimatedTokens };
     next();
   }
   ```

3. **토큰 사용 후 차감**
   ```typescript
   // 서비스에서 작업 완료 후
   await tokenService.consume(
     req.tokenReservation.id,
     actualTokensUsed
   );
   ```

### 토큰 구매 플로우

1. **토큰 패키지 선택**
   ```
   Client → Gateway → Token Service
   GET /tokens/products
   ```

2. **토큰 구매**
   ```
   Client → Gateway → Token Service
   POST /tokens/purchase
   {
     productId: "uuid",
     paymentMethodId: "uuid"
   }
   ```

3. **결제 처리**
   ```
   Token Service → Billing Service
   결제 완료 후 → 토큰 잔액 업데이트
   ```

## 데이터베이스 스키마

스키마 파일 위치: `document/`

- `schema.sql` - 기본 스키마 (RBAC, 테넌트, 사용자, 서비스)
- `schema_tenant_membership.sql` - 멤버십 및 구독 관리
- `schema_blocks.sql` - 게시물 시스템
- `schema_tokens.sql` - 토큰 관리 시스템

## 환경 변수

각 서비스별 `.env.example` 파일 참조

**공통 환경 변수:**
- `DATABASE_URL` - 데이터베이스 연결 URL
- `REDIS_URL` - Redis 연결 URL (캐싱/세션)
- `JWT_SECRET` - JWT 시크릿 키
- `TOKEN_SERVICE_URL` - 토큰 서비스 URL

## 배포

### 개발 환경
```bash
docker-compose up
```

### 프로덕션 환경
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## 확장 가능성

새로운 서비스를 추가할 때:

1. `services/` 디렉토리에 새 서비스 폴더 생성
2. Gateway에 라우트 추가
3. Token Service와 통합 (토큰 사용이 필요한 경우)
4. 데이터베이스 스키마 확장 (필요한 경우)

