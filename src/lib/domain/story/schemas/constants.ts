import { getServerDefaults } from "@/utils/text/strings"

export const TIME_OF_DAY_REGEX = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

// Avoid \\d so JSON-schema->GBNF doesn't emit unsupported escapes.
export const DATE_REGEX = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/

export function getDefaultRecentEventsSummary(): string {
  return getServerDefaults().recentEventsSummary
}

export function getDefaultMemory(): string {
  return getDefaultRecentEventsSummary()
}
