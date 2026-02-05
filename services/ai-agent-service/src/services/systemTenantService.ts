import { query } from "../config/db"

// provider_api_credentials 스키마는 tenant_id가 NOT NULL이라서,
// "서비스 전체 공용 API Key"를 저장하려면 내부적으로 시스템 테넌트를 하나 고정해서 사용합니다.
// - 운영 개념: 공용 키(Platform-wide)
// - DB 저장: tenant_id = systemTenantId (항상 동일)

const SYSTEM_TENANT_SLUG = "system"
const SYSTEM_TENANT_NAME = "System (Platform)"

export async function ensureSystemTenantId(): Promise<string> {
  // 1) 존재하면 그 ID 사용
  const existing = await query(
    `SELECT id FROM tenants WHERE slug = $1 AND deleted_at IS NULL LIMIT 1`,
    [SYSTEM_TENANT_SLUG]
  )
  if (existing.rows.length > 0) return existing.rows[0].id

  // 2) 없으면 생성 (owner_id는 NULL 허용)
  // tenant_type은 스키마 제약상 personal/team/group 중 선택해야 함
  const inserted = await query(
    `INSERT INTO tenants (owner_id, name, slug, tenant_type, status, metadata)
     VALUES (NULL, $1, $2, 'group', 'active', $3::jsonb)
     RETURNING id`,
    [SYSTEM_TENANT_NAME, SYSTEM_TENANT_SLUG, JSON.stringify({ system: true })]
  )
  return inserted.rows[0].id
}


