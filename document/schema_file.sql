-- ============================================
-- File/Media Asset Management Schema
-- S3 storage + CDN thumbnails + metadata + TTL
-- ============================================
--
-- Notes:
-- 1. Execute schema.sql and schema_tenant_membership.sql first.
-- 2. file_assets stores both AI-generated files and user attachments.
-- 3. Attachments should use TTL policies (expires_at).
-- 4. message_media_assets is included for reference/compatibility.
--
-- ============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. FILE ASSET TTL POLICIES
-- ============================================

CREATE TABLE IF NOT EXISTS file_asset_ttl_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    applies_to VARCHAR(30) NOT NULL DEFAULT 'attachment' CHECK (applies_to IN ('attachment', 'ai_generated', 'any')),
    ttl_seconds BIGINT NOT NULL CHECK (ttl_seconds > 0),
    grace_seconds BIGINT NOT NULL DEFAULT 0 CHECK (grace_seconds >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_file_asset_ttl_policies_tenant ON file_asset_ttl_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_file_asset_ttl_policies_active ON file_asset_ttl_policies(is_active);
CREATE INDEX IF NOT EXISTS idx_file_asset_ttl_policies_applies ON file_asset_ttl_policies(applies_to);

COMMENT ON TABLE file_asset_ttl_policies IS '파일 자산(TTL 정책) 관리 테이블 (주로 첨부파일용)';
COMMENT ON COLUMN file_asset_ttl_policies.id IS 'TTL 정책 고유 식별자 (UUID)';
COMMENT ON COLUMN file_asset_ttl_policies.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN file_asset_ttl_policies.name IS '정책 이름(예: 7일, 30일)';
COMMENT ON COLUMN file_asset_ttl_policies.applies_to IS '정책 적용 대상: attachment(첨부파일), ai_generated(AI 생성), any(모두)';
COMMENT ON COLUMN file_asset_ttl_policies.ttl_seconds IS 'TTL 기간(초 단위)';
COMMENT ON COLUMN file_asset_ttl_policies.grace_seconds IS '삭제 전 유예 기간(초 단위, 선택)';
COMMENT ON COLUMN file_asset_ttl_policies.is_active IS '정책 활성화 여부';
COMMENT ON COLUMN file_asset_ttl_policies.description IS '정책 설명';
COMMENT ON COLUMN file_asset_ttl_policies.metadata IS '추가 메타데이터 (JSON)';
COMMENT ON COLUMN file_asset_ttl_policies.created_at IS '생성 시각';
COMMENT ON COLUMN file_asset_ttl_policies.updated_at IS '수정 시각';

-- ============================================
-- 2. FILE ASSETS (AI GENERATED + ATTACHMENTS)
-- ============================================

CREATE TABLE IF NOT EXISTS file_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('ai_generated', 'attachment')),
    reference_type VARCHAR(50), -- e.g. message, post, profile
    reference_id UUID,

    kind VARCHAR(30) NOT NULL CHECK (kind IN ('image', 'audio', 'video', 'document', 'file')),
    mime VARCHAR(120),
    bytes BIGINT,
    original_filename TEXT,
    file_extension VARCHAR(20),
    sha256 VARCHAR(64),

    status VARCHAR(30) NOT NULL DEFAULT 'stored' CHECK (status IN ('pending', 'stored', 'failed', 'deleted')),

    storage_provider VARCHAR(30) NOT NULL DEFAULT 's3' CHECK (storage_provider IN ('s3', 'gcs', 'r2', 'local_fs', 'http')),
    storage_region VARCHAR(50),
    storage_bucket VARCHAR(255),
    storage_key VARCHAR(1000),
    storage_url TEXT,
    is_private BOOLEAN NOT NULL DEFAULT TRUE,

    cdn_url TEXT, -- CDN URL for original asset (optional)

    ttl_policy_id UUID REFERENCES file_asset_ttl_policies(id) ON DELETE SET NULL,
    expires_at TIMESTAMP WITH TIME ZONE,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_file_assets_tenant ON file_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_file_assets_user ON file_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_file_assets_source_type ON file_assets(source_type);
CREATE INDEX IF NOT EXISTS idx_file_assets_kind ON file_assets(kind);
CREATE INDEX IF NOT EXISTS idx_file_assets_sha256 ON file_assets(sha256);
CREATE INDEX IF NOT EXISTS idx_file_assets_storage_key ON file_assets(storage_key);
CREATE INDEX IF NOT EXISTS idx_file_assets_expires_at ON file_assets(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE file_assets IS 'S3에 저장되며, 선택적으로 CDN 배포 및 메타데이터를 포함하는 파일 자산 테이블입니다.';
COMMENT ON COLUMN file_assets.id IS '파일 자산의 고유 ID (UUID).';
COMMENT ON COLUMN file_assets.tenant_id IS '테넌트 ID (tenants 테이블 참조).';
COMMENT ON COLUMN file_assets.user_id IS '소유자 또는 업로더 사용자 ID (users 테이블 참조).';
COMMENT ON COLUMN file_assets.source_type IS '소스 유형: ai_generated(모델 생성) 또는 attachment(첨부파일).';
COMMENT ON COLUMN file_assets.reference_type IS '다른 도메인 엔티티와 연결되는 참조 타입.';
COMMENT ON COLUMN file_assets.reference_id IS '다른 도메인 엔티티에 대한 참조 ID.';
COMMENT ON COLUMN file_assets.kind IS '미디어 종류: image, audio, video, document, file.';
COMMENT ON COLUMN file_assets.mime IS 'MIME 타입 (예: image/png).';
COMMENT ON COLUMN file_assets.bytes IS '파일 크기(바이트 단위).';
COMMENT ON COLUMN file_assets.original_filename IS '원본 파일명 (제공된 경우).';
COMMENT ON COLUMN file_assets.file_extension IS '파일 확장자.';
COMMENT ON COLUMN file_assets.sha256 IS '중복 방지 및 무결성 확인을 위한 콘텐츠 해시값.';
COMMENT ON COLUMN file_assets.status IS '저장 상태: pending, stored, failed, deleted.';
COMMENT ON COLUMN file_assets.storage_provider IS '저장소 제공자: s3, gcs, r2, local_fs, http.';
COMMENT ON COLUMN file_assets.storage_region IS '저장소 리전(해당되는 경우).';
COMMENT ON COLUMN file_assets.storage_bucket IS '스토리지 버킷 명.';
COMMENT ON COLUMN file_assets.storage_key IS '스토리지 내 오브젝트 키/경로.';
COMMENT ON COLUMN file_assets.storage_url IS '직접 접근 가능한 저장소 URL(선택사항, 서명 또는 공개).';
COMMENT ON COLUMN file_assets.is_private IS '비공개 자산 여부(플래그).';
COMMENT ON COLUMN file_assets.cdn_url IS '원본 파일의 CDN URL(선택사항).';
COMMENT ON COLUMN file_assets.ttl_policy_id IS '첨부파일의 TTL 정책 ID.';
COMMENT ON COLUMN file_assets.expires_at IS 'TTL 만료 시각(삭제 예정).';
COMMENT ON COLUMN file_assets.metadata IS '추가 메타데이터(JSON 형식).';
COMMENT ON COLUMN file_assets.created_at IS '생성 시각.';
COMMENT ON COLUMN file_assets.updated_at IS '수정 시각.';

-- ============================================
-- 3. FILE ASSET THUMBNAILS (CDN)
-- ============================================

CREATE TABLE IF NOT EXISTS file_asset_thumbnails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_asset_id UUID NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE,
    variant VARCHAR(50) NOT NULL, -- e.g. sm, md, lg
    width INTEGER,
    height INTEGER,
    mime VARCHAR(120),
    bytes BIGINT,

    storage_provider VARCHAR(30) NOT NULL DEFAULT 's3' CHECK (storage_provider IN ('s3', 'gcs', 'r2', 'local_fs', 'http')),
    storage_bucket VARCHAR(255),
    storage_key VARCHAR(1000),
    cdn_url TEXT,

    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(file_asset_id, variant)
);

CREATE INDEX IF NOT EXISTS idx_file_asset_thumbnails_asset ON file_asset_thumbnails(file_asset_id);
CREATE INDEX IF NOT EXISTS idx_file_asset_thumbnails_variant ON file_asset_thumbnails(variant);
CREATE INDEX IF NOT EXISTS idx_file_asset_thumbnails_primary ON file_asset_thumbnails(file_asset_id, is_primary) WHERE is_primary = TRUE;

COMMENT ON TABLE file_asset_thumbnails IS 'CDN을 통해 제공되는 썸네일(미리보기) 변형 정보를 관리하는 테이블';
COMMENT ON COLUMN file_asset_thumbnails.id IS '썸네일의 고유 식별자(UUID)';
COMMENT ON COLUMN file_asset_thumbnails.file_asset_id IS '부모 파일 자산의 ID';
COMMENT ON COLUMN file_asset_thumbnails.variant IS '썸네일 변형/사이즈 레이블(ex: sm, md, lg)';
COMMENT ON COLUMN file_asset_thumbnails.width IS '썸네일 가로 픽셀(px)';
COMMENT ON COLUMN file_asset_thumbnails.height IS '썸네일 세로 픽셀(px)';
COMMENT ON COLUMN file_asset_thumbnails.mime IS '썸네일의 MIME 타입';
COMMENT ON COLUMN file_asset_thumbnails.bytes IS '썸네일 파일 크기(바이트 단위)';
COMMENT ON COLUMN file_asset_thumbnails.storage_provider IS '썸네일 원본 저장소 제공자';
COMMENT ON COLUMN file_asset_thumbnails.storage_bucket IS '썸네일이 저장된 버킷 명';
COMMENT ON COLUMN file_asset_thumbnails.storage_key IS '썸네일의 저장소 내 키/경로';
COMMENT ON COLUMN file_asset_thumbnails.cdn_url IS '썸네일의 CDN 접근 URL';
COMMENT ON COLUMN file_asset_thumbnails.is_primary IS '대표 썸네일 여부 플래그';
COMMENT ON COLUMN file_asset_thumbnails.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN file_asset_thumbnails.created_at IS '생성 일시';
COMMENT ON COLUMN file_asset_thumbnails.updated_at IS '수정 일시';

-- ============================================
-- 4. MESSAGE MEDIA ASSETS (OPTIONAL REFERENCE)
-- ============================================
-- This table mirrors schema_models.sql for message attachments.

CREATE TABLE IF NOT EXISTS message_media_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    conversation_id UUID NOT NULL REFERENCES model_conversations(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES model_messages(id) ON DELETE CASCADE,

    kind VARCHAR(30) NOT NULL CHECK (kind IN ('image','audio','video','file')),
    mime VARCHAR(120),
    bytes BIGINT,
    sha256 VARCHAR(64), -- content hash (dedupe/verify)

    status VARCHAR(30) NOT NULL DEFAULT 'stored' CHECK (status IN ('pending','stored','failed')),

    storage_provider VARCHAR(30) NOT NULL DEFAULT 'db_proxy' CHECK (storage_provider IN ('db_proxy','local_fs','s3','gcs','r2','http')),
    storage_bucket VARCHAR(255),
    storage_key VARCHAR(1000),
    public_url TEXT, -- public or signed URL (when using external storage)
    is_private BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE,

    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_message_media_assets_tenant ON message_media_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_message_media_assets_message ON message_media_assets(message_id);
CREATE INDEX IF NOT EXISTS idx_message_media_assets_conversation ON message_media_assets(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_media_assets_kind ON message_media_assets(kind);
CREATE INDEX IF NOT EXISTS idx_message_media_assets_sha256 ON message_media_assets(sha256);

COMMENT ON TABLE message_media_assets IS 'AI 대화(message)와 연결된 첨부 미디어(이미지/오디오/비디오/파일 등)의 메타데이터 및 저장 위치를 관리하는 테이블';
COMMENT ON COLUMN message_media_assets.id IS '미디어 자산의 고유 식별자 (UUID)';
COMMENT ON COLUMN message_media_assets.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN message_media_assets.user_id IS '첨부 파일 업로드/생성한 유저 ID (NULL일 수 있음)';
COMMENT ON COLUMN message_media_assets.conversation_id IS '연결된 대화 세션 ID (model_conversations 테이블 참조)';
COMMENT ON COLUMN message_media_assets.message_id IS '연결된 메시지 ID (model_messages 테이블 참조)';
COMMENT ON COLUMN message_media_assets.kind IS '미디어 종류(image, audio, video, file)';
COMMENT ON COLUMN message_media_assets.mime IS 'MIME 타입(ex: image/png, audio/mpeg 등)';
COMMENT ON COLUMN message_media_assets.bytes IS '파일 용량(byte 단위)';
COMMENT ON COLUMN message_media_assets.sha256 IS '콘텐츠 해시(SHA256, 중복 방지 및 검증)';
COMMENT ON COLUMN message_media_assets.status IS '미디어 데이터 저장 상태(pending, stored, failed)';
COMMENT ON COLUMN message_media_assets.storage_provider IS '저장소 유형(db_proxy, local_fs, s3, gcs, r2, http 등)';
COMMENT ON COLUMN message_media_assets.storage_bucket IS '스토리지 버킷 명(ex: S3/Google Cloud Storage 등)';
COMMENT ON COLUMN message_media_assets.storage_key IS '스토리지 내 고유 키/경로';
COMMENT ON COLUMN message_media_assets.public_url IS '공개 접근 URL(외부 스토리지/S3 presign 등)';
COMMENT ON COLUMN message_media_assets.is_private IS '비공개 여부(공개 URL이 없는 경우 TRUE)';
COMMENT ON COLUMN message_media_assets.expires_at IS '만료 시각(외부 인증/임시 URL의 경우)';
COMMENT ON COLUMN message_media_assets.width IS '이미지/비디오의 폭(px), 해당되는 경우';
COMMENT ON COLUMN message_media_assets.height IS '이미지/비디오의 높이(px), 해당되는 경우';
COMMENT ON COLUMN message_media_assets.duration_ms IS '오디오/비디오의 재생 길이(ms), 해당되는 경우';
COMMENT ON COLUMN message_media_assets.metadata IS '추가 메타데이터(JSONB, 모델/생성 파라미터 등)';
COMMENT ON COLUMN message_media_assets.created_at IS '자산 레코드 생성 시각';
COMMENT ON COLUMN message_media_assets.updated_at IS '자산 레코드 수정 시각';

-- ============================================
-- 5. TRIGGERS FOR UPDATED_AT
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $func$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $func$ language 'plpgsql';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_file_asset_ttl_policies_updated_at') THEN
        EXECUTE 'CREATE TRIGGER update_file_asset_ttl_policies_updated_at BEFORE UPDATE ON file_asset_ttl_policies
                 FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_file_assets_updated_at') THEN
        EXECUTE 'CREATE TRIGGER update_file_assets_updated_at BEFORE UPDATE ON file_assets
                 FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_file_asset_thumbnails_updated_at') THEN
        EXECUTE 'CREATE TRIGGER update_file_asset_thumbnails_updated_at BEFORE UPDATE ON file_asset_thumbnails
                 FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_message_media_assets_updated_at') THEN
        EXECUTE 'CREATE TRIGGER update_message_media_assets_updated_at BEFORE UPDATE ON message_media_assets
                 FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
    END IF;
END $$;
