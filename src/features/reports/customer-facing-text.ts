export type CustomerFacingTextCleanupMode = "deterministic";

export type CustomerFacingTextCleanupOptions = {
  mode?: CustomerFacingTextCleanupMode;
};

const HIGH_CONFIDENCE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bdoesnt\b/gi, "doesn't"],
  [/\bdont\b/gi, "don't"],
  [/\bcant\b/gi, "can't"],
  [/\bwont\b/gi, "won't"],
  [/\bisnt\b/gi, "isn't"],
  [/\barent\b/gi, "aren't"],
  [/\bwasnt\b/gi, "wasn't"],
  [/\bwerent\b/gi, "weren't"],
  [/\bhasnt\b/gi, "hasn't"],
  [/\bhavent\b/gi, "haven't"],
  [/\bcouldnt\b/gi, "couldn't"],
  [/\bshouldnt\b/gi, "shouldn't"],
  [/\bwouldnt\b/gi, "wouldn't"],
  [/\bseems\b/gi, "seams"],
  [/\bshoring\b/gi, "showing"],
  [/\bmove\s+in\b/gi, "move-in"],
];

const MEASUREMENT_OR_IDENTIFIER_PATTERN =
  /\b(?:vin|serial|s\/n|id|part(?:\s*(?:no|number|#))?|model|odometer|mileage|miles|km|psi|kpa|bar|volts?|amps?|ohms?|°[cf]|degrees?|inches|inch|in|ft|feet|mm|cm|m|lbs?|kg|gallons?|liters?|litres?|rpm|mph|km\/h|torque|nm|ft-lb)\b|\d/iu;
const VIN_LIKE_PATTERN = /\b[A-HJ-NPR-Z0-9]{11,17}\b/u;

function normalizeWhitespaceAndQuotes(value: string) {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])(?=\S)/g, "$1 ")
    .trim();
}

function capitalizeSentences(value: string) {
  return value.replace(/(^|[.!?]\s+)([a-z])/g, (_match, prefix: string, char: string) => `${prefix}${char.toUpperCase()}`);
}

function ensureTerminalPunctuation(value: string) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function shouldUseOriginal(value: string) {
  return (
    !value.trim() ||
    MEASUREMENT_OR_IDENTIFIER_PATTERN.test(value) ||
    VIN_LIKE_PATTERN.test(value) ||
    /^https?:\/\//i.test(value) ||
    /\.[a-z0-9]{2,5}$/i.test(value)
  );
}

export function cleanCustomerFacingText(
  text: string | null | undefined,
  options: CustomerFacingTextCleanupOptions = {},
): string {
  void options;
  if (typeof text !== "string") return "";
  const original = text.trim();
  if (shouldUseOriginal(original)) return original;

  let cleaned = normalizeWhitespaceAndQuotes(original);
  for (const [pattern, replacement] of HIGH_CONFIDENCE_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  cleaned = capitalizeSentences(cleaned);
  cleaned = ensureTerminalPunctuation(cleaned);

  return cleaned;
}
