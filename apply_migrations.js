#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read environment variables
const envContent = readFileSync(join(__dirname, '.env'), 'utf-8');
const supabaseUrl = envContent.match(/VITE_SUPABASE_URL="(.+)"/)?.[1];
const supabaseKey = envContent.match(/VITE_SUPABASE_ANON_KEY="(.+)"/)?.[1];

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Could not find Supabase credentials in .env file');
  process.exit(1);
}

console.log('🔗 Connecting to Supabase:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
});

// Read SQL file
const sqlContent = readFileSync(join(__dirname, 'apply_migrations_direct.sql'), 'utf-8');

console.log('📝 Applying migrations...\n');

// Split by statements and execute
const statements = sqlContent
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

let successCount = 0;
let errorCount = 0;

for (let i = 0; i < statements.length; i++) {
  const statement = statements[i] + ';';

  // Skip comments
  if (statement.startsWith('--') || statement.startsWith('COMMENT')) {
    continue;
  }

  // Extract meaningful description for logs
  let description = 'Statement ' + (i + 1);
  if (statement.includes('ALTER TABLE appointments')) {
    description = 'Adding columns to appointments table';
  } else if (statement.includes('ALTER TABLE user_informations')) {
    description = 'Adding columns to user_informations table';
  } else if (statement.includes('ALTER TABLE conversations')) {
    description = 'Adding columns to conversations table';
  } else if (statement.includes('CREATE INDEX')) {
    description = 'Creating index';
  } else if (statement.includes('CREATE OR REPLACE FUNCTION')) {
    if (statement.includes('complete_appointment_and_unpin')) {
      description = 'Creating complete_appointment_and_unpin function';
    } else if (statement.includes('get_todays_appointments_with_status')) {
      description = 'Creating get_todays_appointments_with_status function';
    } else if (statement.includes('auto_pin_conversation_on_appointment_confirm')) {
      description = 'Creating auto_pin_conversation trigger function';
    }
  } else if (statement.includes('CREATE TRIGGER')) {
    description = 'Creating auto-pin trigger';
  } else if (statement.includes('DELETE FROM appointments')) {
    description = 'Cleaning up duplicate appointments';
  } else if (statement.includes('ADD CONSTRAINT unique_appointment_slot')) {
    description = 'Adding UNIQUE constraint to prevent duplicates';
  } else if (statement.includes('GRANT EXECUTE')) {
    description = 'Granting permissions';
  }

  try {
    console.log(`⏳ ${description}...`);

    const { error } = await supabase.rpc('exec_sql', { sql_query: statement });

    if (error) {
      console.error(`❌ ${description} - FAILED:`, error.message);
      errorCount++;
    } else {
      console.log(`✅ ${description} - SUCCESS`);
      successCount++;
    }
  } catch (err) {
    console.error(`❌ ${description} - ERROR:`, err.message);
    errorCount++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`✅ Successful: ${successCount}`);
console.log(`❌ Failed: ${errorCount}`);
console.log('='.repeat(60));

if (errorCount === 0) {
  console.log('\n🎉 All migrations applied successfully!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some migrations failed. Check errors above.');
  process.exit(1);
}
