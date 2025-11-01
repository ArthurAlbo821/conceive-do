-- Setup script for QR code refresh cron job
-- This script configures a cron job to automatically refresh QR codes every minute
-- for all Evolution API instances in "connecting" status

-- Step 1: Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step 2: Unschedule existing job if it exists (to allow re-running this script)
SELECT cron.unschedule('refresh-qr-codes')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'refresh-qr-codes'
);

-- Step 3: Create the cron job to refresh QR codes every minute
SELECT cron.schedule(
  'refresh-qr-codes',           -- Job name
  '*/1 * * * *',                -- Every 1 minute
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/refresh-qr-codes',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Step 4: Verify the cron job was created
SELECT
  jobid,
  jobname,
  schedule,
  active,
  jobid IN (SELECT jobid FROM cron.job_run_details) as has_run
FROM cron.job
WHERE jobname = 'refresh-qr-codes';

-- Expected output:
-- jobid | jobname              | schedule      | active | has_run
-- ------|----------------------|---------------|--------|--------
-- XXX   | refresh-qr-codes     | */1 * * * *   | t      | f (initially)

COMMENT ON EXTENSION pg_cron IS 'Enables cron-based job scheduling within PostgreSQL';
COMMENT ON EXTENSION pg_net IS 'Enables asynchronous HTTP requests from PostgreSQL';

-- To manually trigger the job for testing:
-- SELECT net.http_post(
--   url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/refresh-qr-codes',
--   headers := jsonb_build_object(
--     'Content-Type', 'application/json',
--     'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
--   ),
--   body := '{}'::jsonb
-- );

-- To view job execution history:
-- SELECT
--   job.jobname,
--   details.start_time,
--   details.end_time,
--   details.status,
--   details.return_message,
--   (details.end_time - details.start_time) as duration
-- FROM cron.job_run_details details
-- JOIN cron.job job ON details.jobid = job.jobid
-- WHERE job.jobname = 'refresh-qr-codes'
-- ORDER BY details.start_time DESC
-- LIMIT 20;

-- To disable the cron job (without deleting it):
-- UPDATE cron.job SET active = false WHERE jobname = 'refresh-qr-codes';

-- To re-enable the cron job:
-- UPDATE cron.job SET active = true WHERE jobname = 'refresh-qr-codes';

-- To completely remove the cron job:
-- SELECT cron.unschedule('refresh-qr-codes');
