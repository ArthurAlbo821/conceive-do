/**
 * Tests for appointment validation
 * Tests enum validation and format validation
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateAppointmentEnums } from '../appointments/validation.ts';
import type { AppointmentData, DynamicEnums } from '../types.ts';

/**
 * Helper: Create test appointment data
 */
function createAppointmentData(
  duration: string,
  extras: string[],
  date: string,
  time: string
): AppointmentData {
  return {
    duration,
    selected_extras: extras,
    appointment_date: date,
    appointment_time: time
  };
}

/**
 * Helper: Create test enums
 */
function createEnums(durations: string[], extras: string[]): DynamicEnums {
  return {
    durationEnum: durations,
    extraEnum: extras,
    prestationEnum: []
  };
}

Deno.test('validateAppointmentEnums - valid duration and extras', () => {
  const appointmentData = createAppointmentData(
    '1h',
    ['Anal', 'Duo'],
    '2025-01-15',
    '14:30'
  );
  const enums = createEnums(
    ['30min', '1h', '2h'],
    ['Anal', 'Duo', 'Bisous']
  );

  const result = validateAppointmentEnums(appointmentData, enums);

  assertEquals(result.isValid, true);
  assertEquals(result.invalidFields.length, 0);
  assertEquals(result.errors.length, 0);
});

Deno.test('validateAppointmentEnums - invalid duration', () => {
  const appointmentData = createAppointmentData(
    '3h', // Not in enum
    ['Anal'],
    '2025-01-15',
    '14:30'
  );
  const enums = createEnums(
    ['30min', '1h', '2h'],
    ['Anal', 'Duo']
  );

  const result = validateAppointmentEnums(appointmentData, enums);

  assertEquals(result.isValid, false);
  assertEquals(result.invalidFields.includes('duration'), true);
  assertEquals(result.errors.length > 0, true);
  assertEquals(result.errors[0].includes('3h'), true);
});

Deno.test('validateAppointmentEnums - invalid extra', () => {
  const appointmentData = createAppointmentData(
    '1h',
    ['InvalidExtra'], // Not in enum
    '2025-01-15',
    '14:30'
  );
  const enums = createEnums(
    ['30min', '1h', '2h'],
    ['Anal', 'Duo', 'Bisous']
  );

  const result = validateAppointmentEnums(appointmentData, enums);

  assertEquals(result.isValid, false);
  assertEquals(result.invalidFields.includes('selected_extras'), true);
  assertEquals(result.errors.length > 0, true);
  assertEquals(result.errors[0].includes('InvalidExtra'), true);
});

Deno.test('validateAppointmentEnums - empty extras (valid)', () => {
  const appointmentData = createAppointmentData(
    '1h',
    [], // Empty is valid
    '2025-01-15',
    '14:30'
  );
  const enums = createEnums(
    ['30min', '1h', '2h'],
    ['Anal', 'Duo']
  );

  const result = validateAppointmentEnums(appointmentData, enums);

  assertEquals(result.isValid, true);
  assertEquals(result.invalidFields.length, 0);
});

Deno.test('validateAppointmentEnums - "aucun" extra (valid)', () => {
  const appointmentData = createAppointmentData(
    '1h',
    ['aucun'], // Special value for "no extras"
    '2025-01-15',
    '14:30'
  );
  const enums = createEnums(
    ['30min', '1h', '2h'],
    ['Anal', 'Duo'] // 'aucun' not in enum but should be accepted
  );

  const result = validateAppointmentEnums(appointmentData, enums);

  assertEquals(result.isValid, true);
  assertEquals(result.invalidFields.length, 0);
});

Deno.test('validateAppointmentEnums - multiple invalid extras', () => {
  const appointmentData = createAppointmentData(
    '1h',
    ['Invalid1', 'Invalid2'],
    '2025-01-15',
    '14:30'
  );
  const enums = createEnums(
    ['30min', '1h', '2h'],
    ['Anal', 'Duo']
  );

  const result = validateAppointmentEnums(appointmentData, enums);

  assertEquals(result.isValid, false);
  assertEquals(result.invalidFields.includes('selected_extras'), true);
  // Should report only once (breaks after first invalid extra)
  assertEquals(result.errors.length, 1);
});

Deno.test('validateAppointmentEnums - both duration and extra invalid', () => {
  const appointmentData = createAppointmentData(
    '5h', // Invalid
    ['InvalidExtra'], // Invalid
    '2025-01-15',
    '14:30'
  );
  const enums = createEnums(
    ['30min', '1h', '2h'],
    ['Anal', 'Duo']
  );

  const result = validateAppointmentEnums(appointmentData, enums);

  assertEquals(result.isValid, false);
  assertEquals(result.invalidFields.includes('duration'), true);
  assertEquals(result.invalidFields.includes('selected_extras'), true);
  assertEquals(result.errors.length, 2); // Two errors
});

Deno.test('validateAppointmentEnums - case sensitive validation', () => {
  const appointmentData = createAppointmentData(
    '1H', // Wrong case
    ['anal'], // Wrong case
    '2025-01-15',
    '14:30'
  );
  const enums = createEnums(
    ['30min', '1h', '2h'],
    ['Anal', 'Duo']
  );

  const result = validateAppointmentEnums(appointmentData, enums);

  // Should be invalid (case-sensitive)
  assertEquals(result.isValid, false);
  assertEquals(result.invalidFields.length > 0, true);
});
