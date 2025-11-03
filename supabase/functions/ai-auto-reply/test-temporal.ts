/**
 * Test script for Chrono-node French temporal parsing
 * Run with: deno run --allow-net test-temporal.ts
 */

import * as chrono from 'https://esm.sh/chrono-node@2.9.0';

function testTemporalParsing() {
  const referenceDate = new Date('2025-11-03T13:30:00+01:00'); // 13:30 CET

  const testCases = [
    "dans 1h",
    "dans 30 minutes",
    "dans 2 heures",
    "à 14h20",
    "à 15h",
    "à 14h",
    "demain",
    "ce soir",
    "dans 1 heure et demie",
    "T'es dispo dans 1h",
    "Je peux venir dans 30min",
    "Rdv à 14h20 ça te va ?",
    "Je serai là dans une heure"
  ];

  console.log('=== Testing Chrono-node French Temporal Parsing ===');
  console.log('Reference time:', referenceDate.toISOString());
  console.log('Reference time (local):', referenceDate.toLocaleString('fr-FR'));
  console.log('');

  for (const testCase of testCases) {
    console.log(`\nTest: "${testCase}"`);
    const results = chrono.fr.parse(testCase, referenceDate);

    if (results.length === 0) {
      console.log('  ❌ No temporal entities found');
    } else {
      for (const result of results) {
        const parsedDate = result.start.date();
        console.log(`  ✅ Found: "${result.text}"`);
        console.log(`     Parsed as: ${parsedDate.toISOString()}`);
        console.log(`     Formatted: ${parsedDate.toLocaleString('fr-FR')}`);

        // Calculate time difference
        const diffMinutes = Math.round((parsedDate.getTime() - referenceDate.getTime()) / (1000 * 60));
        console.log(`     Time from reference: ${diffMinutes} minutes`);
      }
    }
  }

  console.log('\n=== Test Complete ===');
}

testTemporalParsing();
