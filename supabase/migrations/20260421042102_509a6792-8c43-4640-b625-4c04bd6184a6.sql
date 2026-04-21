
ALTER TABLE public.profiles
  ADD COLUMN caregiver_telegram_chat_id TEXT,
  ADD COLUMN missed_alert_minutes INT NOT NULL DEFAULT 30;

ALTER TABLE public.adherence_log
  DROP CONSTRAINT adherence_log_status_check,
  ADD CONSTRAINT adherence_log_status_check
    CHECK (status IN ('fired','taken','skipped','missed'));

ALTER TABLE public.adherence_log
  ADD COLUMN missed_alert_sent BOOLEAN NOT NULL DEFAULT false;
