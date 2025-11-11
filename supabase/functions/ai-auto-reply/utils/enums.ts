/**
 * Dynamic enum builders
 * Builds enums from user catalog for strict OpenAI function calling
 */

import type { UserInformation, DynamicEnums } from '../types.ts';

/**
 * Builds dynamic enums from user catalog
 * 
 * These enums are used in OpenAI function calling schema to prevent hallucinations.
 * The AI can ONLY use values from these enums, ensuring zero invalid data.
 * 
 * @param userInfo - User information with prestations, extras, tarifs
 * @returns Object with prestationEnum, extraEnum, durationEnum
 * 
 * @example
 * const enums = buildDynamicEnums(userInfo);
 * // {
 * //   prestationEnum: ['GFE', 'PSE', 'Massage'],
 * //   extraEnum: ['Anal', 'Duo'],
 * //   durationEnum: ['30min', '1h', '2h']
 * // }
 */
export function buildDynamicEnums(userInfo: UserInformation): DynamicEnums {
  // Extract prestation names
  const prestationEnum = Array.isArray(userInfo.prestations)
    ? userInfo.prestations
        .map((p) => (p && typeof p === 'object' ? p.name : p))
        .filter((name): name is string => typeof name === 'string' && name.length > 0)
    : [];

  // Extract extra names
  const extraEnum = Array.isArray(userInfo.extras)
    ? userInfo.extras
        .map((e) => (e && typeof e === 'object' ? e.name : e))
        .filter((name): name is string => typeof name === 'string' && name.length > 0)
    : [];

  // Extract duration values from tarifs
  const durationEnum = Array.isArray(userInfo.tarifs)
    ? userInfo.tarifs
        .map((t) => t?.duration)
        .filter((duration): duration is string => typeof duration === 'string' && duration.length > 0)
    : [];

  return {
    prestationEnum,
    extraEnum,
    durationEnum
  };
}

/**
 * Validates that a value exists in an enum
 * 
 * @param value - Value to check
 * @param enumArray - Enum array to check against
 * @returns true if value is in enum, false otherwise
 * 
 * @example
 * isValidEnumValue('1h', ['30min', '1h', '2h']); // true
 * isValidEnumValue('3h', ['30min', '1h', '2h']); // false
 */
export function isValidEnumValue(value: string, enumArray: string[]): boolean {
  return enumArray.includes(value);
}

/**
 * Gets all invalid values from a list that are not in enum
 * 
 * @param values - Values to check
 * @param enumArray - Enum array to check against
 * @returns Array of invalid values
 * 
 * @example
 * getInvalidEnumValues(['1h', '3h'], ['30min', '1h', '2h']); // ['3h']
 */
export function getInvalidEnumValues(values: string[], enumArray: string[]): string[] {
  return values.filter(value => !enumArray.includes(value));
}
