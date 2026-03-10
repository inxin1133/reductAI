# 멀티모달 오디오/비디오 지원 현황

> text 모델의 이미지 첨부 멀티모달은 2025-03 적용 완료. 오디오/비디오는 추후 확장 시 참고.

## 구현 완료: 이미지 첨부 (text 채팅)

- **OpenAI** (openaiSimulateChat): `image_data_urls` → `content: [{ type: "text" }, { type: "image_url", image_url: { url } }, ...]`
- **Anthropic** (anthropicSimulateChat): `image_data_urls` → `content: [{ type: "text" }, { type: "image", source: { base64 } }, ...]`
- **Google** (googleSimulateChat): `image_data_urls` → `parts: [{ inlineData }, ... { text }]`
- **웹 검색 경로**: OpenAI tool loop에서도 `userContent`를 멀티모달로 전달

## 오디오/비디오 지원 여부 (API 기준)

### OpenAI
- **GPT-4o**: 텍스트, 오디오, 이미지, **비디오**를 입력으로 받을 수 있음 (omni 모델)
- **Chat Completions API**: 이미지(`image_url`)는 지원. 오디오/비디오는 **Realtime API** 또는 별도 포맷 사용
- **참고**: [Audio and speech | OpenAI](https://platform.openai.com/docs/guides/audio) – Chat Completions에서 오디오 입력 지원 (형식 확인 필요)

### Anthropic (Claude)
- **현재**: 이미지 입력만 지원
- **오디오/비디오**: Messages API에서 공식 지원 안 함 (문서 기준)

### Google Gemini
- **오디오**: `inlineData` / `fileData`로 오디오 파일 전달 가능. 전사, 요약 등 지원
- **비디오**: `inlineData` / `fileData`로 비디오 전달 가능. `videoMetadata`로 구간 지정
- **참고**: [Audio understanding | Gemini API](https://ai.google.dev/gemini-api/docs/audio)

## 오디오/비디오 확장 시 필요한 작업

1. **chatRuntimeController**: `incomingAudioDataUrls`, `incomingVideoDataUrls` 수집
   - 첨부 중 `kind === "file"` && `mime.startsWith("audio/")` || `mime.startsWith("video/")` 처리
   - URL일 경우 fetch → data URL 변환 (이미지와 동일)

2. **providerClients**:
   - **OpenAI**: 오디오/비디오 content part 형식 확인 후 추가
   - **Anthropic**: 미지원 시 해당 첨부는 텍스트 컨텍스트만 사용
   - **Google**: `inlineData`에 `mimeType: "audio/mpeg"` 등으로 전달

3. **프론트엔드**: `addFiles` / `accept`에 `audio/*`, `video/*` 허용 (필요 시)
