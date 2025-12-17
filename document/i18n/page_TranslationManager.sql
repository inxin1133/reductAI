-- 1) 네임스페이스가 없으면 생성 (있으면 생략)
INSERT INTO translation_namespaces (name, description, is_system)
VALUES 
  ('common', '공통 UI 번역', TRUE),
  ('ui', 'UI 영역 번역', TRUE)
ON CONFLICT (name) DO NOTHING;

-- 2) 번역 키 생성 (ui.translation_manager.* , common.search, common.page)
INSERT INTO translation_keys (namespace_id, key, description)
SELECT tn.id, tk.key, tk.description
FROM translation_namespaces tn
JOIN (
  VALUES 
    ('ui', 'translation_manager.description', '번역 관리 상단 설명'),
    ('ui', 'translation_manager.search_placeholder', '검색 입력 placeholder'),
    ('common', 'search', '검색 버튼 텍스트'),
    ('common', 'page', '페이지 표기 텍스트')
) AS tk(ns, key, description) ON TRUE
WHERE tn.name = tk.ns
ON CONFLICT (namespace_id, key) DO NOTHING;

-- 3) 언어별 번역값 입력 (예: en/ko)
--   필요 언어만 넣으세요. 이미 있는 경우 ON CONFLICT로 업데이트합니다.
WITH lang AS (
  SELECT id, code FROM languages WHERE code IN ('en','ko')
), tk AS (
  SELECT tk.id, tn.name AS ns, tk.key
  FROM translation_keys tk
  JOIN translation_namespaces tn ON tk.namespace_id = tn.id
  WHERE (tn.name, tk.key) IN (
    ('ui','translation_manager.description'),
    ('ui','translation_manager.search_placeholder'),
    ('common','search'),
    ('common','page')
  )
)
INSERT INTO translations (translation_key_id, language_id, value, is_approved)
SELECT
  tk.id,
  l.id,
  v.val,
  TRUE
FROM tk
JOIN lang l ON TRUE
JOIN (
  VALUES
    -- ui.translation_manager.description
    ('ui','translation_manager.description','en','Manage all translations in the system.'),
    ('ui','translation_manager.description','ko','시스템 내 모든 다국어 번역 데이터를 조회하고 수정합니다.'),

    -- ui.translation_manager.search_placeholder
    ('ui','translation_manager.search_placeholder','en','Search by key or description...'),
    ('ui','translation_manager.search_placeholder','ko','키 또는 설명 검색...'),

    -- common.search
    ('common','search','en','Search'),
    ('common','search','ko','검색'),

    -- common.page
    ('common','page','en','Page'),
    ('common','page','ko','페이지')
  ) AS v(ns, key, lang_code, val) ON TRUE
WHERE l.code = v.lang_code AND tk.ns = v.ns AND tk.key = v.key
ON CONFLICT (translation_key_id, language_id) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = CURRENT_TIMESTAMP;