# 모델별 크레딧 선검증 참고값

> Admin 모델 관리에서 metadata.credit_restriction 설정 시 참고.  
> `min_credits_from`, `min_credits_to`, `block_below_from`를 "크레딧 선검증" 섹션에서 입력.

## 구조

```json
{
  "credit_restriction": {
    "min_credits_from": 0,
    "min_credits_to": 500,
    "block_below_from": true
  }
}
```

| 필드 | 설명 |
|------|------|
| min_credits_from | 이 크레딧 미만이면 모델 선택 불가 |
| min_credits_to | [from, to] = 마지막 구간. 옵션 기본값만, 이미지 1개 제한 |
| block_below_from | true = from 미만 시 차단 (기본값 true) |

## 모델별 권장값 (참고)

| 모델 | min_credits_from | min_credits_to | 비고 |
|------|------------------|----------------|------|
| GPT-5.2 | 20 | 500 | 텍스트 고비용 |
| GPT-5 mini | 0 | 200 | 텍스트 저비용 |
| GPT-5.2-Codex | 0 | 500 | 코드 |
| Gemini 3 Pro | 0 | 500 | 텍스트 |
| Gemini 3 Flash | 0 | 200 | 텍스트 저비용 |
| GPT Image 1.5 | 100 | 2000 | 이미지 생성 |
| Gemini 3 Pro Image | 100 | 2000 | 이미지 |
| Gemini 2.5/3.1 Flash Image | 50 | 1000 | 이미지 저비용 |
| Sora 2 / Sora 2 Pro | 500 | 5000 | 비디오 |
| Lyria 2 | 50 | 600 | 음악 (30초당 기준) |
| GPT-o4 mini TTS | 0 | 200 | 음성 |

## 적용 방법

1. Admin → AI → 모델 관리
2. 모델 편집
3. "크레딧 선검증" 섹션에서 min_credits_from, min_credits_to 입력
4. 저장 시 metadata에 credit_restriction이 자동 병합됨
