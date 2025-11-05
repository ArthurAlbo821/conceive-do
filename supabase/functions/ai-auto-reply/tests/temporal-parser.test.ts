/**
 * Tests for temporal parsing
 * Tests Duckling and Chrono fallback logic
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { enrichMessageWithTemporalInfo } from '../temporal/enrichment.ts';

Deno.test('enrichMessageWithTemporalInfo - message without temporal entities', () => {
  const message = 'Bonjour, je voudrais un rendez-vous';
  const entities: any[] = [];
  const currentDateTime = 'Il est actuellement 14:30 le mercredi 15 janvier 2025';

  const result = enrichMessageWithTemporalInfo(message, entities, currentDateTime);

  // Should return original message when no entities
  assertEquals(result, message);
});

Deno.test('enrichMessageWithTemporalInfo - message with time entity', () => {
  const message = 'Je voudrais à 16h30';
  const entities = [
    {
      dim: 'time',
      body: '16h30',
      value: {
        value: '2025-01-15T16:30:00.000+01:00',
        grain: 'minute'
      }
    }
  ];
  const currentDateTime = 'Il est actuellement 14:30 le mercredi 15 janvier 2025';

  const result = enrichMessageWithTemporalInfo(message, entities, currentDateTime);

  // Should enrich the message with temporal info
  assertEquals(result.includes('16h30'), true);
  assertEquals(result.includes('[16:30'), true || result.includes('2025-01-15'), true);
});

Deno.test('enrichMessageWithTemporalInfo - relative time (dans 2 heures)', () => {
  const message = 'Je voudrais dans 2 heures';
  const entities = [
    {
      dim: 'time',
      body: 'dans 2 heures',
      value: {
        value: '2025-01-15T16:30:00.000+01:00',
        grain: 'hour'
      }
    }
  ];
  const currentDateTime = 'Il est actuellement 14:30 le mercredi 15 janvier 2025';

  const result = enrichMessageWithTemporalInfo(message, entities, currentDateTime);

  // Should add explicit time
  assertEquals(result.includes('dans 2 heures'), true);
  assertEquals(result.includes('['), true); // Should have bracket notation
});

Deno.test('enrichMessageWithTemporalInfo - multiple temporal entities', () => {
  const message = 'Je voudrais demain à 14h';
  const entities = [
    {
      dim: 'time',
      body: 'demain',
      value: {
        value: '2025-01-16T00:00:00.000+01:00',
        grain: 'day'
      }
    },
    {
      dim: 'time',
      body: '14h',
      value: {
        value: '2025-01-16T14:00:00.000+01:00',
        grain: 'hour'
      }
    }
  ];
  const currentDateTime = 'Il est actuellement 14:30 le mercredi 15 janvier 2025';

  const result = enrichMessageWithTemporalInfo(message, entities, currentDateTime);

  // Should enrich all entities
  assertEquals(result.includes('demain'), true);
  assertEquals(result.includes('14h'), true);
  assertEquals(result.includes('['), true);
});

Deno.test('enrichMessageWithTemporalInfo - handles empty body', () => {
  const message = 'Je voudrais un rdv';
  const entities = [
    {
      dim: 'time',
      body: '', // Empty body edge case
      value: {
        value: '2025-01-15T16:00:00.000+01:00',
        grain: 'hour'
      }
    }
  ];
  const currentDateTime = 'Il est actuellement 14:30 le mercredi 15 janvier 2025';

  const result = enrichMessageWithTemporalInfo(message, entities, currentDateTime);

  // Should handle gracefully
  assertEquals(typeof result, 'string');
});
