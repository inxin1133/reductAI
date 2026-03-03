-- llm_usage_logs 보조 비용 컬럼 추가
-- total_cost = 토큰비용 + web_search_cost + image_cost + video_cost + audio_cost + music_cost

ALTER TABLE llm_usage_logs
  ADD COLUMN IF NOT EXISTS web_search_cost DECIMAL(10, 6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_cost DECIMAL(10, 6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_cost DECIMAL(10, 6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audio_cost DECIMAL(10, 6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS music_cost DECIMAL(10, 6) DEFAULT 0;

COMMENT ON COLUMN llm_usage_logs.web_search_cost IS '웹검색 비용(USD)';
COMMENT ON COLUMN llm_usage_logs.image_cost IS '이미지 생성 비용(USD)';
COMMENT ON COLUMN llm_usage_logs.video_cost IS '영상 생성 비용(USD)';
COMMENT ON COLUMN llm_usage_logs.audio_cost IS '오디오(STT/TTS) 비용(USD)';
COMMENT ON COLUMN llm_usage_logs.music_cost IS '음악 생성 비용(USD)';
