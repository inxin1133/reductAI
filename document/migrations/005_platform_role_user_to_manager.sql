-- Platform 역할 변경: "사용자"(user) -> "매니저"(manager)
-- 2026-03-02

UPDATE roles
SET name = '매니저',
    slug = 'manager',
    updated_at = CURRENT_TIMESTAMP
WHERE scope = 'platform'
  AND slug = 'user';
