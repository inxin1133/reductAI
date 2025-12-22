import { query } from "../config/db"

// ⚠️ 운영에서는 별도의 마이그레이션 도구를 사용하는 것을 권장합니다.
// 현재 프로젝트는 서비스 내부에서 최소한의 테이블 존재 여부를 보장하는 방식으로 구현합니다.
export async function ensureAiAccessSchema() {
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


