export const TIME_OF_DAY_REGEX = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
export const ONE_TO_FIVE_WORDS_REGEX = /^[^\n ]+( [^\n ]+){0,4}$/
export const TWO_TO_THREE_SENTENCES_REGEX = /^([^.!?\n]*[.!?][ ]*){2,3}$/
export const ONE_OR_TWO_PARAGRAPHS_REGEX = /^[^\n]+(\n\n[^\n]+){0,1}$/
export const THREE_TO_TWELVE_WORDS_REGEX = /^([^\n ]+[ ]+){2,11}[^\n ]+$/

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const

export const DEFAULT_RECENT_EVENTS_SUMMARY = "Nothing significant has happened yet. The situation remains stable."
