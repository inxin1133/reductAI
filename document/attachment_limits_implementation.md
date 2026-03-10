# 첨부 파일 제한 구현 요약

## 1. MODEL_MAX_REFERENCE_IMAGES 제거
- **변경**: `capabilities.limits.max_reference_images`를 최우선으로 사용
- **이유**: 모델 추가/변경 시 DB `ai_models.capabilities`만 수정하면 되며, 코드 배포 없이 운영 가능
- **fallback**: capabilities에 값이 없으면 6

## 2. 용량 제한 (Free 7MB / Pro+ 20MB)
| 등급 | 이미지 | 일반 파일 |
|------|--------|-----------|
| Free | 7MB | 7MB |
| Pro 이상 | 20MB | 20MB |

## 3. 이미지/파일 첨부 용량 분리
- `getEffectiveMaxAttachmentBytes(planTier, "image" | "file")` 로 kind별 적용
- 이미지와 일반 파일에 각각 별도 한도 적용 가능 (현재는 동일 값)

## 4. File-service 총괄 제어
**구조**: file-service가 첨부 용량의 단일 소스로 동작

- **환경변수** (file-service)
  - `ATTACHMENT_IMAGE_MAX_BYTES_FREE` (기본 7MB)
  - `ATTACHMENT_IMAGE_MAX_BYTES_DEFAULT` (기본 20MB)
  - `ATTACHMENT_FILE_MAX_BYTES_FREE` (기본 7MB)
  - `ATTACHMENT_FILE_MAX_BYTES_DEFAULT` (기본 20MB)

- **API 전달**
  - `createMediaAsset` (JSON): `plan_tier` body
  - `createMediaAssetUpload` (binary): `plan_tier` query
  - `plan_tier` 없으면 DEFAULT(20MB) 적용 (post_upload 등)

- **연결 구조**
  - Frontend → file-service (plan_tier 쿼리)
  - ai-agent-service → file-service (plan_tier body)
  - post-service / ProseMirrorEditor: plan_tier 미전달 시 20MB

**이 방식의 이유**
- 용량 한도를 file-service 한 곳에서 관리
- ai-agent-service, post-service 등 호출부는 plan_tier만 전달
- 환경변수로 운영 시 값만 변경 가능
- post_upload 등 plan_tier 없음 → DEFAULT로 허용적으로 처리
