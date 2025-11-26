-- ============================================
-- Notion-Style Page Hierarchy and Category System
-- Extensions to schema_blocks.sql for Page-in-Page Structure
-- PostgreSQL Database Schema
-- ============================================
--
-- IMPORTANT NOTES:
-- 1. This schema extends schema_blocks.sql to support Notion-style page hierarchy
-- 2. Pages can contain other pages as children (parent-child relationship)
-- 3. Pages can act as both content and category
-- 4. Supports unlimited nesting depth
-- 5. Comments and likes are maintained as they are useful features
--
-- ============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. ALTER POSTS TABLE FOR PAGE HIERARCHY
-- ============================================

-- Add parent_id to support page-in-page structure (Notion style)
ALTER TABLE posts 
    ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS page_type VARCHAR(50) DEFAULT 'post' CHECK (page_type IN ('page', 'post', 'category')),
    ADD COLUMN IF NOT EXISTS child_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS page_order INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS icon VARCHAR(100), -- 페이지 아이콘 (이모지 또는 아이콘 이름)
    ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(500); -- 커버 이미지 URL

-- Update UNIQUE constraint to allow same slug in different parent pages
-- Remove old unique constraint if exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'posts_tenant_id_slug_key'
    ) THEN
        ALTER TABLE posts DROP CONSTRAINT posts_tenant_id_slug_key;
    END IF;
END $$;

-- Add new unique constraint that includes parent_id
ALTER TABLE posts 
    ADD CONSTRAINT posts_tenant_parent_slug_unique 
    UNIQUE(tenant_id, parent_id, slug);

-- Add check constraint to prevent self-reference
ALTER TABLE posts 
    ADD CONSTRAINT posts_parent_check 
    CHECK (parent_id IS NULL OR parent_id != id);

-- Add indexes for page hierarchy
CREATE INDEX IF NOT EXISTS idx_posts_parent_id ON posts(parent_id);
CREATE INDEX IF NOT EXISTS idx_posts_page_type ON posts(page_type);
CREATE INDEX IF NOT EXISTS idx_posts_page_order ON posts(parent_id, page_order) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_child_count ON posts(child_count) WHERE child_count > 0;

-- Add comments for new columns
COMMENT ON COLUMN posts.parent_id IS '상위 페이지 ID (posts 테이블 참조). NULL이면 최상위 페이지. Notion 스타일의 페이지 계층 구조를 지원합니다.';
COMMENT ON COLUMN posts.page_type IS '페이지 타입: page(일반 페이지), post(게시글), category(카테고리). 페이지는 카테고리 역할도 할 수 있습니다.';
COMMENT ON COLUMN posts.child_count IS '하위 페이지 수 (자동 업데이트)';
COMMENT ON COLUMN posts.page_order IS '페이지 표시 순서 (같은 부모 내에서의 순서)';
COMMENT ON COLUMN posts.icon IS '페이지 아이콘 (이모지 또는 아이콘 이름, 예: 📄, 📝, 📊)';
COMMENT ON COLUMN posts.cover_image_url IS '페이지 커버 이미지 URL';

-- ============================================
-- 2. PAGE HIERARCHY FUNCTIONS
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

-- ============================================
-- 3. PAGE PATH FUNCTION (페이지 경로 조회)
-- ============================================

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

-- ============================================
-- 4. PAGE TREE FUNCTION (페이지 트리 조회)
-- ============================================

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

-- ============================================
-- 5. PAGE MOVEMENT FUNCTIONS
-- ============================================

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
BEGIN
    -- Get current parent
    SELECT parent_id INTO current_parent_id
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
        AND tenant_id = (SELECT tenant_id FROM posts WHERE id = page_id_to_move);
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
-- 6. VIEWS FOR PAGE NAVIGATION
-- ============================================

-- View for page navigation (breadcrumb)
CREATE OR REPLACE VIEW page_breadcrumbs AS
SELECT 
    p.id,
    p.tenant_id,
    p.title,
    p.slug,
    p.parent_id,
    get_page_path(p.id) as path
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
-- 7. COMMENTS AND LIKES REVIEW
-- ============================================

-- REVIEW NOTES:
-- 1. post_comments: 유지 권장
--   - 사용자 간 소통에 필수적
--   - 계층 구조 지원 (대댓글)
--   - 승인 시스템 포함
--   - Soft delete 지원
--
-- 2. post_likes: 유지 권장
--   - 간단한 피드백 메커니즘
--   - 사용자 참여도 향상
--   - 통계 및 분석에 유용
--
-- 3. comment_likes: 유지 권장
--   - 댓글 품질 평가
--   - 유용한 댓글 식별
--
-- 결론: 댓글과 좋아요 기능은 유지하는 것이 좋습니다.
-- 필요시 특정 페이지에서 댓글/좋아요를 비활성화할 수 있습니다 (allow_comments 플래그 사용).

-- ============================================
-- 8. ADDITIONAL INDEXES FOR PERFORMANCE
-- ============================================

-- Index for querying children of a page
CREATE INDEX IF NOT EXISTS idx_posts_parent_order 
ON posts(parent_id, page_order) 
WHERE parent_id IS NOT NULL AND deleted_at IS NULL;

-- Index for querying root pages (pages without parent)
CREATE INDEX IF NOT EXISTS idx_posts_root_pages 
ON posts(tenant_id, page_order) 
WHERE parent_id IS NULL AND deleted_at IS NULL;

-- Index for page type filtering
CREATE INDEX IF NOT EXISTS idx_posts_tenant_type 
ON posts(tenant_id, page_type) 
WHERE deleted_at IS NULL;

-- ============================================
-- 9. MIGRATION NOTES
-- ============================================

-- IMPORTANT: When applying this schema to existing database:
--
-- 1. Add new columns to existing posts:
--    ALTER TABLE posts ADD COLUMN parent_id UUID REFERENCES posts(id) ON DELETE CASCADE;
--    ALTER TABLE posts ADD COLUMN page_type VARCHAR(50) DEFAULT 'post';
--    ALTER TABLE posts ADD COLUMN child_count INTEGER DEFAULT 0;
--    ALTER TABLE posts ADD COLUMN page_order INTEGER DEFAULT 0;
--    ALTER TABLE posts ADD COLUMN icon VARCHAR(100);
--    ALTER TABLE posts ADD COLUMN cover_image_url VARCHAR(500);
--
-- 2. Update existing posts to have page_type = 'post':
--    UPDATE posts SET page_type = 'post' WHERE page_type IS NULL;
--
-- 3. Recalculate child_count for existing pages:
--    UPDATE posts p
--    SET child_count = (
--        SELECT COUNT(*)
--        FROM posts c
--        WHERE c.parent_id = p.id
--        AND c.deleted_at IS NULL
--    );
--
-- 4. Update slug unique constraint:
--    -- Drop old constraint
--    ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_tenant_id_slug_key;
--    -- Add new constraint
--    ALTER TABLE posts ADD CONSTRAINT posts_tenant_parent_slug_unique 
--    UNIQUE(tenant_id, parent_id, slug);

-- ============================================
-- 10. USAGE EXAMPLES
-- ============================================

-- Example 1: Create a page with a child page
-- INSERT INTO posts (tenant_id, author_id, title, slug, page_type, parent_id, page_order)
-- VALUES 
--     ('tenant-uuid', 'user-uuid', 'Parent Page', 'parent-page', 'page', NULL, 1),
--     ('tenant-uuid', 'user-uuid', 'Child Page', 'child-page', 'page', 
--      (SELECT id FROM posts WHERE slug = 'parent-page' AND tenant_id = 'tenant-uuid'), 1);

-- Example 2: Get all children of a page
-- SELECT * FROM posts 
-- WHERE parent_id = 'page-uuid' 
-- AND deleted_at IS NULL
-- ORDER BY page_order;

-- Example 3: Get page path (breadcrumb)
-- SELECT * FROM get_page_path('page-uuid');

-- Example 4: Get entire page tree
-- SELECT * FROM get_page_tree('root-page-uuid', 5);

-- Example 5: Move a page to new parent
-- SELECT move_page('page-to-move-uuid', 'new-parent-uuid', 2);

