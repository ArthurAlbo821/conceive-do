/**
 * Pricing utilities for appointment calculations
 * All price calculations are done server-side to prevent AI hallucinations
 */

import type { Tarif, Extra, PriceMappings, StructuredExtra } from '../types.ts';

/**
 * Builds price mapping objects from user tarifs and extras
 * These mappings are used for server-side price validation and calculation
 * 
 * @param tarifs - Array of user tarifs (duration → price)
 * @param extras - Array of user extras (name → price)
 * @returns Object with durationToPriceMap and extraToPriceMap
 * 
 * @example
 * const mappings = buildPriceMappings(userInfo.tarifs, userInfo.extras);
 * const price = mappings.durationToPriceMap['1h']; // 150
 */
export function buildPriceMappings(
  tarifs: Tarif[],
  extras: Extra[]
): PriceMappings {
  // Build duration → price mapping
  const durationToPriceMap: Record<string, number> = Object.fromEntries(
    tarifs.map((t) => [t.duration, t.price])
  );

  // Build extra name → price mapping
  const extraToPriceMap: Record<string, number> = Object.fromEntries(
    extras.map((e) => [e.name, e.price])
  );

  return {
    durationToPriceMap,
    extraToPriceMap
  };
}

/**
 * Converts duration string to minutes
 * Supports formats: "30min", "1h", "1h30", "2h"
 * 
 * @param duration - Duration string (e.g., "30min", "1h", "1h30")
 * @returns Number of minutes
 * @throws Error if duration format is invalid
 * 
 * @example
 * convertDurationToMinutes('30min'); // 30
 * convertDurationToMinutes('1h');    // 60
 * convertDurationToMinutes('1h30');  // 90
 */
export function convertDurationToMinutes(duration: string): number {
  // Format: "1h30" or "1h" or "30min"
  if (duration.includes('h')) {
    const parts = duration.split('h');
    const hours = parseFloat(parts[0]);
    const minutes = parts[1] ? parseInt(parts[1].replace('min', '')) : 0;
    return hours * 60 + minutes;
  } else if (duration.includes('min')) {
    return parseInt(duration.replace('min', ''));
  } else {
    throw new Error(`Invalid duration format: ${duration}`);
  }
}

/**
 * Calculates end time from start time and duration
 * Returns time in HH:MM format
 * Handles crossing midnight (e.g., 23:30 + 90min = 01:00)
 * 
 * @param startTime - Start time in HH:MM format
 * @param durationMinutes - Duration in minutes
 * @returns End time in HH:MM format
 * 
 * @example
 * calculateEndTime('14:30', 60); // '15:30'
 * calculateEndTime('23:30', 90); // '01:00' (crosses midnight)
 */
export function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
}

/**
 * Calculates total price for an appointment
 * CRITICAL: Prices are ALWAYS calculated server-side, never from AI output
 * 
 * @param baseDuration - Duration string (e.g., "1h")
 * @param selectedExtras - Array of extra names
 * @param priceMappings - Price mappings from buildPriceMappings()
 * @returns Object with basePrice, extrasTotal, and totalPrice
 * @throws Error if duration or any extra is not found in mappings
 * 
 * @example
 * const result = calculateTotalPrice('1h', ['Massage'], mappings);
 * // { basePrice: 150, extrasTotal: 50, totalPrice: 200 }
 */
export function calculateTotalPrice(
  baseDuration: string,
  selectedExtras: string[],
  priceMappings: PriceMappings
): {
  basePrice: number;
  extrasTotal: number;
  totalPrice: number;
} {
  // Get base price from duration
  const basePrice = priceMappings.durationToPriceMap[baseDuration];
  if (basePrice === undefined) {
    throw new Error(`Invalid duration: ${baseDuration}. Not found in price mappings.`);
  }

  // Calculate extras total
  const extrasTotal = selectedExtras.reduce((sum, extraName) => {
    const extraPrice = priceMappings.extraToPriceMap[extraName];
    if (extraPrice === undefined) {
      console.warn(`[pricing] Unknown extra: ${extraName}, skipping`);
      return sum;
    }
    return sum + extraPrice;
  }, 0);

  const totalPrice = basePrice + extrasTotal;

  return {
    basePrice,
    extrasTotal,
    totalPrice
  };
}

/**
 * Builds structured extras array with names and prices
 * Used for storing in the appointments table
 * 
 * @param selectedExtras - Array of extra names
 * @param extraToPriceMap - Extra name → price mapping
 * @returns Array of StructuredExtra objects
 * 
 * @example
 * const structured = buildStructuredExtras(['Massage'], { 'Massage': 50 });
 * // [{ name: 'Massage', price: 50 }]
 */
export function buildStructuredExtras(
  selectedExtras: string[],
  extraToPriceMap: Record<string, number>
): StructuredExtra[] {
  return selectedExtras.map((extraName) => ({
    name: extraName,
    price: extraToPriceMap[extraName] || 0
  }));
}

/**
 * Validates that a duration exists in the user's tarifs
 * 
 * @param duration - Duration string to validate
 * @param validDurations - Array of valid duration strings
 * @returns true if valid, false otherwise
 */
export function isValidDuration(duration: string, validDurations: string[]): boolean {
  return validDurations.includes(duration);
}

/**
 * Validates that all extras exist in the user's extras catalog
 * 
 * @param extras - Array of extra names to validate
 * @param validExtras - Array of valid extra names
 * @returns true if all valid, false if any invalid
 */
export function areValidExtras(extras: string[], validExtras: string[]): boolean {
  return extras.every((extra) => validExtras.includes(extra));
}
