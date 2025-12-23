import { query } from "../config/db"

// ⚠️ 운영에서는 별도의 마이그레이션 도구를 사용하는 것을 권장합니다.
// 현재 프로젝트는 서비스 내부에서 최소한의 테이블 존재 여부를 보장하는 방식으로 구현합니다.
export async function ensureAiAccessSchema() {
  // uuid-ossp 확장 (uuid_generate_v4 사용을 위해)
  // 일부 환경에서는 미설치일 수 있어 방어적으로 생성합니다.
  await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)

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
      summary TEXT,
      function_name VARCHAR(255),
      function_call_id VARCHAR(255),
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      message_order INTEGER NOT NULL,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
}


