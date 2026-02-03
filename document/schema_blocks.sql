-- ============================================
-- Block Editor Based Board System
-- Multi-Tenant Compatible Schema with Subscription Support
-- PostgreSQL Database Schema
-- ============================================
--
-- 중요 안내사항:
-- 1. 이 스키마를 적용하기 전 schema.sql과 schema_tenant_membership.sql을 먼저 실행해야 합니다.
-- 2. 게시판 서비스는 services 테이블(schema.sql)에 등록되어야 합니다.
-- 3. 테넌트의 게시판 서비스 접근 권한은 tenant_service_access 테이블로 관리합니다.
-- 4. 구독 플랜의 게시판 관련 제한 사항은 features(JSONB) 필드에 정의할 수 있습니다:
--    - max_posts: 허용 가능한 게시글 최대 개수
--    - max_storage_gb: 첨부파일 최대 저장 용량(GB)
--    - max_categories: 허용 가능한 카테고리 최대 개수
--    - enable_advanced_features: 고급 블록 에디터 기능 활성화 여부 (boolean)
-- 5. 사용량 추적(usage tracking)은 usage_tracking 테이블(schema_tenant_membership.sql)을 활용하여 구현해야 하며,
--    metric_name 값으로는 'posts_count', 'storage_gb', 'categories_count' 등이 사용됩니다.
-- 6. 사용자는 게시글을 생성/수정하려면 활성화된 멤버십(tenant_memberships)이 있어야 합니다.
-- 7. 접근 허용 전에 구독 상태(tenant_subscriptions.status)를 반드시 확인해야 합니다.
-- 8. 페이지 계층구조: Notion 스타일의 하위 페이지 구조(무한 중첩)를 지원합니다.
--    - 페이지는 다른 페이지(parent_id)를 자식으로 가질 수 있습니다.
--    - 페이지는 콘텐츠 또는 카테고리(page_type)로 동작할 수 있습니다.
--    - get_page_path()를 통해 빵부스러기, get_page_tree()로 네비게이션이 가능합니다.
-- 9. 댓글과 좋아요: 사용자 참여 강화를 위해 댓글 및 좋아요 기능을 제공합니다.
--    - 댓글은 대댓글(계층 구조)를 지원합니다.
--    - 좋아요는 간단한 피드백 메커니즘을 제공합니다.
--    - 페이지별로 allow_comments 플래그를 사용해 댓글 기능을 비활성화할 수 있습니다.
--
-- ============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- (권장) ProseMirror 기반 블록 에디터 저장 전략 요약
-- ============================================
-- 목표(서버가 블록을 직접 이해/검색/부분수정):
-- - "문서 전체(JSON)"를 1개 컬럼에 저장하지 않고, 블록을 1급 엔티티(row)로 저장합니다.
-- - 각 블록의 인라인 리치텍스트는 ProseMirror JSON을 블록 content 안에 저장합니다(블록별 PM node/doc).
-- - 페이지 링크/임베드(내부 페이지/외부 URL)는 FK/별도 캐시 테이블로 무결성과 백링크 조회를 지원합니다.
--
-- NOTE:
-- - ProseMirror 스키마 버전이 바뀔 수 있으므로 블록/문서에 schema_version을 보관하는 것을 권장합니다.
--

-- ============================================
-- 1. BOARD CATEGORIES
-- ============================================

CREATE TABLE board_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL, -- 개인 카테고리 소유자 (개인 페이지용)
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- 개인 카테고리 소유자 (신규)
    category_type VARCHAR(50) NOT NULL DEFAULT 'board' CHECK (category_type IN ('board', 'personal_page', 'team_page')),
    parent_id UUID REFERENCES board_categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(100), -- 카테고리 아이콘 (이모지 또는 아이콘 이름)
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tenant_id, slug),
    CHECK (parent_id IS NULL OR parent_id != id)
);

CREATE INDEX idx_board_categories_tenant_id ON board_categories(tenant_id);
CREATE INDEX idx_board_categories_author_id ON board_categories(author_id);
CREATE INDEX idx_board_categories_user_id ON board_categories(user_id);
CREATE INDEX idx_board_categories_type ON board_categories(tenant_id, category_type);
CREATE INDEX idx_board_categories_parent_id ON board_categories(parent_id);
CREATE INDEX idx_board_categories_slug ON board_categories(tenant_id, slug);
CREATE INDEX idx_board_categories_display_order ON board_categories(tenant_id, display_order);

COMMENT ON TABLE board_categories IS '게시판 카테고리 정보를 관리하는 테이블. 계층 구조를 지원합니다. 플랜별 최대 카테고리 수 제한을 subscription_plans.features.max_categories에서 확인해야 합니다.';
COMMENT ON COLUMN board_categories.id IS '카테고리의 고유 식별자 (UUID)';
COMMENT ON COLUMN board_categories.tenant_id IS '카테고리가 속한 테넌트 ID (tenants 테이블 참조). 테넌트의 구독 상태를 확인해야 합니다.';
COMMENT ON COLUMN board_categories.parent_id IS '상위 카테고리 ID (NULL이면 최상위 카테고리)';
COMMENT ON COLUMN board_categories.name IS '카테고리 이름';
COMMENT ON COLUMN board_categories.slug IS '카테고리의 URL 식별 문자열 (같은 테넌트 내에서 고유)';
COMMENT ON COLUMN board_categories.description IS '카테고리 설명';
COMMENT ON COLUMN board_categories.display_order IS '카테고리 표시 순서 (낮은 값이 먼저 표시)';
COMMENT ON COLUMN board_categories.is_active IS '카테고리 활성화 여부';
COMMENT ON COLUMN board_categories.metadata IS '카테고리의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN board_categories.created_at IS '카테고리 생성 시각';
COMMENT ON COLUMN board_categories.updated_at IS '카테고리 정보 최종 수정 시각';

-- ============================================
-- 2. POSTS (게시글)
-- ============================================

CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES posts(id) ON DELETE CASCADE, -- 상위 페이지 ID (Notion 스타일 페이지 계층 구조)
    category_id UUID REFERENCES board_categories(id) ON DELETE SET NULL,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    page_type VARCHAR(50) DEFAULT 'post' CHECK (page_type IN ('page', 'post', 'category')), -- 페이지 타입
    excerpt TEXT,
    featured_image_url VARCHAR(500),
    cover_image_url VARCHAR(500), -- 커버 이미지 URL
    icon VARCHAR(100), -- 페이지 아이콘 (이모지 또는 아이콘 이름)
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived', 'deleted')),
    visibility VARCHAR(50) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'restricted')),
    is_pinned BOOLEAN DEFAULT FALSE,
    is_featured BOOLEAN DEFAULT FALSE,
    allow_comments BOOLEAN DEFAULT TRUE,
    child_count INTEGER DEFAULT 0, -- 하위 페이지 수 (자동 업데이트)
    page_order INTEGER DEFAULT 0, -- 페이지 표시 순서 (같은 부모 내에서의 순서)
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    published_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tenant_id, parent_id, slug), -- 같은 부모 내에서 slug 고유
    CHECK (parent_id IS NULL OR parent_id != id) -- 자기 자신을 부모로 설정 불가
);

CREATE INDEX idx_posts_tenant_id ON posts(tenant_id);
CREATE INDEX idx_posts_parent_id ON posts(parent_id);
CREATE INDEX idx_posts_category_id ON posts(category_id);
CREATE INDEX idx_posts_author_id ON posts(author_id);
CREATE INDEX idx_posts_slug ON posts(tenant_id, slug);
CREATE INDEX idx_posts_page_type ON posts(page_type);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_published_at ON posts(published_at) WHERE published_at IS NOT NULL;
CREATE INDEX idx_posts_is_pinned ON posts(tenant_id, is_pinned, created_at DESC) WHERE is_pinned = TRUE;
CREATE INDEX idx_posts_deleted_at ON posts(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_posts_page_order ON posts(parent_id, page_order) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_posts_child_count ON posts(child_count) WHERE child_count > 0;
CREATE INDEX idx_posts_parent_order ON posts(parent_id, page_order) WHERE parent_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_posts_root_pages ON posts(tenant_id, page_order) WHERE parent_id IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_posts_tenant_type ON posts(tenant_id, page_type) WHERE deleted_at IS NULL;

COMMENT ON TABLE posts IS '게시글/페이지 정보를 관리하는 테이블. 블록 에디터 형식의 콘텐츠이며, Notion 스타일의 페이지 계층 구조를 지원합니다. 작성자는 해당 테넌트의 활성 멤버십(tenant_memberships)을 가져야 합니다.';
COMMENT ON COLUMN posts.id IS '게시글/페이지의 고유 식별자 (UUID)';
COMMENT ON COLUMN posts.tenant_id IS '게시글이 속한 테넌트 ID (tenants 테이블 참조). 테넌트의 구독 상태와 게시판 서비스 접근 권한을 확인해야 합니다.';
COMMENT ON COLUMN posts.parent_id IS '상위 페이지 ID (posts 테이블 참조). NULL이면 최상위 페이지. Notion 스타일의 페이지 계층 구조를 지원하여 페이지 안에 페이지를 무한 중첩할 수 있습니다.';
COMMENT ON COLUMN posts.category_id IS '게시글이 속한 카테고리 ID (board_categories 테이블 참조, 레거시 지원)';
COMMENT ON COLUMN posts.author_id IS '게시글 작성자 ID (users 테이블 참조). 해당 테넌트의 활성 멤버십(tenant_memberships)이 있어야 하며, 멤버십 상태(membership_status)가 active여야 합니다.';
COMMENT ON COLUMN posts.title IS '게시글/페이지 제목';
COMMENT ON COLUMN posts.slug IS '게시글의 URL 식별 문자열 (같은 부모 페이지 내에서 고유)';
COMMENT ON COLUMN posts.page_type IS '페이지 타입: page(일반 페이지), post(게시글), category(카테고리). 페이지는 카테고리 역할도 할 수 있습니다.';
COMMENT ON COLUMN posts.excerpt IS '게시글 요약/발췌 내용';
COMMENT ON COLUMN posts.featured_image_url IS '대표 이미지 URL';
COMMENT ON COLUMN posts.cover_image_url IS '페이지 커버 이미지 URL';
COMMENT ON COLUMN posts.icon IS '페이지 아이콘 (이모지 또는 아이콘 이름, 예: 📄, 📝, 📊)';
COMMENT ON COLUMN posts.status IS '게시글 상태: draft(초안), published(발행), archived(보관), deleted(삭제)';
COMMENT ON COLUMN posts.visibility IS '게시글 공개 범위: public(공개), private(비공개), restricted(제한적)';
COMMENT ON COLUMN posts.is_pinned IS '게시글 고정 여부 (고정된 게시글은 상단에 표시)';
COMMENT ON COLUMN posts.is_featured IS '게시글 추천 여부';
COMMENT ON COLUMN posts.allow_comments IS '댓글 허용 여부';
COMMENT ON COLUMN posts.child_count IS '하위 페이지 수 (자동 업데이트, 트리거로 관리)';
COMMENT ON COLUMN posts.page_order IS '페이지 표시 순서 (같은 부모 내에서의 순서)';
COMMENT ON COLUMN posts.view_count IS '조회 수';
COMMENT ON COLUMN posts.like_count IS '좋아요 수 (캐시된 값)';
COMMENT ON COLUMN posts.comment_count IS '댓글 수 (캐시된 값)';
COMMENT ON COLUMN posts.published_at IS '게시글 발행 시각 (NULL이면 아직 발행되지 않음)';
COMMENT ON COLUMN posts.metadata IS '게시글의 추가 메타데이터 (JSON 형식, 예: SEO 정보, 커스텀 필드)';
COMMENT ON COLUMN posts.created_at IS '게시글 생성 시각';
COMMENT ON COLUMN posts.updated_at IS '게시글 최종 수정 시각';
COMMENT ON COLUMN posts.deleted_at IS '게시글 삭제 시각 (Soft Delete용, NULL이면 삭제되지 않음)';

-- ============================================
-- 2.1 EXTERNAL EMBEDS (외부 임베드 메타 캐시, 선택이지만 권장)
-- ============================================
-- 외부 URL 임베드(oEmbed/OpenGraph 등) 블록을 안정적으로 렌더링하기 위해,
-- 외부 URL의 메타 정보를 캐시해둡니다.
-- - blocks에서 url을 직접 들고 있어도 되지만, 캐시 테이블이 있으면 재조회/갱신/차단 처리에 유리합니다.
--
CREATE TABLE external_embeds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    canonical_url TEXT NOT NULL,
    provider VARCHAR(120), -- youtube, figma, twitter 등 (선택)
    oembed_json JSONB,     -- oEmbed 응답/메타 (선택)
    open_graph_json JSONB, -- OpenGraph 메타 (선택)
    status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','error')),
    fetched_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, canonical_url)
);

CREATE INDEX idx_external_embeds_tenant ON external_embeds(tenant_id);
CREATE INDEX idx_external_embeds_status ON external_embeds(tenant_id, status);

COMMENT ON TABLE external_embeds IS '외부 URL 임베드(oEmbed/OpenGraph) 메타데이터 캐시 테이블';
COMMENT ON COLUMN external_embeds.canonical_url IS '임베드 대상 외부 URL(정규화된 canonical URL 권장)';
COMMENT ON COLUMN external_embeds.oembed_json IS 'oEmbed 응답(JSON)';
COMMENT ON COLUMN external_embeds.open_graph_json IS 'OpenGraph 메타(JSON)';
COMMENT ON COLUMN external_embeds.status IS '임베드 상태(active/blocked/error)';

-- ============================================
-- 3. POST BLOCKS (블록 에디터의 블록 단위)
-- ============================================

CREATE TABLE post_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    -- Notion 스타일 중첩: parent_block_id가 NULL이면 top-level block
    parent_block_id UUID REFERENCES post_blocks(id) ON DELETE CASCADE, -- 중첩된 블록 지원 (예: 리스트 아이템)

    -- 블록 타입: 서버가 이해하는 1급 타입 (예: paragraph/heading/image/table/page_link/page_embed/external_embed 등)
    block_type VARCHAR(100) NOT NULL,

    -- 정렬 키: insert/reorder를 위해 정수 대신 "간격이 있는" 값 사용 권장
    -- - app에서 (이전+다음)/2 같은 방식으로 중간 삽입 가능
    -- - 동일 컨테이너(=같은 post + 같은 parent_block) 내에서 유니크해야 함
    sort_key NUMERIC(24, 12) NOT NULL,

    -- 블록 본문(JSON): ProseMirror node/doc(인라인 리치텍스트 포함) + 타입별 속성/스타일/설정
    -- 예:
    -- - paragraph: {"pm":{"type":"doc","content":[...]}, "align":"left"}
    -- - heading:   {"level":2,"pm":{...}}
    -- - image:     {"asset_id":"...","caption_pm":{...}}
    content JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- 검색/리스트 성능용 캐시(선택): content에서 텍스트를 추출해 저장 (PM doc에서 plain text)
    content_text TEXT,

    -- Full-text search용(선택): content_text 기반 tsvector 캐시 (쿼리 성능/정렬에 유리)
    search_vector tsvector,

    -- 페이지 링크/임베드(내부): 링크/임베드 대상 페이지를 FK로 보관하여 무결성/백링크 조회를 지원
    ref_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,

    -- 외부 임베드(선택): external_embeds 캐시를 FK로 연결
    external_embed_id UUID REFERENCES external_embeds(id) ON DELETE SET NULL,

    -- Soft delete / archive (Notion 스타일)
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,

    -- ProseMirror 스키마 버전(호환성 관리)
    pm_schema_version INTEGER NOT NULL DEFAULT 1,

    -- 편집자 추적(선택)
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CHECK (parent_block_id IS NULL OR parent_block_id != id)
);

CREATE INDEX idx_post_blocks_post_id ON post_blocks(post_id);
CREATE INDEX idx_post_blocks_block_type ON post_blocks(block_type);
CREATE INDEX idx_post_blocks_parent_block_id ON post_blocks(parent_block_id);
CREATE INDEX idx_post_blocks_parent_sort ON post_blocks(post_id, parent_block_id, sort_key);
CREATE INDEX idx_post_blocks_ref_post_id ON post_blocks(ref_post_id);
CREATE INDEX idx_post_blocks_external_embed_id ON post_blocks(external_embed_id);
CREATE INDEX idx_post_blocks_is_deleted ON post_blocks(post_id, is_deleted) WHERE is_deleted = FALSE;

-- 동일 컨테이너(=post + parent_block) 내에서 sort_key 유니크 보장
-- - parent_block_id가 NULL(top-level)인 경우, 컨테이너 키로 post_id를 사용
CREATE UNIQUE INDEX uq_post_blocks_container_sort_key
  ON post_blocks(post_id, COALESCE(parent_block_id, post_id), sort_key);

-- JSONB 검색 가속(필요 시)
CREATE INDEX idx_post_blocks_content_gin ON post_blocks USING GIN (content);

-- Full-text search 가속(선택): content_text 기반
CREATE INDEX idx_post_blocks_search_vector ON post_blocks USING GIN (search_vector);

COMMENT ON TABLE post_blocks IS '게시글의 블록 단위 콘텐츠를 저장하는 테이블. 블록 에디터의 핵심 테이블입니다.';
COMMENT ON COLUMN post_blocks.id IS '블록의 고유 식별자 (UUID)';
COMMENT ON COLUMN post_blocks.post_id IS '블록이 속한 게시글 ID (posts 테이블 참조)';
COMMENT ON COLUMN post_blocks.parent_block_id IS '상위 블록 ID (중첩된 블록 구조 지원, 예: 리스트의 아이템)';
COMMENT ON COLUMN post_blocks.block_type IS '블록 타입 (예: paragraph, heading, image, video, code, list, quote, table, page_link, page_embed, external_embed)';
COMMENT ON COLUMN post_blocks.sort_key IS '블록 정렬 키(동일 컨테이너 내 유니크). 중간 삽입/부분 정렬을 위해 NUMERIC 사용 권장';
COMMENT ON COLUMN post_blocks.content IS '블록 콘텐츠(JSON). ProseMirror node/doc(인라인 리치텍스트 포함) + 타입별 속성';
COMMENT ON COLUMN post_blocks.content_text IS '검색/리스트 최적화용 텍스트 캐시(선택). ProseMirror에서 추출한 plain text 등';
COMMENT ON COLUMN post_blocks.search_vector IS 'Full-text search용 tsvector 캐시(선택). content_text에서 생성';
COMMENT ON COLUMN post_blocks.ref_post_id IS 'page_link/page_embed 등 내부 페이지를 참조하는 블록의 대상 posts.id (백링크 조회/무결성)';
COMMENT ON COLUMN post_blocks.external_embed_id IS 'external_embed 블록이 참조하는 external_embeds.id';
COMMENT ON COLUMN post_blocks.is_deleted IS '블록 soft delete 여부';
COMMENT ON COLUMN post_blocks.deleted_at IS '블록 삭제 시각(soft delete)';
COMMENT ON COLUMN post_blocks.pm_schema_version IS 'ProseMirror 스키마 버전(호환성 관리용)';
COMMENT ON COLUMN post_blocks.parent_block_id IS '상위 블록 ID (중첩된 블록 구조 지원, 예: 리스트의 아이템)';
COMMENT ON COLUMN post_blocks.metadata IS '블록의 추가 메타데이터 (JSON 형식, 예: 스타일, 설정)';
COMMENT ON COLUMN post_blocks.created_at IS '블록 생성 시각';
COMMENT ON COLUMN post_blocks.updated_at IS '블록 최종 수정 시각';

-- ============================================
-- 3.1 BLOCK REFERENCE BACKLINK VIEW (선택)
-- ============================================
-- 내부 페이지 링크/임베드 백링크를 빠르게 조회하기 위한 뷰
-- - 링크/임베드 종류는 block_type으로 구분(권장: page_link/page_embed)
--
CREATE OR REPLACE VIEW post_backlinks AS
SELECT
    b.ref_post_id       AS target_post_id,
    b.post_id           AS source_post_id,
    b.id                AS source_block_id,
    b.block_type        AS ref_type,
    b.created_at        AS created_at
FROM post_blocks b
WHERE b.ref_post_id IS NOT NULL
  AND b.is_deleted = FALSE;

COMMENT ON VIEW post_backlinks IS '페이지 링크/임베드 블록 기반 백링크 조회 뷰';

-- ============================================
-- 4. POST TAGS
-- ============================================

CREATE TABLE post_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7), -- HEX 색상 코드 (예: #FF5733)
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_post_tags_tenant_id ON post_tags(tenant_id);
CREATE INDEX idx_post_tags_slug ON post_tags(tenant_id, slug);
CREATE INDEX idx_post_tags_name ON post_tags(tenant_id, name);

COMMENT ON TABLE post_tags IS '게시글 태그 정보를 관리하는 테이블';
COMMENT ON COLUMN post_tags.id IS '태그의 고유 식별자 (UUID)';
COMMENT ON COLUMN post_tags.tenant_id IS '태그가 속한 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN post_tags.name IS '태그 이름';
COMMENT ON COLUMN post_tags.slug IS '태그의 URL 식별 문자열 (같은 테넌트 내에서 고유)';
COMMENT ON COLUMN post_tags.description IS '태그에 대한 설명';
COMMENT ON COLUMN post_tags.color IS '태그 표시 색상 (HEX 코드)';
COMMENT ON COLUMN post_tags.usage_count IS '태그 사용 횟수 (캐시된 값)';
COMMENT ON COLUMN post_tags.created_at IS '태그 생성 시각';

-- ============================================
-- 5. POST-TAG MAPPING
-- ============================================

CREATE TABLE post_tag_mappings (
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES post_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX idx_post_tag_mappings_post_id ON post_tag_mappings(post_id);
CREATE INDEX idx_post_tag_mappings_tag_id ON post_tag_mappings(tag_id);

COMMENT ON TABLE post_tag_mappings IS '게시글과 태그의 매핑 테이블';
COMMENT ON COLUMN post_tag_mappings.post_id IS '게시글 ID (posts 테이블 참조)';
COMMENT ON COLUMN post_tag_mappings.tag_id IS '태그 ID (post_tags 테이블 참조)';
COMMENT ON COLUMN post_tag_mappings.created_at IS '매핑 생성 시각';

-- ============================================
-- 6. POST COMMENTS (댓글)
-- ============================================

CREATE TABLE post_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES post_comments(id) ON DELETE CASCADE, -- 대댓글 지원
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    content TEXT NOT NULL,
    is_approved BOOLEAN DEFAULT TRUE,
    is_pinned BOOLEAN DEFAULT FALSE,
    like_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CHECK (parent_id IS NULL OR parent_id != id)
);

CREATE INDEX idx_post_comments_post_id ON post_comments(post_id);
CREATE INDEX idx_post_comments_parent_id ON post_comments(parent_id);
CREATE INDEX idx_post_comments_author_id ON post_comments(author_id);
CREATE INDEX idx_post_comments_created_at ON post_comments(post_id, created_at DESC);
CREATE INDEX idx_post_comments_deleted_at ON post_comments(deleted_at) WHERE deleted_at IS NULL;

COMMENT ON TABLE post_comments IS '게시글 댓글 정보를 관리하는 테이블. 계층 구조를 지원합니다.';
COMMENT ON COLUMN post_comments.id IS '댓글의 고유 식별자 (UUID)';
COMMENT ON COLUMN post_comments.post_id IS '댓글이 속한 게시글 ID (posts 테이블 참조)';
COMMENT ON COLUMN post_comments.parent_id IS '상위 댓글 ID (대댓글인 경우, NULL이면 최상위 댓글)';
COMMENT ON COLUMN post_comments.author_id IS '댓글 작성자 ID (users 테이블 참조)';
COMMENT ON COLUMN post_comments.content IS '댓글 내용';
COMMENT ON COLUMN post_comments.is_approved IS '댓글 승인 여부 (관리자 승인 필요 시 사용)';
COMMENT ON COLUMN post_comments.is_pinned IS '댓글 고정 여부';
COMMENT ON COLUMN post_comments.like_count IS '댓글 좋아요 수 (캐시된 값)';
COMMENT ON COLUMN post_comments.reply_count IS '대댓글 수 (캐시된 값)';
COMMENT ON COLUMN post_comments.metadata IS '댓글의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN post_comments.created_at IS '댓글 작성 시각';
COMMENT ON COLUMN post_comments.updated_at IS '댓글 최종 수정 시각';
COMMENT ON COLUMN post_comments.deleted_at IS '댓글 삭제 시각 (Soft Delete용, NULL이면 삭제되지 않음)';

-- ============================================
-- 8. POST LIKES (좋아요)
-- ============================================

CREATE TABLE post_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id)
);

CREATE INDEX idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX idx_post_likes_user_id ON post_likes(user_id);

COMMENT ON TABLE post_likes IS '게시글 좋아요 정보를 관리하는 테이블';
COMMENT ON COLUMN post_likes.id IS '좋아요 레코드의 고유 식별자 (UUID)';
COMMENT ON COLUMN post_likes.post_id IS '좋아요가 된 게시글 ID (posts 테이블 참조)';
COMMENT ON COLUMN post_likes.user_id IS '좋아요를 누른 사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN post_likes.created_at IS '좋아요 시각';

-- ============================================
-- 9. COMMENT LIKES (댓글 좋아요)
-- ============================================

CREATE TABLE comment_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comment_id, user_id)
);

CREATE INDEX idx_comment_likes_comment_id ON comment_likes(comment_id);
CREATE INDEX idx_comment_likes_user_id ON comment_likes(user_id);

COMMENT ON TABLE comment_likes IS '댓글 좋아요 정보를 관리하는 테이블';
COMMENT ON COLUMN comment_likes.id IS '좋아요 레코드의 고유 식별자 (UUID)';
COMMENT ON COLUMN comment_likes.comment_id IS '좋아요가 된 댓글 ID (post_comments 테이블 참조)';
COMMENT ON COLUMN comment_likes.user_id IS '좋아요를 누른 사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN comment_likes.created_at IS '좋아요 시각';

-- ============================================
-- 10. POST VIEWS (조회 기록)
-- ============================================

CREATE TABLE post_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- 비로그인 사용자도 조회 가능
    ip_address INET,
    user_agent TEXT,
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_post_views_post_id ON post_views(post_id);
CREATE INDEX idx_post_views_user_id ON post_views(user_id);
CREATE INDEX idx_post_views_viewed_at ON post_views(viewed_at);

COMMENT ON TABLE post_views IS '게시글 조회 기록을 관리하는 테이블';
COMMENT ON COLUMN post_views.id IS '조회 기록의 고유 식별자 (UUID)';
COMMENT ON COLUMN post_views.post_id IS '조회된 게시글 ID (posts 테이블 참조)';
COMMENT ON COLUMN post_views.user_id IS '조회한 사용자 ID (users 테이블 참조, NULL이면 비로그인 사용자)';
COMMENT ON COLUMN post_views.ip_address IS '조회한 IP 주소';
COMMENT ON COLUMN post_views.user_agent IS '조회한 클라이언트의 User-Agent 정보';
COMMENT ON COLUMN post_views.viewed_at IS '조회 시각';

-- ============================================
-- 11. POST REVISIONS (게시글 수정 이력)
-- ============================================

CREATE TABLE post_revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(500),
    excerpt TEXT,
    blocks_snapshot JSONB, -- 블록들의 스냅샷(권장: 블록 id/정렬키/콘텐츠의 스냅샷)
    change_summary TEXT, -- 변경 사항 요약
    revision_number INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_post_revisions_post_id ON post_revisions(post_id);
CREATE INDEX idx_post_revisions_author_id ON post_revisions(author_id);
CREATE INDEX idx_post_revisions_revision_number ON post_revisions(post_id, revision_number DESC);

COMMENT ON TABLE post_revisions IS '게시글 수정 이력을 관리하는 테이블';
COMMENT ON COLUMN post_revisions.id IS '수정 이력의 고유 식별자 (UUID)';
COMMENT ON COLUMN post_revisions.post_id IS '수정된 게시글 ID (posts 테이블 참조)';
COMMENT ON COLUMN post_revisions.author_id IS '수정한 사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN post_revisions.title IS '수정 시점의 제목';
COMMENT ON COLUMN post_revisions.excerpt IS '수정 시점의 요약';
COMMENT ON COLUMN post_revisions.blocks_snapshot IS '수정 시점의 블록 스냅샷 (JSON 형식)';
COMMENT ON COLUMN post_revisions.change_summary IS '변경 사항 요약';
COMMENT ON COLUMN post_revisions.revision_number IS '수정 버전 번호 (1부터 시작)';
COMMENT ON COLUMN post_revisions.created_at IS '수정 이력 생성 시각';

-- ============================================
-- 12. TRIGGERS FOR UPDATED_AT
-- ============================================

-- Reuse the function from main schema if it exists, otherwise create it
DO $do$
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
END $do$;

COMMENT ON FUNCTION update_updated_at_column() IS '레코드가 업데이트될 때 updated_at 컬럼을 자동으로 현재 시각으로 갱신하는 트리거 함수';

CREATE TRIGGER update_board_categories_updated_at BEFORE UPDATE ON board_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_post_blocks_updated_at BEFORE UPDATE ON post_blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_external_embeds_updated_at BEFORE UPDATE ON external_embeds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 12. FULL-TEXT SEARCH VECTOR MAINTENANCE (선택)
-- ============================================
-- content_text가 바뀔 때 search_vector를 자동 갱신합니다.
-- - 언어는 기본 simple 구성(필요 시 tenant/페이지 언어에 따라 english/korean 등으로 확장)
--
CREATE OR REPLACE FUNCTION update_post_block_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('simple', COALESCE(NEW.content_text, ''));
    RETURN NEW;
END;
$$ language 'plpgsql';

COMMENT ON FUNCTION update_post_block_search_vector() IS 'post_blocks.content_text -> search_vector 자동 생성 트리거 함수';

CREATE TRIGGER trigger_update_post_block_search_vector
    BEFORE INSERT OR UPDATE OF content_text ON post_blocks
    FOR EACH ROW EXECUTE FUNCTION update_post_block_search_vector();

CREATE TRIGGER update_post_comments_updated_at BEFORE UPDATE ON post_comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 13. PAGE HIERARCHY FUNCTIONS
-- ============================================

-- Function to update child_count when page is added/removed
CREATE OR REPLACE FUNCTION update_page_child_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
        UPDATE posts 
        SET child_count = child_count + 1 
        WHERE id = NEW.parent_id;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle parent change
        IF OLD.parent_id IS NOT NULL AND NEW.parent_id IS NULL THEN
            -- Removed from parent
            UPDATE posts 
            SET child_count = GREATEST(child_count - 1, 0) 
            WHERE id = OLD.parent_id;
        ELSIF OLD.parent_id IS NULL AND NEW.parent_id IS NOT NULL THEN
            -- Added to parent
            UPDATE posts 
            SET child_count = child_count + 1 
            WHERE id = NEW.parent_id;
        ELSIF OLD.parent_id IS NOT NULL AND NEW.parent_id IS NOT NULL AND OLD.parent_id != NEW.parent_id THEN
            -- Changed parent
            UPDATE posts 
            SET child_count = GREATEST(child_count - 1, 0) 
            WHERE id = OLD.parent_id;
            UPDATE posts 
            SET child_count = child_count + 1 
            WHERE id = NEW.parent_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
        UPDATE posts 
        SET child_count = GREATEST(child_count - 1, 0) 
        WHERE id = OLD.parent_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

COMMENT ON FUNCTION update_page_child_count() IS '페이지 계층 구조에서 child_count를 자동으로 업데이트하는 트리거 함수';

CREATE TRIGGER trigger_update_page_child_count
    AFTER INSERT OR UPDATE OR DELETE ON posts
    FOR EACH ROW EXECUTE FUNCTION update_page_child_count();

-- Function to get page path (breadcrumb)
CREATE OR REPLACE FUNCTION get_page_path(page_id UUID)
RETURNS TABLE (
    id UUID,
    title VARCHAR,
    slug VARCHAR,
    page_order INTEGER,
    depth INTEGER
) AS $$
WITH RECURSIVE page_path AS (
    -- Base case: start with the requested page
    SELECT 
        p.id,
        p.title,
        p.slug,
        p.page_order,
        p.parent_id,
        0 as depth
    FROM posts p
    WHERE p.id = page_id
    
    UNION ALL
    
    -- Recursive case: get parent pages
    SELECT 
        p.id,
        p.title,
        p.slug,
        p.page_order,
        p.parent_id,
        pp.depth + 1
    FROM posts p
    INNER JOIN page_path pp ON p.id = pp.parent_id
)
SELECT 
    id,
    title,
    slug,
    page_order,
    depth
FROM page_path
ORDER BY depth DESC;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_page_path IS '페이지의 전체 경로(브레드크럼)를 조회하는 함수. 최상위 페이지부터 현재 페이지까지의 경로를 반환합니다.';

-- Function to get page tree (all children recursively)
CREATE OR REPLACE FUNCTION get_page_tree(root_page_id UUID, max_depth INTEGER DEFAULT 10)
RETURNS TABLE (
    id UUID,
    title VARCHAR,
    slug VARCHAR,
    parent_id UUID,
    page_type VARCHAR,
    child_count INTEGER,
    page_order INTEGER,
    depth INTEGER,
    path TEXT
) AS $$
WITH RECURSIVE page_tree AS (
    -- Base case: start with root page
    SELECT 
        p.id,
        p.title,
        p.slug,
        p.parent_id,
        p.page_type,
        p.child_count,
        p.page_order,
        0 as depth,
        ARRAY[p.id] as path
    FROM posts p
    WHERE p.id = root_page_id
    
    UNION ALL
    
    -- Recursive case: get children
    SELECT 
        p.id,
        p.title,
        p.slug,
        p.parent_id,
        p.page_type,
        p.child_count,
        p.page_order,
        pt.depth + 1,
        pt.path || p.id
    FROM posts p
    INNER JOIN page_tree pt ON p.parent_id = pt.id
    WHERE pt.depth < max_depth
    AND NOT (p.id = ANY(pt.path)) -- Prevent cycles
    AND p.deleted_at IS NULL
)
SELECT 
    id,
    title,
    slug,
    parent_id,
    page_type,
    child_count,
    page_order,
    depth,
    array_to_string(path, '/') as path
FROM page_tree
ORDER BY depth, page_order;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_page_tree IS '페이지의 전체 하위 트리를 재귀적으로 조회하는 함수. 최대 깊이를 제한하여 무한 루프를 방지합니다.';

-- Function to move page to new parent
CREATE OR REPLACE FUNCTION move_page(
    page_id_to_move UUID,
    new_parent_id UUID,
    new_order INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    current_parent_id UUID;
    max_order INTEGER;
    page_tenant_id UUID;
BEGIN
    -- Get current parent and tenant
    SELECT parent_id, tenant_id INTO current_parent_id, page_tenant_id
    FROM posts
    WHERE id = page_id_to_move;
    
    -- Prevent moving page to its own descendant
    IF new_parent_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM get_page_tree(page_id_to_move, 10)
            WHERE id = new_parent_id
        ) THEN
            RAISE EXCEPTION 'Cannot move page to its own descendant';
        END IF;
    END IF;
    
    -- Get max order if new_order is not specified
    IF new_order IS NULL THEN
        SELECT COALESCE(MAX(page_order), 0) + 1 INTO max_order
        FROM posts
        WHERE parent_id = new_parent_id
        AND tenant_id = page_tenant_id
        AND deleted_at IS NULL;
    ELSE
        max_order := new_order;
    END IF;
    
    -- Update page
    UPDATE posts
    SET 
        parent_id = new_parent_id,
        page_order = max_order
    WHERE id = page_id_to_move;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION move_page IS '페이지를 새로운 부모로 이동시키는 함수. 자신의 하위 페이지로는 이동할 수 없습니다.';

-- ============================================
-- 14. PAGE NAVIGATION VIEWS
-- ============================================

-- View for page navigation (breadcrumb)
CREATE OR REPLACE VIEW page_breadcrumbs AS
SELECT 
    p.id,
    p.tenant_id,
    p.title,
    p.slug,
    p.parent_id,
    (SELECT jsonb_agg(row_to_json(pp)) FROM get_page_path(p.id) pp) as path
FROM posts p
WHERE p.deleted_at IS NULL;

COMMENT ON VIEW page_breadcrumbs IS '페이지 브레드크럼을 위한 뷰';

-- View for page tree structure
CREATE OR REPLACE VIEW page_tree_view AS
SELECT 
    p.id,
    p.tenant_id,
    p.title,
    p.slug,
    p.parent_id,
    p.page_type,
    p.child_count,
    p.page_order,
    p.icon,
    p.cover_image_url,
    p.status,
    p.visibility,
    p.is_pinned,
    p.created_at,
    p.updated_at,
    CASE 
        WHEN p.parent_id IS NULL THEN 0
        ELSE (
            SELECT COUNT(*) - 1 
            FROM get_page_path(p.id)
        )
    END as depth
FROM posts p
WHERE p.deleted_at IS NULL;

COMMENT ON VIEW page_tree_view IS '페이지 트리 구조를 조회하기 위한 뷰. 각 페이지의 깊이(depth)를 포함합니다.';

-- ============================================
-- 15. FUNCTIONS FOR COUNT UPDATES
-- ============================================

-- Function to update post like_count
CREATE OR REPLACE FUNCTION update_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

COMMENT ON FUNCTION update_post_like_count() IS '게시글 좋아요 수를 자동으로 업데이트하는 트리거 함수';

CREATE TRIGGER trigger_update_post_like_count
    AFTER INSERT OR DELETE ON post_likes
    FOR EACH ROW EXECUTE FUNCTION update_post_like_count();

-- Function to update post comment_count
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

COMMENT ON FUNCTION update_post_comment_count() IS '게시글 댓글 수를 자동으로 업데이트하는 트리거 함수';

CREATE TRIGGER trigger_update_post_comment_count
    AFTER INSERT OR DELETE ON post_comments
    FOR EACH ROW EXECUTE FUNCTION update_post_comment_count();

-- Function to update comment like_count and reply_count
CREATE OR REPLACE FUNCTION update_comment_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Update reply_count for parent comment
        IF NEW.parent_id IS NOT NULL THEN
            UPDATE post_comments SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Update reply_count for parent comment
        IF OLD.parent_id IS NOT NULL THEN
            UPDATE post_comments SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = OLD.parent_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

COMMENT ON FUNCTION update_comment_counts() IS '댓글의 대댓글 수를 자동으로 업데이트하는 트리거 함수';

CREATE TRIGGER trigger_update_comment_reply_count
    AFTER INSERT OR DELETE ON post_comments
    FOR EACH ROW EXECUTE FUNCTION update_comment_counts();

-- Function to update comment like_count
CREATE OR REPLACE FUNCTION update_comment_like_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE post_comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE post_comments SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.comment_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

COMMENT ON FUNCTION update_comment_like_count() IS '댓글 좋아요 수를 자동으로 업데이트하는 트리거 함수';

CREATE TRIGGER trigger_update_comment_like_count
    AFTER INSERT OR DELETE ON comment_likes
    FOR EACH ROW EXECUTE FUNCTION update_comment_like_count();

-- Function to update tag usage_count
CREATE OR REPLACE FUNCTION update_tag_usage_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE post_tags SET usage_count = usage_count + 1 WHERE id = NEW.tag_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE post_tags SET usage_count = GREATEST(usage_count - 1, 0) WHERE id = OLD.tag_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

COMMENT ON FUNCTION update_tag_usage_count() IS '태그 사용 횟수를 자동으로 업데이트하는 트리거 함수';

CREATE TRIGGER trigger_update_tag_usage_count
    AFTER INSERT OR DELETE ON post_tag_mappings
    FOR EACH ROW EXECUTE FUNCTION update_tag_usage_count();

-- ============================================
-- 14. USAGE TRACKING HELPER VIEWS (선택사항)
-- ============================================

-- View to track board service usage per tenant
-- This can be used with usage_tracking table from schema_tenant_membership.sql
-- Example usage:
-- INSERT INTO usage_tracking (tenant_id, subscription_id, metric_name, metric_value, period_start, period_end)
-- SELECT 
--     tenant_id,
--     (SELECT id FROM tenant_subscriptions WHERE tenant_id = posts.tenant_id AND status = 'active' ORDER BY created_at DESC LIMIT 1),
--     'posts_count',
--     COUNT(*)::DECIMAL,
--     date_trunc('month', CURRENT_TIMESTAMP),
--     (date_trunc('month', CURRENT_TIMESTAMP) + interval '1 month' - interval '1 day')
-- FROM posts
-- WHERE tenant_id = ? AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)
-- GROUP BY tenant_id;

-- ============================================
-- 15. INTEGRATION NOTES WITH BILLING SYSTEM
-- ============================================

-- 1. BOARD SERVICE REGISTRATION
--    The board service must be registered in the services table (schema.sql):
--    INSERT INTO services (name, slug, version, description) 
--    VALUES ('Board Service', 'board-service', '1.0.0', 'Block editor based board system');

-- 2. TENANT SERVICE ACCESS
--    Tenant access should be granted via tenant_service_access table:
--    INSERT INTO tenant_service_access (tenant_id, service_id, status, access_level)
--    VALUES (?, (SELECT id FROM services WHERE slug = 'board-service'), 'active', 'standard');

-- 3. SUBSCRIPTION PLAN FEATURES
--    Add board-related limits to subscription_plans.features JSONB:
--    UPDATE subscription_plans SET features = jsonb_set(features, '{board}', '{
--      "max_posts": 100,
--      "max_storage_gb": 10,
--      "max_categories": 20,
--      "enable_advanced_features": true
--    }'::jsonb) WHERE slug = 'personal';

-- 4. USAGE TRACKING
--    Track board usage using usage_tracking table:
--    - metric_name: 'posts_count', 'storage_gb', 'categories_count', 'comments_count'
--    - Update usage_tracking periodically or on-demand
--    - Check limits before allowing operations

-- 5. MEMBERSHIP VALIDATION
--    Before creating/editing posts, verify:
--    - User has active membership: SELECT * FROM tenant_memberships 
--      WHERE user_id = ? AND tenant_id = ? AND membership_status = 'active'
--    - User's membership role allows the action (owner, admin, member can create/edit)

-- 6. SUBSCRIPTION STATUS CHECK
--    Before allowing board access, verify:
--    - Subscription is active: SELECT * FROM tenant_subscriptions 
--      WHERE tenant_id = ? AND status = 'active' AND current_period_end > NOW()
--    - Service access is granted: SELECT * FROM tenant_service_access 
--      WHERE tenant_id = ? AND service_id = (SELECT id FROM services WHERE slug = 'board-service') 
--      AND status = 'active'

-- ============================================
-- 16. INITIAL DATA - DEFAULT PERMISSIONS
-- ============================================

-- Board-related permissions (add these to the main permissions table in schema.sql)
-- Note: These should be added to the main schema.sql permissions table
-- For reference, here are the suggested permissions:

/*
INSERT INTO permissions (name, slug, resource, action, description) VALUES
    ('Create Post', 'post:create', 'post', 'create', '게시글 작성 권한'),
    ('Read Post', 'post:read', 'post', 'read', '게시글 조회 권한'),
    ('Update Post', 'post:update', 'post', 'update', '게시글 수정 권한'),
    ('Delete Post', 'post:delete', 'post', 'delete', '게시글 삭제 권한'),
    ('Publish Post', 'post:publish', 'post', 'publish', '게시글 발행 권한'),
    ('Manage Post', 'post:manage', 'post', 'manage', '게시글 전체 관리 권한'),
    
    ('Create Category', 'category:create', 'category', 'create', '카테고리 생성 권한'),
    ('Read Category', 'category:read', 'category', 'read', '카테고리 조회 권한'),
    ('Update Category', 'category:update', 'category', 'update', '카테고리 수정 권한'),
    ('Delete Category', 'category:delete', 'category', 'delete', '카테고리 삭제 권한'),
    ('Manage Category', 'category:manage', 'category', 'manage', '카테고리 전체 관리 권한'),
    
    ('Create Comment', 'comment:create', 'comment', 'create', '댓글 작성 권한'),
    ('Read Comment', 'comment:read', 'comment', 'read', '댓글 조회 권한'),
    ('Update Comment', 'comment:update', 'comment', 'update', '댓글 수정 권한'),
    ('Delete Comment', 'comment:delete', 'comment', 'delete', '댓글 삭제 권한'),
    ('Moderate Comment', 'comment:moderate', 'comment', 'moderate', '댓글 승인/거부 권한');
*/

