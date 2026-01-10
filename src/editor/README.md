# ProseMirror Editor Module

요구사항에 맞춰 **모듈 분리 구조**로 구성되어 있습니다.

## 폴더 구조
- `src/editor/schema`: 전체 Schema 조립(`editorSchema`)
- `src/editor/nodes`: 커스텀 노드(`image`, `mention`, `page_link`)
- `src/editor/marks`: 커스텀 마크(`link`)
- `src/editor/plugins`: 플러그인(`inputRules`, `mentionPlugin` 등)
- `src/editor/commands`: 툴바/단축키용 command 모음
- `src/editor/keymaps`: 기본 키맵 + Tab/Shift+Tab 리스트 들여쓰기 + Shift+Enter hard_break
- `src/editor/serializers`: `json`, `markdown` export

## 커스텀 노드 확장 방법 (예: video)
1) `src/editor/nodes/video.ts` 생성 (NodeSpec 작성)
2) `src/editor/schema/index.ts`에서 `editorSchema`에 `.addToEnd("video", videoNodeSpec)` 추가
3) (선택) `src/editor/commands/index.ts`에 삽입 command 추가
4) (선택) `src/editor/serializers/markdown.ts`에 fallback serializer 추가

## Markdown export fallback 정책
Markdown과 1:1 매핑이 어려운 노드들은 fallback 표현을 사용합니다.
- `table` → `[Table]`
- `page_link` → `[[title|pageId|display]]`
- `mention` → `@label`

## Input rules & shortcuts (수정/추가 위치)

- **Typing rules (입력 규칙)**: `src/editor/plugins/inputRules.ts`
  - 예: `- ` → bullet list, `1. ` → ordered list, `"> "`/`" "` → quote, `` `code` `` → code mark
- **Shortcuts (단축키)**: `src/editor/keymaps/index.ts`
  - 예: `Mod-b`(bold), `Mod-i`(italic), undo/redo, list indent 등
- **Mention (@) 동작**: `src/editor/plugins/mentionPlugin.ts`
  - `@...` 매칭/드롭다운/키 처리(Enter/Arrow/Escape) 수정은 여기서

## 데모 페이지
- 프론트 라우트: `/posts/:id/edit`
- 동작:
  - load: `GET /api/posts/:id/content`
  - save: `POST /api/posts/:id/content`
  - export: 화면 하단에 Markdown/JSON 미리보기


