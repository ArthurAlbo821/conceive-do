// Cron job configuration for refreshing Evolution API QR codes
// This file defines a cron schedule for the refresh-qr-codes Edge Function
//
// To enable this cron job, you need to configure it in your Supabase project:
// 1. Go to your Supabase Dashboard
// 2. Navigate to Database > Extensions
// 3. Enable pg_cron and pg_net extensions
// 4. Go to SQL Editor
// 5. Execute the following SQL:
//
// SELECT cron.schedule(
//   'refresh-qr-codes',
//   '*/1 * * * *', -- Every 1 minute
//   $$
//   SELECT
//     net.http_post(
//       url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/refresh-qr-codes',
//       headers := jsonb_build_object(
//         'Content-Type', 'application/json',
//         'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
//       ),
//       body := '{}'::jsonb
//     );
//   $$
// );
//
// IMPORTANT: Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY with your actual values
//
// To verify the cron job is running:
// SELECT * FROM cron.job WHERE jobname = 'refresh-qr-codes';
//
// To view execution history:
// SELECT * FROM cron.job_run_details
// WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'refresh-qr-codes')
// ORDER BY start_time DESC LIMIT 10;
//
// To stop the cron job:
// SELECT cron.unschedule('refresh-qr-codes');

export const config = {
  schedule: '*/1 * * * *', // Run every 1 minute
  timeout: 30, // 30 seconds timeout (enough for multiple instances)
  retryLimit: 2, // Retry up to 2 times on failure
};
