// Cron job configuration for processing Evolution API instance creation queue
// This file defines a cron schedule for the process-evolution-queue Edge Function
//
// To enable this cron job, you need to configure it in your Supabase project:
// 1. Go to your Supabase Dashboard
// 2. Navigate to Edge Functions > Cron Jobs
// 3. Add a new cron job with:
//    - Name: process-evolution-queue
//    - Schedule: */5 * * * * (every 5 minutes)
//    - Function: process-evolution-queue
//
// Alternatively, you can use pg_cron extension:
//
// SELECT cron.schedule(
//   'process-evolution-queue',
//   '*/5 * * * *', -- Every 5 minutes
//   $$
//   SELECT
//     net.http_post(
//       url := 'https://YOUR_PROJECT.supabase.co/functions/v1/process-evolution-queue',
//       headers := jsonb_build_object(
//         'Content-Type', 'application/json',
//         'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
//       ),
//       body := '{}'::jsonb
//     );
//   $$
// );

export const config = {
  schedule: '*/5 * * * *', // Run every 5 minutes
  timeout: 60, // 60 seconds timeout
  retryLimit: 3, // Retry up to 3 times on failure
};
