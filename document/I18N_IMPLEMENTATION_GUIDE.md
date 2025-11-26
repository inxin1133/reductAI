# 다국어 지원 (i18n) 구현 가이드

## 개요

이 문서는 마이크로 서비스 아키텍처에서 다국어 지원을 구현하는 방법을 설명합니다.

## 목차

1. [데이터베이스 스키마](#데이터베이스-스키마)
2. [서비스 레벨 구현](#서비스-레벨-구현)
3. [프론트엔드 구현](#프론트엔드-구현)
4. [API 설계](#api-설계)
5. [베스트 프랙티스](#베스트-프랙티스)

## 데이터베이스 스키마

### 주요 테이블

1. **languages** - 지원 언어 목록
2. **translation_namespaces** - 번역 네임스페이스 (서비스별/기능별 그룹화)
3. **translation_keys** - 번역 키 (예: `common.welcome`, `errors.not_found`)
4. **translations** - 실제 번역 텍스트
5. **user_language_preferences** - 사용자 언어 설정
6. **tenant_language_settings** - 테넌트 언어 설정
7. **translatable_content** - 번역 가능한 콘텐츠 추적

### 스키마 파일

`document/schema_i18n.sql` 파일을 참조하세요.

## 서비스 레벨 구현

### 1. i18n 서비스 생성

각 마이크로 서비스에 i18n 서비스를 추가합니다.

#### 예시: i18n.service.ts

```typescript
// services/shared/i18n/i18n.service.ts

import { Pool } from 'pg';
import { getTranslation } from './translation-queries';

export class I18nService {
  constructor(private db: Pool) {}

  /**
   * 번역 조회
   * @param namespace 번역 네임스페이스 (예: 'common', 'auth')
   * @param key 번역 키 (예: 'welcome.message')
   * @param languageCode 언어 코드 (예: 'ko', 'en')
   * @param params 번역 파라미터 (예: { name: 'John' })
   * @param fallbackLanguageCode 폴백 언어 코드 (기본: 'en')
   */
  async translate(
    namespace: string,
    key: string,
    languageCode: string,
    params?: Record<string, any>,
    fallbackLanguageCode: string = 'en'
  ): Promise<string> {
    // 1. 사용자 언어 설정 확인
    const userLanguage = await this.getUserLanguage(languageCode);
    
    // 2. 번역 조회
    let translation = await getTranslation(
      this.db,
      namespace,
      key,
      userLanguage
    );
    
    // 3. 폴백 언어로 재시도
    if (!translation && userLanguage !== fallbackLanguageCode) {
      translation = await getTranslation(
        this.db,
        namespace,
        key,
        fallbackLanguageCode
      );
    }
    
    // 4. 번역이 없으면 키 반환
    if (!translation) {
      console.warn(`Translation missing: ${namespace}.${key} (${userLanguage})`);
      return `${namespace}.${key}`;
    }
    
    // 5. 파라미터 치환
    return this.interpolate(translation, params);
  }

  /**
   * 사용자 언어 설정 조회
   */
  private async getUserLanguage(
    requestedLanguage: string
  ): Promise<string> {
    // 사용자 언어 설정 조회 로직
    // 우선순위: 사용자 설정 > 테넌트 설정 > 시스템 기본
    return requestedLanguage;
  }

  /**
   * 텍스트에 파라미터 삽입
   * 예: "Hello {name}" + { name: "John" } => "Hello John"
   */
  private interpolate(
    text: string,
    params?: Record<string, any>
  ): string {
    if (!params) return text;
    
    return text.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key] !== undefined ? String(params[key]) : match;
    });
  }

  /**
   * 복수형 처리
   */
  async translatePlural(
    namespace: string,
    key: string,
    count: number,
    languageCode: string
  ): Promise<string> {
    const translation = await this.translate(
      namespace,
      key,
      languageCode
    );
    
    // 언어별 복수형 규칙 적용
    return this.applyPluralRules(translation, count, languageCode);
  }

  private applyPluralRules(
    text: string,
    count: number,
    languageCode: string
  ): string {
    // 언어별 복수형 규칙 구현
    // 예: 영어는 count === 1 ? singular : plural
    return text;
  }
}
```

### 2. 미들웨어에서 언어 감지

#### 예시: language.middleware.ts

```typescript
// gateway/src/middleware/language.middleware.ts

import { Request, Response, NextFunction } from 'express';

export interface LanguageContext {
  language: string;
  fallbackLanguage: string;
}

export function languageMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // 1. Accept-Language 헤더에서 언어 추출
  const acceptLanguage = req.headers['accept-language'] || 'en';
  const preferredLanguage = parseAcceptLanguage(acceptLanguage);
  
  // 2. 쿼리 파라미터에서 언어 확인 (우선순위 높음)
  const queryLanguage = req.query.lang as string;
  
  // 3. 사용자 세션에서 언어 확인
  const sessionLanguage = req.user?.language;
  
  // 4. 최종 언어 결정 (우선순위: 쿼리 > 세션 > 헤더)
  const language = queryLanguage || sessionLanguage || preferredLanguage;
  
  // 5. 컨텍스트에 언어 정보 추가
  req.context = {
    ...req.context,
    language: language,
    fallbackLanguage: 'en'
  };
  
  next();
}

function parseAcceptLanguage(acceptLanguage: string): string {
  // Accept-Language 파싱 (예: "ko-KR,ko;q=0.9,en;q=0.8" => "ko")
  const languages = acceptLanguage
    .split(',')
    .map(lang => lang.split(';')[0].trim().toLowerCase());
  
  return languages[0] || 'en';
}
```

### 3. 서비스별 번역 사용

#### 예시: Auth Service

```typescript
// services/auth-service/src/controllers/auth.controller.ts

import { I18nService } from '@shared/i18n';

export class AuthController {
  constructor(private i18n: I18nService) {}

  async login(req: Request, res: Response) {
    const { email, password } = req.body;
    const language = req.context.language;
    
    // 사용자 인증 로직...
    
    if (!user) {
      const errorMessage = await this.i18n.translate(
        'auth',
        'errors.invalid_credentials',
        language
      );
      
      return res.status(401).json({
        error: errorMessage
      });
    }
    
    const successMessage = await this.i18n.translate(
      'auth',
      'messages.login_success',
      language,
      { name: user.name }
    );
    
    return res.json({
      message: successMessage,
      token: generateToken(user)
    });
  }
}
```

## 프론트엔드 구현

### 1. i18n 라이브러리 설정

#### React + react-i18next 예시

```typescript
// frontend/src/i18n/config.ts

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'auth', 'posts', 'errors'],
    
    backend: {
      loadPath: '/api/translations/{{lng}}/{{ns}}',
      allowMultiLoading: true,
    },
    
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupQuerystring: 'lang',
    },
    
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
```

### 2. 번역 파일 구조

```
frontend/src/locales/
├── en/
│   ├── common.json
│   ├── auth.json
│   ├── posts.json
│   └── errors.json
├── ko/
│   ├── common.json
│   ├── auth.json
│   ├── posts.json
│   └── errors.json
└── ...
```

#### 예시: common.json

```json
{
  "welcome": "Welcome",
  "hello": "Hello, {{name}}!",
  "buttons": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete"
  }
}
```

### 3. 컴포넌트에서 사용

```typescript
// frontend/src/components/LoginForm.tsx

import { useTranslation } from 'react-i18next';

export function LoginForm() {
  const { t, i18n } = useTranslation(['auth', 'common']);
  
  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    // API에 언어 변경 알림
    updateUserLanguagePreference(lang);
  };
  
  return (
    <div>
      <h1>{t('auth:login.title')}</h1>
      <input placeholder={t('auth:login.email_placeholder')} />
      <button>{t('common:buttons.save')}</button>
      
      <select onChange={(e) => changeLanguage(e.target.value)}>
        <option value="en">English</option>
        <option value="ko">한국어</option>
      </select>
    </div>
  );
}
```

## API 설계

### 1. 번역 조회 API

#### GET /api/translations/:language/:namespace

```typescript
// gateway/src/routes/translations.routes.ts

router.get('/translations/:language/:namespace', async (req, res) => {
  const { language, namespace } = req.params;
  
  // 번역 서비스 호출 또는 직접 DB 조회
  const translations = await translationService.getTranslations(
    namespace,
    language
  );
  
  res.json(translations);
});
```

#### GET /api/translations/:language/:namespace/:key

```typescript
router.get('/translations/:language/:namespace/:key', async (req, res) => {
  const { language, namespace, key } = req.params;
  const params = req.query; // 파라미터 (예: ?name=John)
  
  const translation = await translationService.translate(
    namespace,
    key,
    language,
    params
  );
  
  res.json({ translation });
});
```

### 2. 언어 설정 API

#### GET /api/user/language

```typescript
router.get('/user/language', authenticate, async (req, res) => {
  const userId = req.user.id;
  const tenantId = req.context.tenantId;
  
  const language = await userService.getUserLanguage(userId, tenantId);
  
  res.json({ language });
});
```

#### PUT /api/user/language

```typescript
router.put('/user/language', authenticate, async (req, res) => {
  const userId = req.user.id;
  const tenantId = req.context.tenantId;
  const { languageCode } = req.body;
  
  await userService.setUserLanguage(userId, tenantId, languageCode);
  
  res.json({ success: true });
});
```

### 3. 번역 관리 API (관리자용)

#### POST /api/admin/translations

```typescript
router.post('/admin/translations', authenticate, authorize('admin'), async (req, res) => {
  const { namespace, key, languageCode, value } = req.body;
  
  const translation = await translationService.createTranslation(
    namespace,
    key,
    languageCode,
    value
  );
  
  res.json(translation);
});
```

## 베스트 프랙티스

### 1. 번역 키 네이밍

✅ **좋은 예:**
- `common.buttons.save`
- `auth.errors.invalid_credentials`
- `posts.messages.created_successfully`

❌ **나쁜 예:**
- `saveButton`
- `error1`
- `msg`

### 2. 네임스페이스 구조

```
common/          # 공통 번역 (버튼, 레이블 등)
auth/            # 인증 관련
posts/           # 게시물 관련
errors/          # 에러 메시지
validation/      # 검증 메시지
ui/              # UI 컴포넌트
```

### 3. 파라미터 사용

```typescript
// 번역 텍스트: "Hello, {name}! You have {count} messages."
t('common:greeting', { 
  name: 'John', 
  count: 5 
})
// 결과: "Hello, John! You have 5 messages."
```

### 4. 복수형 처리

```typescript
// 영어: "You have {count} message" / "You have {count} messages"
// 한국어: "메시지 {count}개가 있습니다"

t('common:messages.count', { count: 1 }) // "You have 1 message"
t('common:messages.count', { count: 5 }) // "You have 5 messages"
```

### 5. 날짜/시간 포맷

```typescript
// 언어별 날짜 포맷
const date = new Date();
const formatted = new Intl.DateTimeFormat(language, {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
}).format(date);
```

### 6. 숫자 포맷

```typescript
// 언어별 숫자 포맷
const number = 1234.56;
const formatted = new Intl.NumberFormat(language, {
  style: 'currency',
  currency: 'USD'
}).format(number);
```

### 7. RTL (Right-to-Left) 지원

```css
/* CSS에서 텍스트 방향 처리 */
[dir="rtl"] {
  text-align: right;
}

[dir="ltr"] {
  text-align: left;
}
```

### 8. 성능 최적화

1. **번역 캐싱**: Redis에 번역 캐시
2. **번들 분할**: 언어별 번역 파일 분리
3. **지연 로딩**: 필요한 번역만 로드

```typescript
// 번역 캐싱 예시
const cacheKey = `translation:${namespace}:${key}:${language}`;
const cached = await redis.get(cacheKey);

if (cached) {
  return cached;
}

const translation = await getTranslationFromDB(...);
await redis.set(cacheKey, translation, 'EX', 3600); // 1시간 캐시

return translation;
```

## 마이크로 서비스별 구현

### Auth Service

```typescript
// services/auth-service/src/i18n/messages.ts

export const AUTH_MESSAGES = {
  LOGIN_SUCCESS: 'auth:messages.login_success',
  LOGIN_FAILED: 'auth:errors.invalid_credentials',
  LOGOUT_SUCCESS: 'auth:messages.logout_success',
};
```

### Post Service

```typescript
// services/post-service/src/i18n/messages.ts

export const POST_MESSAGES = {
  CREATED: 'posts:messages.created',
  UPDATED: 'posts:messages.updated',
  DELETED: 'posts:messages.deleted',
  NOT_FOUND: 'posts:errors.not_found',
};
```

## 테스트

### 단위 테스트

```typescript
describe('I18nService', () => {
  it('should translate with parameters', async () => {
    const result = await i18nService.translate(
      'common',
      'greeting',
      'en',
      { name: 'John' }
    );
    
    expect(result).toBe('Hello, John!');
  });
  
  it('should fallback to default language', async () => {
    const result = await i18nService.translate(
      'common',
      'greeting',
      'fr' // 프랑스어 번역이 없으면 영어로 폴백
    );
    
    expect(result).toBe('Hello!');
  });
});
```

## 모니터링

### 번역 누락 추적

```typescript
// 번역이 없을 때 로깅
if (!translation) {
  logger.warn('Translation missing', {
    namespace,
    key,
    language,
    timestamp: new Date()
  });
  
  // 모니터링 시스템에 알림
  metrics.increment('translation.missing', {
    namespace,
    key,
    language
  });
}
```

## 마이그레이션 가이드

### 기존 콘텐츠를 다국어로 전환

1. `translatable_content` 테이블에 기존 콘텐츠 등록
2. 번역 키 생성
3. 각 언어별 번역 추가
4. 애플리케이션 코드에서 번역 키 사용으로 변경

## 참고 자료

- [i18next 문서](https://www.i18next.com/)
- [react-i18next 문서](https://react.i18next.com/)
- [ISO 639 언어 코드](https://en.wikipedia.org/wiki/ISO_639)
- [ICU MessageFormat](https://formatjs.io/docs/core-concepts/icu-syntax/)

