import pool from "../config/db"

async function exec(sql: string) {
  await pool.query(sql)
}

// Idempotent schema “self-heal” for environments where DB exists but partial schema is missing.
// This is intentionally minimal and focused on the post editor feature set.
export async function ensurePostEditorSchema(): Promise<void> {
  // board_categories: ensure missing columns used by category feature
  await exec(`
    CREATE TABLE IF NOT EXISTS board_categories (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      parent_id UUID REFERENCES board_categories(id) ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) NOT NULL,
      description TEXT,
      display_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_id, slug),
      CHECK (parent_id IS NULL OR parent_id != id)
    );
  `)

  // Add new columns (safe even if they already exist)
  await exec(`ALTER TABLE board_categories ADD COLUMN IF NOT EXISTS author_id UUID;`)
  await exec(`ALTER TABLE board_categories ADD COLUMN IF NOT EXISTS category_type VARCHAR(50) NOT NULL DEFAULT 'board';`)
  await exec(`ALTER TABLE board_categories ADD COLUMN IF NOT EXISTS icon VARCHAR(100);`)
  await exec(`ALTER TABLE board_categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`)

  // Add FK + CHECK constraint if missing
  await exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'board_categories_author_id_fkey'
      ) THEN
        ALTER TABLE board_categories
          ADD CONSTRAINT board_categories_author_id_fkey
          FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `)
  await exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'board_categories_category_type_check'
      ) THEN
        ALTER TABLE board_categories
          ADD CONSTRAINT board_categories_category_type_check
          CHECK (category_type IN ('board', 'personal_page', 'team_page'));
      END IF;
    END $$;
  `)

  // Indexes (idempotent)
  await exec(`CREATE INDEX IF NOT EXISTS idx_board_categories_tenant_id ON board_categories(tenant_id);`)
  await exec(`CREATE INDEX IF NOT EXISTS idx_board_categories_author_id ON board_categories(author_id);`)
  await exec(`CREATE INDEX IF NOT EXISTS idx_board_categories_type ON board_categories(tenant_id, category_type);`)
  await exec(`CREATE INDEX IF NOT EXISTS idx_board_categories_parent_id ON board_categories(parent_id);`)
  await exec(`CREATE INDEX IF NOT EXISTS idx_board_categories_slug ON board_categories(tenant_id, slug);`)
  await exec(`CREATE INDEX IF NOT EXISTS idx_board_categories_display_order ON board_categories(tenant_id, display_order);`)

  // posts: ensure category_id and icon exist (some environments may have older posts table)
  await exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      parent_id UUID REFERENCES posts(id) ON DELETE SET NULL,
      category_id UUID REFERENCES board_categories(id) ON DELETE SET NULL,
      author_id UUID REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(255) NOT NULL DEFAULT 'Untitled',
      slug VARCHAR(100) NOT NULL,
      icon VARCHAR(100),
      page_type VARCHAR(50) NOT NULL DEFAULT 'page',
      status VARCHAR(50) NOT NULL DEFAULT 'draft',
      visibility VARCHAR(50) NOT NULL DEFAULT 'private',
      child_count INTEGER DEFAULT 0,
      page_order INTEGER DEFAULT 0,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMPTZ
    );
  `)
  await exec(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS category_id UUID;`)
  await exec(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS icon VARCHAR(100);`)
  await exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'posts_category_id_fkey'
      ) THEN
        ALTER TABLE posts
          ADD CONSTRAINT posts_category_id_fkey
          FOREIGN KEY (category_id) REFERENCES board_categories(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `)
  await exec(`CREATE INDEX IF NOT EXISTS idx_posts_category_id ON posts(category_id);`)

  // post_blocks existence (many installs already have it; keep minimal)
  await exec(`
    CREATE TABLE IF NOT EXISTS post_blocks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      parent_block_id UUID,
      block_type VARCHAR(100) NOT NULL,
      sort_key NUMERIC(20, 6) NOT NULL DEFAULT 0,
      content JSONB DEFAULT '{}'::jsonb,
      content_text TEXT,
      ref_post_id UUID,
      external_embed_id VARCHAR(255),
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `)
  await exec(`CREATE INDEX IF NOT EXISTS idx_post_blocks_post_id ON post_blocks(post_id);`)
  await exec(`CREATE INDEX IF NOT EXISTS idx_post_blocks_sort_key ON post_blocks(post_id, sort_key);`)

  // Cleanup: categories are hard-deleted in the product UX.
  // Remove any previously soft-deleted categories to avoid accumulation.
  await exec(`DELETE FROM board_categories WHERE deleted_at IS NOT NULL;`)

  // Cleanup: pages that were restored while their category was already deleted end up with:
  // - category_id IS NULL
  // - metadata.category_lost = true
  // They don't appear under any category. User request: track & delete them.
  // This cascades to post_blocks via FK.
  await exec(`
    DELETE FROM posts
    WHERE deleted_at IS NULL
      AND COALESCE(status,'') <> 'deleted'
      AND category_id IS NULL
      AND (COALESCE(metadata->>'category_lost','false')::boolean) = true
  `)
}

