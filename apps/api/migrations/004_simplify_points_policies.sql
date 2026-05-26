ALTER TABLE points_policies ADD COLUMN IF NOT EXISTS per_chat INTEGER NOT NULL DEFAULT 2;
ALTER TABLE points_policies ADD COLUMN IF NOT EXISTS per_image INTEGER NOT NULL DEFAULT 10;
ALTER TABLE points_policies ADD COLUMN IF NOT EXISTS per_speech INTEGER NOT NULL DEFAULT 2;
ALTER TABLE points_policies ADD COLUMN IF NOT EXISTS per_other INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='points_policies' AND column_name='per_call') THEN
    EXECUTE 'UPDATE points_policies SET per_chat=CASE WHEN per_chat=0 THEN per_call ELSE per_chat END';
  END IF;
END $$;

UPDATE points_policies
SET
  per_image=CASE WHEN per_image=0 THEN 10 ELSE per_image END,
  per_speech=CASE WHEN per_speech=0 THEN 2 ELSE per_speech END,
  per_other=CASE WHEN per_other=0 THEN 1 ELSE per_other END;

INSERT INTO points_policies (id, name, mode, summary, input_per_1k, output_per_1k, per_chat, per_image, per_speech, per_other, enabled)
VALUES
  ('default_call', '默认按次策略', 'per_call', '文字 2 / 图片 10 / 语音 2 / 其他 1 积分', 0, 0, 2, 10, 2, 1, true),
  ('default_token', '默认 Token 策略', 'per_token', '按总 Token 计费，每千 Token 2 积分；图片模型固定使用按次计费', 1, 1, 0, 0, 0, 0, true)
ON CONFLICT (id) DO UPDATE SET
  name=EXCLUDED.name,
  mode=EXCLUDED.mode,
  summary=EXCLUDED.summary,
  input_per_1k=EXCLUDED.input_per_1k,
  output_per_1k=EXCLUDED.output_per_1k,
  per_chat=EXCLUDED.per_chat,
  per_image=EXCLUDED.per_image,
  per_speech=EXCLUDED.per_speech,
  per_other=EXCLUDED.per_other,
  enabled=EXCLUDED.enabled;

UPDATE models
SET points_policy_id='default_call'
WHERE points_policy_id IN ('default_text', 'economy_text', 'premium_text', 'default_image', 'default_tts', 'free_test');

UPDATE models m
SET points_policy_id='default_call'
FROM points_policies p
WHERE m.points_policy_id=p.id AND p.mode='per_token' AND 'image'=ANY(m.capabilities);

DELETE FROM points_policies
WHERE id IN ('default_text', 'economy_text', 'premium_text', 'default_image', 'default_tts', 'free_test');
