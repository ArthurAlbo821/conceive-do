/**
 * Tests for availability calculator
 * Tests complex scenarios including midnight crossing
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { computeAvailableRanges } from '../availability/calculator.ts';
import type { Availability, Appointment } from '../types.ts';

/**
 * Helper: Create test availability
 */
function createAvailability(
  dayOfWeek: number,
  startTime: string,
  endTime: string
): Availability {
  return {
    id: crypto.randomUUID(),
    user_id: 'test-user',
    day_of_week: dayOfWeek,
    start_time: startTime,
    end_time: endTime,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

/**
 * Helper: Create test appointment
 */
function createAppointment(
  date: string,
  startTime: string,
  durationMinutes: number
): Appointment {
  const [hours, minutes] = startTime.split(':').map(Number);
  const endMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(endMinutes / 60) % 24;
  const endMins = endMinutes % 60;
  const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

  return {
    id: crypto.randomUUID(),
    user_id: 'test-user',
    conversation_id: 'test-conv',
    appointment_date: date,
    start_time: startTime,
    end_time: endTime,
    duration: `${durationMinutes}min`,
    selected_extras: [],
    status: 'pending',
    total_price: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

Deno.test('computeAvailableRanges - no availabilities', () => {
  const currentDate = new Date('2025-01-15T14:00:00+01:00'); // Wednesday
  const result = computeAvailableRanges([], [], currentDate);
  assertEquals(result, 'Aucune dispo configurée');
});

Deno.test('computeAvailableRanges - not available today', () => {
  const currentDate = new Date('2025-01-15T14:00:00+01:00'); // Wednesday (day 3)
  const availabilities = [
    createAvailability(1, '10:00', '18:00') // Monday
  ];
  const result = computeAvailableRanges(availabilities, [], currentDate);
  assertEquals(result, 'Pas dispo aujourd\'hui');
});

Deno.test('computeAvailableRanges - simple availability without appointments', () => {
  const currentDate = new Date('2025-01-15T10:00:00+01:00'); // Wednesday 10:00
  const availabilities = [
    createAvailability(3, '14:00', '18:00') // Wednesday 14h-18h
  ];
  const result = computeAvailableRanges(availabilities, [], currentDate);
  assertEquals(result, '14h-18h');
});

Deno.test('computeAvailableRanges - availability with existing appointment', () => {
  const currentDate = new Date('2025-01-15T10:00:00+01:00'); // Wednesday 10:00
  const availabilities = [
    createAvailability(3, '14:00', '20:00') // Wednesday 14h-20h
  ];
  const appointments = [
    createAppointment('2025-01-15', '16:00', 60) // 16h-17h booked
  ];
  const result = computeAvailableRanges(availabilities, appointments, currentDate);
  // Should show: 14h-16h and 17h-20h
  assertEquals(result.includes('14h-16h'), true);
  assertEquals(result.includes('17h-20h'), true);
});

Deno.test('computeAvailableRanges - midnight crossing availability (18h30-2h)', () => {
  const currentDate = new Date('2025-01-15T16:00:00+01:00'); // Wednesday 16:00
  const availabilities = [
    createAvailability(3, '18:30', '02:00') // Wednesday 18:30 to Thursday 02:00
  ];
  const result = computeAvailableRanges(availabilities, [], currentDate);
  // Should show midnight crossing format
  assertEquals(result.includes('18h30'), true);
  assertEquals(result.includes('2h'), true);
  assertEquals(result.includes('jusqu\'à demain matin'), true);
});

Deno.test('computeAvailableRanges - respect lead time (30 minutes)', () => {
  const currentDate = new Date('2025-01-15T14:20:00+01:00'); // Wednesday 14:20
  const availabilities = [
    createAvailability(3, '14:00', '18:00') // Wednesday 14h-18h
  ];
  const result = computeAvailableRanges(availabilities, [], currentDate);
  // Should start at 14:50 (14:20 + 30min lead time), not 14:00
  // Result should not include times before 14:50
  assertEquals(result.includes('14h-'), false);
  assertEquals(true, result.includes('15h') || result.includes('14h5'));
});

Deno.test('computeAvailableRanges - multiple availability windows', () => {
  const currentDate = new Date('2025-01-15T10:00:00+01:00'); // Wednesday 10:00
  const availabilities = [
    createAvailability(3, '10:00', '12:00'), // Morning
    createAvailability(3, '14:00', '18:00')  // Afternoon
  ];
  const result = computeAvailableRanges(availabilities, [], currentDate);
  // Should show both windows
  assertEquals(result.includes('10h') || result.includes('10h3'), true); // After lead time
  assertEquals(result.includes('14h'), true);
});

Deno.test('computeAvailableRanges - all time slots occupied', () => {
  const currentDate = new Date('2025-01-15T10:00:00+01:00'); // Wednesday 10:00
  const availabilities = [
    createAvailability(3, '14:00', '16:00')
  ];
  const appointments = [
    createAppointment('2025-01-15', '14:00', 120) // Entire 14h-16h booked
  ];
  const result = computeAvailableRanges(availabilities, appointments, currentDate);
  assertEquals(result, 'Aucun créneau dispo aujourd\'hui');
});

Deno.test('computeAvailableRanges - past availability window', () => {
  const currentDate = new Date('2025-01-15T19:00:00+01:00'); // Wednesday 19:00
  const availabilities = [
    createAvailability(3, '14:00', '18:00') // Window already passed
  ];
  const result = computeAvailableRanges(availabilities, [], currentDate);
  // All time in the past, no available slots
  assertEquals(result, 'Aucun créneau dispo aujourd\'hui');
});
