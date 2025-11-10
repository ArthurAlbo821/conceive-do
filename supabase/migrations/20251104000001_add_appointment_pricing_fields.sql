-- Migration: Add pricing fields to appointments table
-- This allows storing detailed price information for each appointment

-- Add columns for structured extras with prices and price totals
ALTER TABLE public.appointments
ADD COLUMN selected_extras JSONB DEFAULT '[]'::jsonb,
ADD COLUMN base_price NUMERIC(10, 2),
ADD COLUMN extras_total NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN total_price NUMERIC(10, 2);

-- Add comment for documentation
COMMENT ON COLUMN public.appointments.selected_extras IS 'Array of selected extras with their prices: [{name: string, price: number}, ...]';
COMMENT ON COLUMN public.appointments.base_price IS 'Base price for the selected duration/service';
COMMENT ON COLUMN public.appointments.extras_total IS 'Total price of all selected extras';
COMMENT ON COLUMN public.appointments.total_price IS 'Total price (base_price + extras_total)';
