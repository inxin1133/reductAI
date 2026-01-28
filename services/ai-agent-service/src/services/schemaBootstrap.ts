import { query } from "../config/db"
import { ensureSystemTenantId } from "./systemTenantService"

// ⚠️ 운영에서는 별도의 마이그레이션 도구를 사용하는 것을 권장합니다.
// 현재 프로젝트는 서비스 내부에서 최소한의 테이블 존재 여부를 보장하는 방식으로 구현합니다.
export async function ensureAiAccessSchema() {
  // uuid-ossp 확장 (uuid_generate_v4 사용을 위해)
  // 일부 환경에서는 미설치일 수 있어 방어적으로 생성합니다.
  await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)

  // ai_providers.name UNIQUE 제거 + provider_family 추가
  // - name은 업체명(표시용)으로 중복을 허용합니다. (예: OpenAI 아래에 ChatGPT/Sora/GPT Image 등 제품을 다중 등록)
  // - slug는 계속 UNIQUE(제품/엔드포인트 단위)로 유지합니다.
  // - provider_family는 라우팅/공용 credential의 "벤더 그룹 key" 입니다. (openai/anthropic/google/custom)
  await query(`
    DO $$
    DECLARE
      c RECORD;
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'ai_providers'
      ) THEN
        -- 1) name UNIQUE 제약 제거(자동 생성 이름 포함)
        FOR c IN
          SELECT conname, pg_get_constraintdef(oid) AS def
          FROM pg_constraint
          WHERE conrelid = 'public.ai_providers'::regclass
            AND contype = 'u'
        LOOP
          IF position('(name)' in replace(c.def, ' ', '')) > 0 THEN
            EXECUTE format('ALTER TABLE public.ai_providers DROP CONSTRAINT IF EXISTS %I', c.conname);
          END IF;
        END LOOP;

        -- 2) provider_family 컬럼 추가
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'ai_providers'
            AND column_name = 'provider_family'
        ) THEN
          ALTER TABLE public.ai_providers ADD COLUMN provider_family VARCHAR(50) NOT NULL DEFAULT 'custom';
        END IF;

        -- 3) 기존 row backfill
        -- - 신규 컬럼은 default 'custom'으로 채워질 수 있어, 'custom'도 backfill 대상으로 봅니다.
        UPDATE public.ai_providers
        SET provider_family =
          CASE
            WHEN lower(split_part(slug, '-', 1)) IN ('openai','anthropic','google') THEN lower(split_part(slug, '-', 1))
            WHEN lower(name) LIKE '%openai%' THEN 'openai'
            WHEN lower(name) LIKE '%anthropic%' THEN 'anthropic'
            WHEN lower(name) LIKE '%google%' THEN 'google'
            ELSE provider_family
          END
        WHERE
          (provider_family IS NULL OR btrim(provider_family) = '' OR lower(provider_family) = 'custom')
          AND (
            lower(split_part(slug, '-', 1)) IN ('openai','anthropic','google')
            OR lower(name) LIKE '%openai%'
            OR lower(name) LIKE '%anthropic%'
            OR lower(name) LIKE '%google%'
          );

      END IF;
    END $$;
  `)

  await query(`CREATE INDEX IF NOT EXISTS idx_ai_providers_provider_family ON ai_providers(provider_family);`)

  // ai_providers.display_name -> ai_providers.product_name (안전한 컬럼 rename)
  // - 기존 DB 호환을 위해 존재 여부를 확인한 후 rename 합니다.
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'ai_providers'
      ) THEN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'ai_providers'
            AND column_name = 'display_name'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'ai_providers'
            AND column_name = 'product_name'
        ) THEN
          ALTER TABLE ai_providers RENAME COLUMN display_name TO product_name;
        END IF;
      END IF;
    END $$;
  `)

  // ai_providers.logo_key 추가(안전한 컬럼 add)
  // - 로고는 이미지/바이너리를 DB에 저장하지 않고, "key 문자열"만 저장해 프론트에서 컴포넌트로 매핑합니다.
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'ai_providers'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ai_providers'
          AND column_name = 'logo_key'
      ) THEN
        ALTER TABLE ai_providers ADD COLUMN logo_key VARCHAR(100);
      END IF;
    END $$;
  `)

  // ai_models.capabilities 기본값/형태 마이그레이션
  // - 기존: [] 배열(기능 문자열 리스트) 형태를 많이 사용했음
  // - 변경: {} 객체 형태를 기본으로 권장(기능 플래그 + limits 같은 설정값까지 담기 위함)
  // - 기존 배열 데이터는 호환을 위해 { "features": [...] } 형태로 감쌉니다.
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'ai_models'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ai_models'
          AND column_name = 'capabilities'
      ) THEN
        -- 기본값을 객체로 변경
        ALTER TABLE ai_models ALTER COLUMN capabilities SET DEFAULT '{}'::jsonb;

        -- NULL이면 빈 객체로 정규화
        UPDATE ai_models
        SET capabilities = '{}'::jsonb
        WHERE capabilities IS NULL;

        -- 배열이면 객체로 래핑(features)
        UPDATE ai_models
        SET capabilities =
          CASE
            WHEN jsonb_typeof(capabilities) = 'array' AND jsonb_array_length(capabilities) = 0 THEN '{}'::jsonb
            WHEN jsonb_typeof(capabilities) = 'array' THEN jsonb_build_object('features', capabilities)
            ELSE capabilities
          END
        WHERE jsonb_typeof(capabilities) = 'array';
      END IF;
    END $$;
  `)

  // ai_models.sort_order 추가(드래그 정렬용)
  // - 타입별 모델 선택 박스 출력 순서를 위해 DB에 저장합니다.
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'ai_models'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ai_models'
          AND column_name = 'sort_order'
      ) THEN
        ALTER TABLE ai_models ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
      END IF;
    END $$;
  `)

  // 인덱스(존재 시 무시)
  await query(`CREATE INDEX IF NOT EXISTS idx_ai_models_sort_order ON ai_models(model_type, sort_order);`)

  // ai_models.model_type CHECK 제약 업데이트 (music 추가)
  // - CREATE TABLE에서 inline CHECK로 생성된 경우 constraint 이름이 자동 생성되어 환경마다 다를 수 있어,
  //   pg_get_constraintdef로 식별 후 drop → 우리가 관리하는 이름으로 재생성합니다.
  await query(`
    DO $$
    DECLARE
      c RECORD;
      has_new BOOLEAN := FALSE;
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'ai_models'
      ) THEN
        -- 기존 model_type 체크 제약 drop (자동 생성 이름 포함)
        FOR c IN
          SELECT conname, pg_get_constraintdef(oid) AS def
          FROM pg_constraint
          WHERE conrelid = 'public.ai_models'::regclass
            AND contype = 'c'
        LOOP
          -- pg_get_constraintdef는 IN 대신 ANY(ARRAY[...]) 형태로 나올 수 있어
          -- "model_type"을 참조하는 check면 대상으로 봅니다.
          IF position('model_type' in c.def) > 0 THEN
            -- 우리가 관리하는 새 제약이면 유지
            IF c.conname = 'chk_ai_models_model_type' AND c.def LIKE '%music%' THEN
              has_new := TRUE;
            ELSE
              EXECUTE format('ALTER TABLE public.ai_models DROP CONSTRAINT IF EXISTS %I', c.conname);
            END IF;
          END IF;
        END LOOP;

        -- 새 제약이 없으면 추가
        IF NOT has_new THEN
          ALTER TABLE public.ai_models
          ADD CONSTRAINT chk_ai_models_model_type
          CHECK (model_type IN ('text','image','audio','music','video','multimodal','embedding','code'));
        END IF;
      END IF;
    END $$;
  `)

  // 테넌트 유형별 모델 접근권한 테이블
  await query(`
    CREATE TABLE IF NOT EXISTS tenant_type_model_access (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_type VARCHAR(50) NOT NULL CHECK (tenant_type IN ('personal', 'team', 'enterprise')),
      model_id UUID NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
      credential_id UUID REFERENCES provider_api_credentials(id) ON DELETE SET NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
      access_level VARCHAR(50) DEFAULT 'standard' CHECK (access_level IN ('standard', 'premium', 'enterprise')),
      priority INTEGER DEFAULT 0,
      is_preferred BOOLEAN DEFAULT FALSE,
      rate_limit_per_minute INTEGER,
      rate_limit_per_day INTEGER,
      max_tokens_per_request INTEGER,
      allowed_features JSONB DEFAULT '[]',
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_type, model_id)
    );
  `)

  // 인덱스(존재 시 무시)
  await query(`CREATE INDEX IF NOT EXISTS idx_ttma_tenant_type ON tenant_type_model_access(tenant_type);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_ttma_model_id ON tenant_type_model_access(model_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_ttma_credential_id ON tenant_type_model_access(credential_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_ttma_status ON tenant_type_model_access(status);`)
  await query(
    `CREATE INDEX IF NOT EXISTS idx_ttma_preferred ON tenant_type_model_access(tenant_type, is_preferred) WHERE is_preferred = TRUE;`
  )
}

/**
 * Timeline(대화 히스토리) 저장용 스키마
 * - FrontAI/Timeline에서 생성되는 대화 스레드(threads)와 메시지(messages)를 저장합니다.
 * - "최근 대화가 위" 요구사항을 위해 threads.updated_at을 정렬 키로 사용합니다.
 */
export async function ensureTimelineSchema() {
  await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)

  

  // ✅ 기존 스키마(schema_models.sql)의 model_conversations/model_messages를 사용합니다.
  // - 다른 AI 기능(라우팅/토큰 집계/사용 로그 등)과 연결되는 확장성이 높기 때문입니다.
  // - 기존 테이블이 이미 존재한다면 IF NOT EXISTS로 인해 그대로 유지됩니다.

  await query(`
    CREATE TABLE IF NOT EXISTS model_conversations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      model_id UUID NOT NULL REFERENCES ai_models(id) ON DELETE RESTRICT,
      title VARCHAR(500),
      system_prompt TEXT,
      conversation_summary TEXT,
      conversation_summary_updated_at TIMESTAMP WITH TIME ZONE,
      conversation_summary_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      archived_at TIMESTAMP WITH TIME ZONE
    );
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS model_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      conversation_id UUID NOT NULL REFERENCES model_conversations(id) ON DELETE CASCADE,
      role VARCHAR(50) NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'function', 'tool')),
      content JSONB NOT NULL,
      content_text TEXT,
      summary TEXT,
      summary_tokens INTEGER DEFAULT 0,
      importance SMALLINT NOT NULL DEFAULT 0 CHECK (importance BETWEEN 0 AND 3),
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      segment_group VARCHAR(50) CHECK (segment_group IN ('normal', 'summary_material', 'retrieved')),
      function_name VARCHAR(255),
      function_call_id VARCHAR(255),
      status VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (status IN ('none', 'in_progress', 'success', 'failed', 'stopped')),
      input_tokens INTEGER DEFAULT 0,
      cached_input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      message_order INTEGER NOT NULL,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // 🔧 스키마 마이그레이션 (기존 content TEXT -> JSONB, summary 컬럼 추가)
  // - 기존 텍스트 데이터는 JSONB로 직접 캐스팅할 수 없으므로 {text: "..."} 형태로 보존합니다.
  // - 운영 환경에서는 정식 마이그레이션 도구 사용을 권장합니다.
  await query(`
    DO $$
    DECLARE
      content_type TEXT;
    BEGIN
      -- model_conversations: conversation_summary 필드 추가
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'model_conversations'
          AND column_name = 'conversation_summary'
      ) THEN
        ALTER TABLE model_conversations ADD COLUMN conversation_summary TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'model_conversations'
          AND column_name = 'conversation_summary_updated_at'
      ) THEN
        ALTER TABLE model_conversations ADD COLUMN conversation_summary_updated_at TIMESTAMP WITH TIME ZONE;
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'model_conversations'
          AND column_name = 'conversation_summary_tokens'
      ) THEN
        ALTER TABLE model_conversations ADD COLUMN conversation_summary_tokens INTEGER DEFAULT 0;
      END IF;

      -- model_messages: parent_message_id 추가 + self FK
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'model_messages'
          AND column_name = 'parent_message_id'
      ) THEN
        ALTER TABLE model_messages ADD COLUMN parent_message_id UUID;
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_model_messages_parent_message_id'
      ) THEN
        ALTER TABLE model_messages
        ADD CONSTRAINT fk_model_messages_parent_message_id
        FOREIGN KEY (parent_message_id) REFERENCES model_messages(id) ON DELETE SET NULL;
      END IF;

      -- model_messages: content_text 캐시
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'model_messages'
          AND column_name = 'content_text'
      ) THEN
        ALTER TABLE model_messages ADD COLUMN content_text TEXT;
      END IF;

      -- model_messages: status
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'model_messages'
          AND column_name = 'status'
      ) THEN
        ALTER TABLE model_messages ADD COLUMN status VARCHAR(20) DEFAULT 'none';
      END IF;
      -- backfill status for existing rows
      UPDATE model_messages
      SET status = CASE WHEN role = 'assistant' THEN 'success' ELSE 'none' END
      WHERE status IS NULL;
      -- ensure NOT NULL + check constraint
      ALTER TABLE model_messages ALTER COLUMN status SET DEFAULT 'none';
      ALTER TABLE model_messages ALTER COLUMN status SET NOT NULL;
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_model_messages_status'
      ) THEN
        ALTER TABLE model_messages
        ADD CONSTRAINT chk_model_messages_status
        CHECK (status IN ('none', 'in_progress', 'success', 'failed', 'stopped'));
      END IF;

      -- model_messages: summary_tokens/importance/is_pinned/segment_group/updated_at
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'model_messages'
          AND column_name = 'summary_tokens'
      ) THEN
        ALTER TABLE model_messages ADD COLUMN summary_tokens INTEGER DEFAULT 0;
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'model_messages'
          AND column_name = 'importance'
      ) THEN
        ALTER TABLE model_messages ADD COLUMN importance SMALLINT NOT NULL DEFAULT 0;
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_model_messages_importance_range'
      ) THEN
        ALTER TABLE model_messages
        ADD CONSTRAINT chk_model_messages_importance_range
        CHECK (importance BETWEEN 0 AND 3);
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'model_messages'
          AND column_name = 'is_pinned'
      ) THEN
        ALTER TABLE model_messages ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'model_messages'
          AND column_name = 'segment_group'
      ) THEN
        ALTER TABLE model_messages ADD COLUMN segment_group VARCHAR(50);
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_model_messages_segment_group'
      ) THEN
        ALTER TABLE model_messages
        ADD CONSTRAINT chk_model_messages_segment_group
        CHECK (segment_group IS NULL OR segment_group IN ('normal', 'summary_material', 'retrieved'));
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'model_messages'
          AND column_name = 'updated_at'
      ) THEN
        ALTER TABLE model_messages ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      END IF;

      -- summary 컬럼 추가(없으면)
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'model_messages'
          AND column_name = 'summary'
      ) THEN
        ALTER TABLE model_messages ADD COLUMN summary TEXT;
      END IF;

      -- cached_input_tokens 컬럼 추가(없으면)
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'model_messages'
          AND column_name = 'cached_input_tokens'
      ) THEN
        ALTER TABLE model_messages ADD COLUMN cached_input_tokens INTEGER DEFAULT 0;
      END IF;

      -- content 컬럼 타입 확인
      SELECT data_type INTO content_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'model_messages'
        AND column_name = 'content'
      LIMIT 1;

      -- content가 TEXT이면 안전하게 JSONB로 변환
      IF content_type = 'text' THEN
        -- 임시 컬럼 추가
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'model_messages'
            AND column_name = 'content_jsonb'
        ) THEN
          ALTER TABLE model_messages ADD COLUMN content_jsonb JSONB;
        END IF;

        -- 기존 텍스트를 {text: "..."} 형태로 보존
        UPDATE model_messages
        SET content_jsonb = jsonb_build_object('text', content)
        WHERE content_jsonb IS NULL;

        -- 기존 content(TEXT) 제거 후 rename
        ALTER TABLE model_messages DROP COLUMN content;
        ALTER TABLE model_messages RENAME COLUMN content_jsonb TO content;
        ALTER TABLE model_messages ALTER COLUMN content SET NOT NULL;
      END IF;
    END $$;
  `)

  await query(`CREATE INDEX IF NOT EXISTS idx_model_conversations_user_id ON model_conversations(user_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_conversations_tenant_id ON model_conversations(tenant_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_conversations_updated_at ON model_conversations(tenant_id, updated_at DESC);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_messages_conversation_id ON model_messages(conversation_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_messages_order ON model_messages(conversation_id, message_order);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_messages_parent_message_id ON model_messages(parent_message_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_messages_segment_group ON model_messages(conversation_id, segment_group);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_messages_importance ON model_messages(conversation_id, importance DESC);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_messages_is_pinned ON model_messages(conversation_id, is_pinned) WHERE is_pinned = TRUE;`)

  // model_messages.updated_at 자동 갱신 트리거 추가(없으면)
  // - update_updated_at_column 함수는 메인 스키마에서 생성되지만, 없을 수도 있어 방어적으로 생성합니다.
  // - (주의) DO $$ ... $$ 내부에서 동일한 $$를 중첩 사용하면 SQL 파싱이 깨질 수 있어, 함수 body는 $fn$으로 분리합니다.
  await query(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $fn$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $fn$ language 'plpgsql';
  `)

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_model_messages_updated_at'
          AND tgrelid = 'public.model_messages'::regclass
      ) THEN
        CREATE TRIGGER update_model_messages_updated_at
        BEFORE UPDATE ON model_messages
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
      END IF;
    END $$;
  `)
}

/**
 * 메시지 첨부 미디어 자산(message_media_assets)
 * - base64(data URL) 직접 저장을 피하고, 외부 스토리지로 분리하기 위한 메타 테이블
 * - v1 단계에서는 "db_proxy" 전략(서버가 DB에서 원본을 읽어 proxy 서빙)을 지원하고,
 *   이후 media-service + object storage(S3/GCS/R2)로 자연스럽게 확장 가능
 */
export async function ensureMessageMediaAssetsSchema() {
  await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)

  await query(`
    CREATE TABLE IF NOT EXISTS message_media_assets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      conversation_id UUID NOT NULL REFERENCES model_conversations(id) ON DELETE CASCADE,
      message_id UUID NOT NULL REFERENCES model_messages(id) ON DELETE CASCADE,

      kind VARCHAR(30) NOT NULL CHECK (kind IN ('image','audio','video','file')),
      mime VARCHAR(120),
      bytes BIGINT,
      sha256 VARCHAR(64),

      status VARCHAR(30) NOT NULL DEFAULT 'stored' CHECK (status IN ('pending','stored','failed')),

      storage_provider VARCHAR(30) NOT NULL DEFAULT 'db_proxy' CHECK (storage_provider IN ('db_proxy','local_fs','s3','gcs','r2','http')),
      storage_bucket VARCHAR(255),
      storage_key VARCHAR(1000),
      public_url TEXT,
      is_private BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMP WITH TIME ZONE,

      width INTEGER,
      height INTEGER,
      duration_ms INTEGER,

      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await query(`CREATE INDEX IF NOT EXISTS idx_message_media_assets_tenant ON message_media_assets(tenant_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_message_media_assets_message ON message_media_assets(message_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_message_media_assets_conversation ON message_media_assets(conversation_id, created_at DESC);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_message_media_assets_kind ON message_media_assets(kind);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_message_media_assets_sha256 ON message_media_assets(sha256);`)
}

/**
 * Model usage logs schema
 * - Admin "모델 사용 로그"에서 조회하는 테이블을 서비스 부팅 시 보장합니다.
 * - 본 프로젝트의 공식 스키마(document/schema_models.sql)의 일부를 필요한 최소 형태로 반영합니다.
 */
export async function ensureModelUsageLogsSchema() {
  await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)

  await query(`
    CREATE TABLE IF NOT EXISTS model_usage_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      model_id UUID NOT NULL REFERENCES ai_models(id) ON DELETE RESTRICT,
      credential_id UUID REFERENCES provider_api_credentials(id) ON DELETE SET NULL,
      service_id UUID REFERENCES services(id) ON DELETE SET NULL,
      token_usage_log_id UUID REFERENCES token_usage_logs(id) ON DELETE SET NULL,
      feature_name VARCHAR(100) NOT NULL,
      request_id VARCHAR(255) UNIQUE,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL,
      input_cost DECIMAL(10, 6) DEFAULT 0,
      cached_input_cost DECIMAL(10, 6) DEFAULT 0,
      output_cost DECIMAL(10, 6) DEFAULT 0,
      total_cost DECIMAL(10, 6) DEFAULT 0,
      currency VARCHAR(3) DEFAULT 'USD',
      response_time_ms INTEGER,
      status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'failure', 'error', 'timeout', 'rate_limited')),
      error_code VARCHAR(100),
      error_message TEXT,
      request_data JSONB,
      response_data JSONB,
      model_parameters JSONB,
      ip_address INET,
      user_agent TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // 기존 DB 마이그레이션: cached_input_* 컬럼 추가
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'model_usage_logs'
      ) THEN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'model_usage_logs'
            AND column_name = 'cached_input_tokens'
        ) THEN
          ALTER TABLE model_usage_logs ADD COLUMN cached_input_tokens INTEGER NOT NULL DEFAULT 0;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'model_usage_logs'
            AND column_name = 'cached_input_cost'
        ) THEN
          ALTER TABLE model_usage_logs ADD COLUMN cached_input_cost DECIMAL(10, 6) DEFAULT 0;
        END IF;
      END IF;
    END $$;
  `)

  await query(`CREATE INDEX IF NOT EXISTS idx_model_usage_logs_tenant_id ON model_usage_logs(tenant_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_usage_logs_user_id ON model_usage_logs(user_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_usage_logs_model_id ON model_usage_logs(model_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_usage_logs_credential_id ON model_usage_logs(credential_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_usage_logs_service_id ON model_usage_logs(service_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_usage_logs_feature_name ON model_usage_logs(feature_name);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_usage_logs_status ON model_usage_logs(status);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_usage_logs_created_at ON model_usage_logs(created_at);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_usage_logs_tenant_date ON model_usage_logs(tenant_id, created_at DESC);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_usage_logs_request_id ON model_usage_logs(request_id) WHERE request_id IS NOT NULL;`)
}

/**
 * Model routing rules schema
 * - Admin "모델 라우팅 규칙"에서 관리하는 테이블을 서비스 부팅 시 보장합니다.
 */
export async function ensureModelRoutingRulesSchema() {
  await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)

  await query(`
    CREATE TABLE IF NOT EXISTS model_routing_rules (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      scope_type VARCHAR(20) NOT NULL DEFAULT 'TENANT' CHECK (scope_type IN ('GLOBAL', 'ROLE', 'TENANT')),
      scope_id UUID NULL,
      rule_name VARCHAR(255) NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      conditions JSONB NOT NULL,
      target_model_id UUID NOT NULL REFERENCES ai_models(id) ON DELETE RESTRICT,
      fallback_model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
      is_active BOOLEAN DEFAULT TRUE,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // scope 확장 마이그레이션 (기존 row는 TENANT 스코프로 tenant_id -> scope_id)
  await query(`
    DO $$
    BEGIN
      -- 1) scope 확장 컬럼 추가
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'model_routing_rules'
          AND column_name = 'scope_type'
      ) THEN
        ALTER TABLE model_routing_rules
          ADD COLUMN scope_type VARCHAR(20) NOT NULL DEFAULT 'TENANT'
            CHECK (scope_type IN ('GLOBAL', 'ROLE', 'TENANT'));
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'model_routing_rules'
          AND column_name = 'scope_id'
      ) THEN
        ALTER TABLE model_routing_rules ADD COLUMN scope_id UUID NULL;
      END IF;

      -- 2) 기존 row들은 TENANT 스코프로 마이그레이션 (tenant_id -> scope_id)
      UPDATE model_routing_rules
      SET scope_type = 'TENANT'
      WHERE scope_type IS NULL;

      UPDATE model_routing_rules
      SET scope_id = tenant_id
      WHERE scope_type = 'TENANT' AND scope_id IS NULL;

      -- 3) scope 무결성 체크 (없으면 추가)
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_scope_id_required'
      ) THEN
        ALTER TABLE model_routing_rules
        ADD CONSTRAINT chk_scope_id_required
        CHECK (
          (scope_type = 'GLOBAL' AND scope_id IS NULL)
          OR (scope_type IN ('ROLE','TENANT') AND scope_id IS NOT NULL)
        );
      END IF;

      -- 4) unique 제약 확장
      ALTER TABLE model_routing_rules
      DROP CONSTRAINT IF EXISTS model_routing_rules_tenant_id_rule_name_key;
    END $$;
  `)

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_model_routing_rules_scope_rule_name
    ON model_routing_rules(scope_type, scope_id, rule_name);
  `)

  await query(`CREATE INDEX IF NOT EXISTS idx_model_routing_rules_tenant_id ON model_routing_rules(tenant_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_routing_rules_target_model_id ON model_routing_rules(target_model_id);`)
  await query(
    `CREATE INDEX IF NOT EXISTS idx_model_routing_rules_priority ON model_routing_rules(tenant_id, priority DESC) WHERE is_active = TRUE;`
  )
}

/**
 * Prompt templates schema
 * - Admin "프롬프트 템플릿"에서 관리하는 테이블을 서비스 부팅 시 보장합니다.
 */
export async function ensurePromptTemplatesSchema() {
  await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)

  await query(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      purpose VARCHAR(50) NOT NULL,
      body JSONB NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      is_active BOOLEAN DEFAULT TRUE,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_id, name, version)
    );
  `)

  await query(`CREATE INDEX IF NOT EXISTS idx_prompt_templates_tenant_id ON prompt_templates(tenant_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_prompt_templates_purpose ON prompt_templates(tenant_id, purpose);`)
  await query(
    `CREATE INDEX IF NOT EXISTS idx_prompt_templates_is_active ON prompt_templates(tenant_id, is_active) WHERE is_active = TRUE;`
  )

  // 기존 DB 마이그레이션: 컬럼 추가(필요 시)
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'prompt_templates'
      ) THEN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'prompt_templates'
            AND column_name = 'metadata'
        ) THEN
          ALTER TABLE prompt_templates ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'prompt_templates'
            AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE prompt_templates ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        END IF;
      END IF;
    END $$;
  `)

  // ai_models.prompt_template_id (prompt_templates 연결) 추가/보장
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'ai_models'
      ) AND EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'prompt_templates'
      ) THEN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'ai_models'
            AND column_name = 'prompt_template_id'
        ) THEN
          ALTER TABLE ai_models ADD COLUMN prompt_template_id UUID;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_ai_models_prompt_template_id'
        ) THEN
          ALTER TABLE ai_models
          ADD CONSTRAINT fk_ai_models_prompt_template_id
          FOREIGN KEY (prompt_template_id) REFERENCES prompt_templates(id) ON DELETE SET NULL;
        END IF;
      END IF;
    END $$;
  `)
}

/**
 * Response schemas schema
 * - 모델 출력 계약(JSON schema)을 DB에서 관리합니다.
 */
export async function ensureResponseSchemasSchema() {
  await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)

  await query(`
    CREATE TABLE IF NOT EXISTS response_schemas (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      strict BOOLEAN NOT NULL DEFAULT TRUE,
      schema JSONB NOT NULL,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, name, version)
    );
  `)

  await query(`CREATE INDEX IF NOT EXISTS idx_response_schemas_tenant_id ON response_schemas(tenant_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_response_schemas_name ON response_schemas(tenant_id, name);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_response_schemas_is_active ON response_schemas(tenant_id, is_active) WHERE is_active = TRUE;`)
  await query(`CREATE INDEX IF NOT EXISTS idx_response_schemas_schema_gin ON response_schemas USING GIN (schema);`)

  // 기본 계약 seed: block_json v1 (system tenant)
  // - 모델이 선택만 하면 즉시 response_format(json_schema) 강제에 사용할 수 있도록 미리 넣습니다.
  try {
    const tenantId = await ensureSystemTenantId()
    const blockJsonV1 = {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary", "blocks"],
      properties: {
        title: { type: "string" },
        summary: { type: "string" },
        blocks: {
          type: "array",
          items: {
            oneOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["type", "markdown"],
                properties: { type: { const: "markdown" }, markdown: { type: "string" } },
              },
              {
                type: "object",
                additionalProperties: false,
                required: ["type", "language", "code"],
                properties: {
                  type: { const: "code" },
                  language: { type: "string" },
                  code: { type: "string" },
                },
              },
              {
                type: "object",
                additionalProperties: false,
                required: ["type", "headers", "rows"],
                properties: {
                  type: { const: "table" },
                  headers: { type: "array", items: { type: "string" } },
                  rows: { type: "array", items: { type: "array", items: { type: "string" } } },
                },
              },
            ],
          },
        },
      },
    }

    await query(
      `
      INSERT INTO response_schemas
        (tenant_id, name, version, strict, schema, description, is_active)
      VALUES
        ($1, 'block_json', 1, TRUE, $2::jsonb, '기본 블록 JSON 출력 계약 (title/summary/blocks)', TRUE)
      ON CONFLICT (tenant_id, name, version)
      DO UPDATE SET
        strict = EXCLUDED.strict,
        schema = EXCLUDED.schema,
        description = EXCLUDED.description,
        is_active = EXCLUDED.is_active,
        updated_at = CURRENT_TIMESTAMP
      `,
      [tenantId, JSON.stringify(blockJsonV1)]
    )
  } catch (e) {
    console.warn("[response-schemas] seed failed:", e)
  }

  // ai_models.response_schema_id (response_schemas 연결) 추가/보장
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'ai_models'
      ) AND EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'response_schemas'
      ) THEN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'ai_models'
            AND column_name = 'response_schema_id'
        ) THEN
          ALTER TABLE ai_models ADD COLUMN response_schema_id UUID;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_ai_models_response_schema_id'
        ) THEN
          ALTER TABLE ai_models
          ADD CONSTRAINT fk_ai_models_response_schema_id
          FOREIGN KEY (response_schema_id) REFERENCES response_schemas(id) ON DELETE SET NULL;
        END IF;
      END IF;
    END $$;
  `)
}

/**
 * Prompt suggestions schema
 * - 채팅/생성 UI 하단에 노출할 "예시 프롬프트"를 DB에서 관리합니다.
 */
export async function ensurePromptSuggestionsSchema() {
  await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)

  await query(`
    CREATE TABLE IF NOT EXISTS prompt_suggestions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      scope_type VARCHAR(20) NOT NULL DEFAULT 'TENANT' CHECK (scope_type IN ('GLOBAL','ROLE','TENANT')),
      scope_id UUID NULL,
      model_type VARCHAR(50) NULL CHECK (model_type IN ('text','image','audio','music','video','multimodal','embedding','code')),
      model_id UUID NULL REFERENCES ai_models(id) ON DELETE SET NULL,
      title VARCHAR(100),
      text TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // scope 무결성: GLOBAL이면 scope_id NULL, ROLE/TENANT면 scope_id 필수
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'prompt_suggestions'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_prompt_suggestions_scope_id_required'
      ) THEN
        ALTER TABLE prompt_suggestions
        ADD CONSTRAINT chk_prompt_suggestions_scope_id_required
        CHECK (
          (scope_type = 'GLOBAL' AND scope_id IS NULL)
          OR (scope_type IN ('ROLE','TENANT') AND scope_id IS NOT NULL)
        );
      END IF;
    END $$;
  `)

  await query(`CREATE INDEX IF NOT EXISTS idx_prompt_suggestions_scope ON prompt_suggestions(scope_type, scope_id);`)
  await query(
    `CREATE INDEX IF NOT EXISTS idx_prompt_suggestions_tenant_active ON prompt_suggestions(tenant_id, is_active, sort_order);`
  )
  await query(`CREATE INDEX IF NOT EXISTS idx_prompt_suggestions_model ON prompt_suggestions(model_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_prompt_suggestions_model_type ON prompt_suggestions(model_type);`)
}

/**
 * Model API Profiles schema
 * - Provider/모달리티별 호출/응답 매핑을 DB에서 관리합니다.
 * - 최소 스펙 표준안: document/model_api_profiles_standard.md
 */
export async function ensureModelApiProfilesSchema() {
  await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)

  await query(`
    CREATE TABLE IF NOT EXISTS model_api_profiles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      provider_id UUID NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
      model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
      profile_key VARCHAR(120) NOT NULL,
      purpose VARCHAR(50) NOT NULL CHECK (purpose IN ('chat','image','video','audio','music','multimodal','embedding','code')),
      auth_profile_id UUID NULL,
      transport JSONB NOT NULL,
      response_mapping JSONB NOT NULL,
      workflow JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, provider_id, profile_key)
    );
  `)

  await query(`CREATE INDEX IF NOT EXISTS idx_model_api_profiles_tenant_provider_purpose ON model_api_profiles(tenant_id, provider_id, purpose, is_active);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_api_profiles_model_id ON model_api_profiles(model_id);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_model_api_profiles_profile_key ON model_api_profiles(tenant_id, profile_key);`)
}

/**
 * Seed default OpenAI Sora video profile (best-effort).
 * - Our runtime can execute video generation via model_api_profiles(purpose=video) using async_job workflow.
 * - This makes "video" usable out of the box for OpenAI providers. (In many setups the provider slug is just "openai",
 *   so relying on "sora" in product_name/slug is too strict and causes video to fall back to the legacy "not implemented" path.)
 *
 * NOTE: Provider video endpoints can differ by OpenAI version/gateway; this is a sane default that users can edit in Admin.
 */
export async function ensureDefaultSoraVideoProfiles() {
  try {
    const tenantId = await ensureSystemTenantId()

    // Find OpenAI providers (best-effort).
    const prov = await query(
      `
      SELECT id
      FROM ai_providers
      WHERE lower(provider_family) = 'openai'
      ORDER BY updated_at DESC NULLS LAST
      `,
      []
    )
    const providerIds = ((prov.rows || []) as Array<Record<string, unknown>>).map((r) => String(r.id || "")).filter(Boolean)
    if (!providerIds.length) return

    const profileKey = "openai_sora_video_v1"
    const transport = {
      kind: "http_json",
      method: "POST",
      path: "/videos",
      headers: { "Content-Type": "application/json", Authorization: "Bearer {{apiKey}}" },
      body: {
        model: "{{model}}",
        prompt: "{{userPrompt}}",
        seconds: "{{params_seconds}}",
        size: "{{params_size}}",
      },
      timeout_ms: 120000,
    }
    const responseMapping = { result_type: "raw_json", mode: "json", extract: { job_id_path: "id" } }
    const workflow = {
      type: "async_job",
      job_id_path: "id",
      steps: [
        {
          name: "poll",
          method: "GET",
          path: "/videos/{{job_id}}",
          interval_ms: 2000,
          max_attempts: 90,
          status_path: "status",
          terminal_states: ["completed", "failed", "canceled", "cancelled", "error"],
        },
        { name: "download", method: "GET", path: "/videos/{{job_id}}/content", mode: "binary", content_type: "video/mp4" },
      ],
    }

    for (const providerId of providerIds) {
      // If there is already any ACTIVE video profile for this provider (from previous installs),
      // don't introduce a competing default that could change runtime behavior.
      const existingActive = await query(
        `SELECT id, profile_key
         FROM model_api_profiles
         WHERE tenant_id = $1 AND provider_id = $2 AND purpose = 'video' AND is_active = TRUE
         ORDER BY updated_at DESC NULLS LAST
         LIMIT 5`,
        [tenantId, providerId]
      )
      const hasOtherActive = ((existingActive.rows || []) as Array<Record<string, unknown>>).some((r) => String(r.profile_key || "") !== profileKey)
      if (hasOtherActive) {
        // If we previously inserted our default, disable it to avoid overriding the existing config.
        await query(
          `UPDATE model_api_profiles
           SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = $1 AND provider_id = $2 AND profile_key = $3 AND is_active = TRUE`,
          [tenantId, providerId, profileKey]
        ).catch(() => null)
        continue
      }

      // If our profile exists (active or not), don't recreate.
      const exists = await query(
        `SELECT 1 FROM model_api_profiles WHERE tenant_id = $1 AND provider_id = $2 AND profile_key = $3 LIMIT 1`,
        [tenantId, providerId, profileKey]
      )
      if (exists.rows.length) {
        // Migration/cleanup for older installs:
        // - Remove optional input_reference from transport.body to avoid sending "" (provider validation error).
        await query(
          `
          UPDATE model_api_profiles
          SET transport =
            CASE
              WHEN jsonb_typeof(transport) = 'object' AND jsonb_typeof(transport->'body') = 'object'
              THEN jsonb_set(transport, '{body}', (transport->'body') - 'input_reference', true)
              ELSE transport
            END,
            updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1
            AND provider_id = $2
            AND profile_key = $3
          `,
          [tenantId, providerId, profileKey]
        ).catch(() => null)
        continue
      }
      await query(
        `
        INSERT INTO model_api_profiles
          (tenant_id, provider_id, model_id, profile_key, purpose, auth_profile_id, transport, response_mapping, workflow, is_active)
        VALUES
          ($1,$2,NULL,$3,'video',NULL,$4::jsonb,$5::jsonb,$6::jsonb,TRUE)
        `,
        [tenantId, providerId, profileKey, JSON.stringify(transport), JSON.stringify(responseMapping), JSON.stringify(workflow)]
      )
    }
  } catch (e) {
    console.warn("ensureDefaultSoraVideoProfiles failed (ignored):", e)
  }
}

/**
 * Provider auth profiles schema
 * - provider_api_credentials 위에 "인증 방식"을 추상화합니다.
 * - v1: api_key / oauth2_service_account(google vertex)
 */
export async function ensureProviderAuthProfilesSchema() {
  await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)

  await query(`
    CREATE TABLE IF NOT EXISTS provider_auth_profiles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      provider_id UUID NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
      profile_key VARCHAR(100) NOT NULL,
      auth_type VARCHAR(50) NOT NULL CHECK (auth_type IN ('api_key', 'oauth2_service_account', 'aws_sigv4', 'azure_ad')),
      credential_id UUID NOT NULL REFERENCES provider_api_credentials(id) ON DELETE RESTRICT,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      token_cache_key VARCHAR(255),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, provider_id, profile_key)
    );
  `)

  await query(`CREATE INDEX IF NOT EXISTS idx_provider_auth_profiles_tenant_provider_active ON provider_auth_profiles(tenant_id, provider_id, is_active);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_provider_auth_profiles_credential_id ON provider_auth_profiles(credential_id);`)

  // model_api_profiles.auth_profile_id FK (idempotent)
  await query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='model_api_profiles')
      AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='provider_auth_profiles')
      AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_model_api_profiles_auth_profile_id')
      THEN
        ALTER TABLE model_api_profiles
        ADD CONSTRAINT fk_model_api_profiles_auth_profile_id
        FOREIGN KEY (auth_profile_id) REFERENCES provider_auth_profiles(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `)
}


