-- Drop the restrictive time range constraint that prevents slots crossing midnight
ALTER TABLE public.availabilities DROP CONSTRAINT IF EXISTS valid_time_range;

-- Add a more informative comment to the table
COMMENT ON TABLE public.availabilities IS 'User availability slots. Supports slots crossing midnight (e.g., 22:00 to 02:00)';