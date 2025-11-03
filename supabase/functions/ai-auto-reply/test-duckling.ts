/**
 * Test script for Duckling instance on Railway
 *
 * Usage: deno run --allow-net test-duckling.ts
 */

const DUCKLING_URL = 'https://duckling-production-0c9c.up.railway.app/parse';

const testCases = [
  'dans 1 heure',
  'dans 30 minutes',
  'dans 2 heures',
  'à 14h20',
  'à 15h',
  'demain',
  'ce soir',
  'dans 1 heure et demie'
];

console.log('🧪 Testing Duckling instance on Railway...\n');
console.log(`URL: ${DUCKLING_URL}\n`);

// Test different request formats
const requestFormats = [
  {
    name: 'JSON (Content-Type: application/json)',
    test: async (text: string) => {
      const response = await fetch(DUCKLING_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          locale: 'fr_FR',
          reftime: new Date().toISOString()
        })
      });
      return { status: response.status, body: await response.text() };
    }
  },
  {
    name: 'Form-urlencoded (Content-Type: application/x-www-form-urlencoded)',
    test: async (text: string) => {
      const params = new URLSearchParams({
        text,
        locale: 'fr_FR',
        reftime: new Date().toISOString()
      });

      const response = await fetch(DUCKLING_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      return { status: response.status, body: await response.text() };
    }
  },
  {
    name: 'Query parameters (GET)',
    test: async (text: string) => {
      const params = new URLSearchParams({
        text,
        locale: 'fr_FR',
        reftime: new Date().toISOString()
      });

      const response = await fetch(`${DUCKLING_URL}?${params.toString()}`, {
        method: 'GET'
      });
      return { status: response.status, body: await response.text() };
    }
  }
];

// Test each format
for (const format of requestFormats) {
  console.log(`\n📋 Testing format: ${format.name}`);
  console.log('─'.repeat(60));

  try {
    const result = await format.test(testCases[0]); // Test with first case
    console.log(`Status: ${result.status}`);
    console.log(`Response: ${result.body.substring(0, 200)}${result.body.length > 200 ? '...' : ''}`);

    if (result.status === 200) {
      console.log('✅ This format works!');

      // Test all cases with working format
      console.log('\n🧪 Testing all expressions with working format:\n');

      for (const testText of testCases) {
        try {
          const testResult = await format.test(testText);

          if (testResult.status === 200) {
            try {
              const parsed = JSON.parse(testResult.body);
              console.log(`✅ "${testText}"`);
              console.log(`   Found ${parsed.length} entities`);
              if (parsed.length > 0) {
                console.log(`   → ${JSON.stringify(parsed[0].value)}`);
              }
            } catch {
              console.log(`✅ "${testText}" → Response not JSON: ${testResult.body.substring(0, 100)}`);
            }
          } else {
            console.log(`❌ "${testText}" → Status ${testResult.status}`);
          }
        } catch (error) {
          console.log(`❌ "${testText}" → Error: ${error.message}`);
        }
      }

      break; // Stop after finding working format
    } else {
      console.log('❌ This format does not work');
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

console.log('\n' + '='.repeat(60));
console.log('Test complete!');
