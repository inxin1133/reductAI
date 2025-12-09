-- ============================================
-- Internationalization (i18n) Support Schema
-- Multi-Language Support for Microservices
-- PostgreSQL Database Schema
-- ============================================
--
-- IMPORTANT NOTES:
-- 1. This schema provides comprehensive i18n support for the entire system
-- 2. Supports dynamic language switching per user/tenant
-- 3. Translation keys are stored separately from content
-- 4. Supports fallback to default language when translation is missing
-- 5. All translatable content should reference translation keys
--
-- ============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. LANGUAGES (지원 언어)
-- ============================================

CREATE TABLE languages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(10) NOT NULL UNIQUE, -- ISO 639-1 or ISO 639-2 (예: 'en', 'ko', 'ja', 'zh-CN')
    name VARCHAR(100) NOT NULL, -- 언어 이름 (예: 'English', '한국어')
    native_name VARCHAR(100) NOT NULL, -- 원어 이름 (예: 'English', '한국어')
    direction VARCHAR(3) DEFAULT 'ltr' CHECK (direction IN ('ltr', 'rtl')), -- 텍스트 방향
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE, -- 기본 언어 여부
    display_order INTEGER DEFAULT 0,
    flag_emoji VARCHAR(10), -- 깃발 이모지 (예: '🇺🇸', '🇰🇷')
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_languages_code ON languages(code);
CREATE INDEX idx_languages_is_active ON languages(is_active);
CREATE INDEX idx_languages_is_default ON languages(is_default);

COMMENT ON TABLE languages IS '시스템에서 지원하는 언어 정보를 관리하는 테이블';
COMMENT ON COLUMN languages.id IS '언어의 고유 식별자 (UUID)';
COMMENT ON COLUMN languages.code IS '언어 코드 (ISO 639-1 또는 ISO 639-2, 예: en, ko, ja, zh-CN)';
COMMENT ON COLUMN languages.name IS '언어 이름 (영문, 예: English, Korean)';
COMMENT ON COLUMN languages.native_name IS '원어 이름 (예: English, 한국어)';
COMMENT ON COLUMN languages.direction IS '텍스트 방향: ltr(좌에서 우), rtl(우에서 좌)';
COMMENT ON COLUMN languages.is_active IS '언어 활성화 여부';
COMMENT ON COLUMN languages.is_default IS '기본 언어 여부 (시스템 전체 기본값)';
COMMENT ON COLUMN languages.display_order IS '언어 표시 순서';
COMMENT ON COLUMN languages.flag_emoji IS '언어를 나타내는 깃발 이모지';
COMMENT ON COLUMN languages.metadata IS '언어의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN languages.created_at IS '언어 등록 시각';
COMMENT ON COLUMN languages.updated_at IS '언어 정보 최종 수정 시각';

-- ============================================
-- 2. TRANSLATION NAMESPACES (번역 네임스페이스)
-- ============================================

-- 
-- 네임스페이스란?
--   - 번역 키(key) 들을 논리적으로 그룹화하여 관리하는 단위입니다.
--   - 예시: 'common', 'auth', 'posts', 'errors' 와 같이 기능/도메인/서비스별로 번역키 묶음 지정
--   - 코드 및 DB에서 'namespace'를 기준으로 번역키 충돌 없이 분리/추적/로딩이 가능합니다.
--   - 주로 백엔드/프론트엔드 등에서 다음과 같이 번역키 FQN(fully qualified name) 접근 시 사용됨:
--         {namespace}.{key}  (예: common.save, auth.login.button)
--   - 네임스페이스는 여러 서비스에서 중복되지 않는 일관성 있는 번역 구조를 만드는데 필수적입니다.
--   - 이 테이블은 namespace별 메타데이터·설명·서비스소속 등을 함께 정의하여
--     번역 관리 체계(특히 다수 서비스/마이크로서비스 환경)에서 확장성과 명확성을 보장합니다.
--

CREATE TABLE translation_namespaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE, -- 네임스페이스 이름 (예: 'common', 'auth', 'posts')
    description TEXT,
    service_name VARCHAR(100), -- 소속 서비스 이름 (예: 'auth-service', 'post-service')
    is_system BOOLEAN DEFAULT FALSE, -- 시스템 네임스페이스 여부
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_translation_namespaces_name ON translation_namespaces(name);
CREATE INDEX idx_translation_namespaces_service_name ON translation_namespaces(service_name);

COMMENT ON TABLE translation_namespaces IS '번역 키를 그룹화하는 네임스페이스를 관리하는 테이블. 하나의 네임스페이스는 여러 번역 키를 가질 수 있으며, 네임스페이스로 번역 키 충돌을 방지하고 효율적으로 관리할 수 있습니다.';
COMMENT ON COLUMN translation_namespaces.id IS '네임스페이스의 고유 식별자 (UUID)';
COMMENT ON COLUMN translation_namespaces.name IS '네임스페이스 이름 (예: common, auth, posts, errors)';
COMMENT ON COLUMN translation_namespaces.description IS '네임스페이스 설명';
COMMENT ON COLUMN translation_namespaces.service_name IS '소속 서비스 이름 (서비스별 번역 관리)';
COMMENT ON COLUMN translation_namespaces.is_system IS '시스템 네임스페이스 여부 (삭제 불가)';
COMMENT ON COLUMN translation_namespaces.metadata IS '네임스페이스의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN translation_namespaces.created_at IS '네임스페이스 생성 시각';
COMMENT ON COLUMN translation_namespaces.updated_at IS '네임스페이스 정보 최종 수정 시각';

-- ============================================
-- 3. TRANSLATION KEYS (번역 키)
-- ============================================

CREATE TABLE translation_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    namespace_id UUID NOT NULL REFERENCES translation_namespaces(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL, -- 번역 키 (예: 'welcome.message', 'error.not_found')
    description TEXT, -- 키에 대한 설명
    context TEXT, -- 사용 컨텍스트 설명
    is_plural BOOLEAN DEFAULT FALSE, -- 복수형 지원 여부
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(namespace_id, key)
);

CREATE INDEX idx_translation_keys_namespace_id ON translation_keys(namespace_id);
CREATE INDEX idx_translation_keys_key ON translation_keys(key);
CREATE INDEX idx_translation_keys_namespace_key ON translation_keys(namespace_id, key);

COMMENT ON TABLE translation_keys IS '번역 키를 관리하는 테이블. 실제 번역 텍스트는 translations 테이블에 저장됩니다.';
COMMENT ON COLUMN translation_keys.id IS '번역 키의 고유 식별자 (UUID)';
COMMENT ON COLUMN translation_keys.namespace_id IS '네임스페이스 ID (translation_namespaces 테이블 참조)';
COMMENT ON COLUMN translation_keys.key IS '번역 키 (예: welcome.message, error.not_found, button.save)';
COMMENT ON COLUMN translation_keys.description IS '번역 키에 대한 설명';
COMMENT ON COLUMN translation_keys.context IS '사용 컨텍스트 설명 (개발자를 위한 참고 정보)';
COMMENT ON COLUMN translation_keys.is_plural IS '복수형 지원 여부 (true면 복수형 변형 지원)';
COMMENT ON COLUMN translation_keys.metadata IS '번역 키의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN translation_keys.created_at IS '번역 키 생성 시각';
COMMENT ON COLUMN translation_keys.updated_at IS '번역 키 정보 최종 수정 시각';

-- ============================================
-- 4. TRANSLATIONS (번역 텍스트)
-- ============================================
-- 
-- [내부 주석: "번역 텍스트"와 "번역 가능한 콘텐츠"의 차이]
-- 
-- "번역 텍스트(translations)" 테이블은 UI, 시스템 메시지, 에러 메세지 등에서 반복적으로 재사용되는 "문자열 리소스"의 실제 번역 텍스트 데이터를 저장합니다.
-- 즉, translation_keys와 연결되어 공통적으로 쓰이는 키/값 번역 (예: 'button.save' = '저장').
--
-- "번역 가능한 콘텐츠(translatable_content)" 테이블은 게시물, 카테고리, 커뮤니티, 상품 등
-- 실제 사용자가 생성하거나 관리하는 레코드의 특정 필드(예: 게시글 제목, 설명 등)가 여러 언어로 번역 가능한 경우
-- 각 객체와 필드별로 번역 키 또는 기본 텍스트와 연결하여 별도로 관리합니다. 
-- 즉, 도메인(비즈니스/실제 데이터) 오브젝트의 다국어 컬럼 추적에 활용되며,
-- 주로 실데이터의 국제화를 위함입니다.
--
-- 요약: 
--   - 'translations'는 공통 UI/시스템 문자열(Key-Value 중심)의 다국어 값을 저장
--   - 'translatable_content'는 게시글·카테고리·상품 등 개별 데이터 객체의 여러 언어 값을 관리

CREATE TABLE translations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    translation_key_id UUID NOT NULL REFERENCES translation_keys(id) ON DELETE CASCADE,
    language_id UUID NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    value TEXT NOT NULL, -- 번역된 텍스트
    plural_value TEXT, -- 복수형 번역 텍스트 (is_plural이 true인 경우)
    is_approved BOOLEAN DEFAULT TRUE, -- 번역 승인 여부
    translated_by UUID REFERENCES users(id) ON DELETE SET NULL, -- 번역한 사용자
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL, -- 검토한 사용자
    reviewed_at TIMESTAMP WITH TIME ZONE, -- 검토 시각
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(translation_key_id, language_id)
);

CREATE INDEX idx_translations_translation_key_id ON translations(translation_key_id);
CREATE INDEX idx_translations_language_id ON translations(language_id);
CREATE INDEX idx_translations_key_language ON translations(translation_key_id, language_id);
CREATE INDEX idx_translations_is_approved ON translations(is_approved);

COMMENT ON TABLE translations IS '실제 번역 텍스트를 저장하는 테이블';
COMMENT ON COLUMN translations.id IS '번역의 고유 식별자 (UUID)';
COMMENT ON COLUMN translations.translation_key_id IS '번역 키 ID (translation_keys 테이블 참조)';
COMMENT ON COLUMN translations.language_id IS '언어 ID (languages 테이블 참조)';
COMMENT ON COLUMN translations.value IS '번역된 텍스트';
COMMENT ON COLUMN translations.plural_value IS '복수형 번역 텍스트 (is_plural이 true인 경우)';
COMMENT ON COLUMN translations.is_approved IS '번역 승인 여부 (미승인 번역은 사용되지 않음)';
COMMENT ON COLUMN translations.translated_by IS '번역한 사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN translations.reviewed_by IS '검토한 사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN translations.reviewed_at IS '검토 시각';
COMMENT ON COLUMN translations.metadata IS '번역의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN translations.created_at IS '번역 생성 시각';
COMMENT ON COLUMN translations.updated_at IS '번역 정보 최종 수정 시각';

-- ============================================
-- 5. USER LANGUAGE PREFERENCES (사용자 언어 설정)
-- ============================================

CREATE TABLE user_language_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL이면 전역 설정
    language_id UUID NOT NULL REFERENCES languages(id) ON DELETE RESTRICT,
    is_primary BOOLEAN DEFAULT TRUE, -- 기본 언어 여부
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, tenant_id, language_id)
);

CREATE INDEX idx_user_language_preferences_user_id ON user_language_preferences(user_id);
CREATE INDEX idx_user_language_preferences_tenant_id ON user_language_preferences(tenant_id);
CREATE INDEX idx_user_language_preferences_language_id ON user_language_preferences(language_id);
CREATE INDEX idx_user_language_preferences_primary ON user_language_preferences(user_id, tenant_id, is_primary) WHERE is_primary = TRUE;

COMMENT ON TABLE user_language_preferences IS '사용자의 언어 설정을 관리하는 테이블. 사용자는 여러 언어를 설정할 수 있으며, 테넌트별로 다른 언어를 사용할 수 있습니다.';
COMMENT ON COLUMN user_language_preferences.id IS '언어 설정의 고유 식별자 (UUID)';
COMMENT ON COLUMN user_language_preferences.user_id IS '사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN user_language_preferences.tenant_id IS '테넌트 ID (tenants 테이블 참조, NULL이면 전역 설정)';
COMMENT ON COLUMN user_language_preferences.language_id IS '언어 ID (languages 테이블 참조)';
COMMENT ON COLUMN user_language_preferences.is_primary IS '기본 언어 여부 (한 사용자/테넌트 조합당 하나만 TRUE)';
COMMENT ON COLUMN user_language_preferences.created_at IS '언어 설정 생성 시각';
COMMENT ON COLUMN user_language_preferences.updated_at IS '언어 설정 최종 수정 시각';

-- ============================================
-- 6. TENANT LANGUAGE SETTINGS (테넌트 언어 설정)
-- ============================================

CREATE TABLE tenant_language_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    default_language_id UUID NOT NULL REFERENCES languages(id) ON DELETE RESTRICT, -- 테넌트 기본 언어
    supported_language_ids UUID[] DEFAULT ARRAY[]::UUID[], -- 지원하는 언어 목록
    auto_translate_enabled BOOLEAN DEFAULT FALSE, -- 자동 번역 활성화 여부
    fallback_language_id UUID REFERENCES languages(id) ON DELETE SET NULL, -- 폴백 언어 (NULL이면 시스템 기본 언어)
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id)
);

CREATE INDEX idx_tenant_language_settings_tenant_id ON tenant_language_settings(tenant_id);
CREATE INDEX idx_tenant_language_settings_default_language_id ON tenant_language_settings(default_language_id);

COMMENT ON TABLE tenant_language_settings IS '테넌트별 언어 설정을 관리하는 테이블';
COMMENT ON COLUMN tenant_language_settings.id IS '언어 설정의 고유 식별자 (UUID)';
COMMENT ON COLUMN tenant_language_settings.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN tenant_language_settings.default_language_id IS '테넌트 기본 언어 ID (languages 테이블 참조)';
COMMENT ON COLUMN tenant_language_settings.supported_language_ids IS '테넌트에서 지원하는 언어 ID 배열';
COMMENT ON COLUMN tenant_language_settings.auto_translate_enabled IS '자동 번역 활성화 여부 (번역이 없을 때 자동 번역 사용)';
COMMENT ON COLUMN tenant_language_settings.fallback_language_id IS '폴백 언어 ID (번역이 없을 때 사용할 언어, NULL이면 시스템 기본 언어)';
COMMENT ON COLUMN tenant_language_settings.metadata IS '언어 설정의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN tenant_language_settings.created_at IS '언어 설정 생성 시각';
COMMENT ON COLUMN tenant_language_settings.updated_at IS '언어 설정 최종 수정 시각';

-- ============================================
-- 7. TRANSLATABLE CONTENT (번역 가능한 콘텐츠)
-- ============================================

CREATE TABLE translatable_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_type VARCHAR(100) NOT NULL, -- 콘텐츠 타입 (예: 'post', 'category', 'comment')
    content_id UUID NOT NULL, -- 원본 콘텐츠 ID
    field_name VARCHAR(100) NOT NULL, -- 필드 이름 (예: 'title', 'content', 'description')
    translation_key_id UUID REFERENCES translation_keys(id) ON DELETE SET NULL, -- 번역 키 참조
    default_text TEXT, -- 기본 텍스트 (번역 키가 없는 경우)
    language_id UUID REFERENCES languages(id) ON DELETE SET NULL, -- 원본 언어
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(content_type, content_id, field_name)
);

CREATE INDEX idx_translatable_content_content ON translatable_content(content_type, content_id);
CREATE INDEX idx_translatable_content_translation_key_id ON translatable_content(translation_key_id);
CREATE INDEX idx_translatable_content_language_id ON translatable_content(language_id);

COMMENT ON TABLE translatable_content IS '번역 가능한 콘텐츠를 관리하는 테이블. 게시물, 카테고리 등의 다국어 콘텐츠를 추적합니다.';
COMMENT ON COLUMN translatable_content.id IS '콘텐츠의 고유 식별자 (UUID)';
COMMENT ON COLUMN translatable_content.content_type IS '콘텐츠 타입 (예: post, category, comment, tag)';
COMMENT ON COLUMN translatable_content.content_id IS '원본 콘텐츠 ID';
COMMENT ON COLUMN translatable_content.field_name IS '필드 이름 (예: title, content, description)';
COMMENT ON COLUMN translatable_content.translation_key_id IS '번역 키 ID (translation_keys 테이블 참조, NULL이면 직접 번역)';
COMMENT ON COLUMN translatable_content.default_text IS '기본 텍스트 (번역 키가 없는 경우 사용)';
COMMENT ON COLUMN translatable_content.language_id IS '원본 언어 ID (languages 테이블 참조)';
COMMENT ON COLUMN translatable_content.metadata IS '콘텐츠의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN translatable_content.created_at IS '콘텐츠 생성 시각';
COMMENT ON COLUMN translatable_content.updated_at IS '콘텐츠 최종 수정 시각';

-- ============================================
-- 8. TRANSLATION HISTORY (번역 이력)
-- ============================================

CREATE TABLE translation_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    translation_id UUID NOT NULL REFERENCES translations(id) ON DELETE CASCADE,
    old_value TEXT, -- 이전 번역 텍스트
    new_value TEXT NOT NULL, -- 새로운 번역 텍스트
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL, -- 변경한 사용자
    change_reason TEXT, -- 변경 사유
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_translation_history_translation_id ON translation_history(translation_id);
CREATE INDEX idx_translation_history_created_at ON translation_history(created_at);

COMMENT ON TABLE translation_history IS '번역 변경 이력을 관리하는 테이블';
COMMENT ON COLUMN translation_history.id IS '이력의 고유 식별자 (UUID)';
COMMENT ON COLUMN translation_history.translation_id IS '번역 ID (translations 테이블 참조)';
COMMENT ON COLUMN translation_history.old_value IS '이전 번역 텍스트';
COMMENT ON COLUMN translation_history.new_value IS '새로운 번역 텍스트';
COMMENT ON COLUMN translation_history.changed_by IS '변경한 사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN translation_history.change_reason IS '변경 사유';
COMMENT ON COLUMN translation_history.created_at IS '변경 시각';

-- ============================================
-- 9. TRIGGERS FOR UPDATED_AT
-- ============================================

-- Reuse the function from main schema if it exists, otherwise create it
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ language 'plpgsql';
    END IF;
END $$;

CREATE TRIGGER update_languages_updated_at BEFORE UPDATE ON languages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_translation_namespaces_updated_at BEFORE UPDATE ON translation_namespaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_translation_keys_updated_at BEFORE UPDATE ON translation_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_translations_updated_at BEFORE UPDATE ON translations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_language_preferences_updated_at BEFORE UPDATE ON user_language_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_language_settings_updated_at BEFORE UPDATE ON tenant_language_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_translatable_content_updated_at BEFORE UPDATE ON translatable_content
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 10. FUNCTIONS FOR TRANSLATION LOOKUP
-- ============================================

-- Function to get translation with fallback
CREATE OR REPLACE FUNCTION get_translation(
    p_namespace VARCHAR,
    p_key VARCHAR,
    p_language_code VARCHAR,
    p_fallback_language_code VARCHAR DEFAULT 'en'
)
RETURNS TEXT AS $$
DECLARE
    v_translation TEXT;
    v_language_id UUID;
    v_fallback_language_id UUID;
    v_translation_key_id UUID;
BEGIN
    -- Get language IDs
    SELECT id INTO v_language_id FROM languages WHERE code = p_language_code AND is_active = TRUE;
    SELECT id INTO v_fallback_language_id FROM languages WHERE code = p_fallback_language_code AND is_active = TRUE;
    
    -- Get translation key ID
    SELECT tk.id INTO v_translation_key_id
    FROM translation_keys tk
    JOIN translation_namespaces tn ON tk.namespace_id = tn.id
    WHERE tn.name = p_namespace AND tk.key = p_key;
    
    IF v_translation_key_id IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Try to get translation in requested language
    SELECT value INTO v_translation
    FROM translations
    WHERE translation_key_id = v_translation_key_id
    AND language_id = v_language_id
    AND is_approved = TRUE;
    
    -- If not found, try fallback language
    IF v_translation IS NULL AND v_fallback_language_id IS NOT NULL THEN
        SELECT value INTO v_translation
        FROM translations
        WHERE translation_key_id = v_translation_key_id
        AND language_id = v_fallback_language_id
        AND is_approved = TRUE;
    END IF;
    
    RETURN v_translation;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_translation IS '번역을 조회하는 함수. 요청한 언어의 번역이 없으면 폴백 언어를 사용합니다.';

-- ============================================
-- 11. INITIAL DATA - DEFAULT LANGUAGES
-- ============================================

-- Default languages
INSERT INTO languages (code, name, native_name, direction, is_active, is_default, flag_emoji, display_order) VALUES
    ('en', 'English', 'English', 'ltr', TRUE, TRUE, '🇺🇸', 1),
    ('ko', 'Korean', '한국어', 'ltr', TRUE, FALSE, '🇰🇷', 2),
    ('ja', 'Japanese', '日本語', 'ltr', TRUE, FALSE, '🇯🇵', 3),
    ('zh-CN', 'Chinese (Simplified)', '简体中文', 'ltr', TRUE, FALSE, '🇨🇳', 4),
    ('zh-TW', 'Chinese (Traditional)', '繁體中文', 'ltr', TRUE, FALSE, '🇹🇼', 5),
    ('es', 'Spanish', 'Español', 'ltr', TRUE, FALSE, '🇪🇸', 6),
    ('fr', 'French', 'Français', 'ltr', TRUE, FALSE, '🇫🇷', 7),
    ('de', 'German', 'Deutsch', 'ltr', TRUE, FALSE, '🇩🇪', 8),
    ('ar', 'Arabic', 'العربية', 'rtl', TRUE, FALSE, '🇸🇦', 9),
    ('pt', 'Portuguese', 'Português', 'ltr', TRUE, FALSE, '🇵🇹', 10)
ON CONFLICT (code) DO NOTHING;

-- Default translation namespaces
INSERT INTO translation_namespaces (name, description, is_system) VALUES
    ('common', 'Common translations used across all services', TRUE),
    ('auth', 'Authentication and authorization translations', TRUE),
    ('errors', 'Error messages', TRUE),
    ('validation', 'Validation messages', TRUE),
    ('posts', 'Post-related translations', FALSE),
    ('ui', 'UI component translations', TRUE)
ON CONFLICT (name) DO NOTHING;

