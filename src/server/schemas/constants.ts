export const TIME_OF_DAY_REGEX = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

// Avoid \d so JSON-schema->GBNF doesn't emit unsupported escapes.
export const DATE_REGEX = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/

export const DEFAULT_RECENT_EVENTS_SUMMARY = "Nothing significant has happened yet. The situation remains stable."

export const DEFAULT_MEMORY = DEFAULT_RECENT_EVENTS_SUMMARY
