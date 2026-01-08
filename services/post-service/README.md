# post-service (Block Editor / Notion-style)

## 목적
- Notion과 유사한 **블록 기반 문서 편집**을 위한 백엔드 서비스
- 문서를 **블록 단위로 저장/검색/부분 수정** 가능하도록 설계
- 에디터 원본은 **ProseMirror JSON(doc.toJSON())**

## 실행 (.env 예시)
```bash
PORT=3005
POSTGRES_USER=reduct
POSTGRES_PASSWORD=...
POSTGRES_DB=reductai
POSTGRES_HOST=host.docker.internal
POSTGRES_PORT=5432
JWT_SECRET=...
```

## API (MVP)

### 문서(JSON) 저장/로드 (교체 저장)
- `GET /api/posts/:id/content`
  - response: `{ docJson, version }`
- `POST /api/posts/:id/content`
  - body: `{ docJson, version }`
  - response: `{ ok: true, version }`
  - `version`이 서버와 다르면 `409 Version conflict`

### 블록 단위 부분 수정 (Notion-style)
- `GET /api/posts/:id/blocks?parentBlockId=<uuid|null>`
- `POST /api/posts/:id/blocks`
  - body: `{ block_type, parentBlockId?, content?, contentText?, refPostId?, externalEmbedId?, beforeBlockId?, afterBlockId? }`
- `PATCH /api/posts/:id/blocks/:blockId`
- `DELETE /api/posts/:id/blocks/:blockId` (soft delete)
- `POST /api/posts/:id/blocks/:blockId/reorder`
  - body: `{ parentBlockId?, beforeBlockId?, afterBlockId? }`
- `GET /api/posts/:id/backlinks`

## 데이터 모델 매핑
- `posts.metadata.doc_version`: 문서 버전(optimistic lock)
- `post_blocks`: top-level PM node 1개를 block row 1개로 저장
  - `content.pm`: ProseMirror node JSON
  - `content_text`: 검색/리스트 최적화용 텍스트 캐시
  - `ref_post_id`: `page_link` 등 내부 페이지 참조용 FK


