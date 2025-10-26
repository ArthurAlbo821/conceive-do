-- Add instance_token column to store the API-generated token
ALTER TABLE evolution_instances 
ADD COLUMN instance_token TEXT;