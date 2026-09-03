import type {
  MenuSimpleMarkerStyle,
  MenuSimpleOption,
} from "./flow-schema";

// Emoji digits 1..10. Indices beyond this fall back to plain numbering.
const EMOJI_DIGITS = [
  "1️⃣",
  "2️⃣",
  "3️⃣",
  "4️⃣",
  "5️⃣",
  "6️⃣",
  "7️⃣",
  "8️⃣",
  "9️⃣",
  "🔟", // 🔟
] as const;

const LOWER_LETTERS = "abcdefghijklmnopqrstuvwxyz";

function letterForIndex(index: number, uppercase: boolean): string {
  // Excel-style overflow (a..z, aa, ab, ...) so we never run out of markers.
  let n = index;
  let result = "";
  do {
    result = LOWER_LETTERS[n % 26] + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return uppercase ? result.toUpperCase() : result;
}

// The "core" marker token (without separator) used for matching the user reply.
function markerCore(style: MenuSimpleMarkerStyle, index: number): string {
  switch (style) {
    case "emoji_number":
      return EMOJI_DIGITS[index] ?? String(index + 1);
    case "letter_lower_paren":
      return letterForIndex(index, false);
    case "letter_upper_dash":
      return letterForIndex(index, true);
    case "number_dot":
    case "number_dash":
    case "number_paren":
    default:
      return String(index + 1);
  }
}

// Full marker including the separator, used when rendering the message.
export function getMenuMarker(style: MenuSimpleMarkerStyle, index: number): string {
  const core = markerCore(style, index);
  switch (style) {
    case "number_dot":
      return `${core}.`;
    case "number_dash":
    case "letter_upper_dash":
      return `${core} -`;
    case "number_paren":
    case "letter_lower_paren":
      return `${core})`;
    case "emoji_number":
    default:
      return core;
  }
}

// All reply forms that should select option `index`, regardless of the display
// style: plain number, lower/upper letter and emoji digit.
export function getMenuMarkerForms(index: number): string[] {
  const forms = new Set<string>();
  forms.add(String(index + 1));
  forms.add(letterForIndex(index, false));
  forms.add(letterForIndex(index, true));
  const emoji = EMOJI_DIGITS[index];
  if (emoji) forms.add(emoji);
  return Array.from(forms);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// Picks an option index by matching the reply against markers (number/letter/
// emoji) or the option's own text. Returns -1 when nothing matches. Does NOT
// evaluate advanced conditions (the engine does that with evaluateCondition).
export function matchMenuSimpleReplyByMarker(
  options: MenuSimpleOption[],
  reply: string,
): number {
  const normalizedReply = normalize(reply);
  if (!normalizedReply) return -1;

  for (let index = 0; index < options.length; index += 1) {
    const markerForms = getMenuMarkerForms(index).map(normalize);
    if (markerForms.includes(normalizedReply)) {
      return index;
    }
    const optionText = normalize(options[index]?.text ?? "");
    if (optionText && optionText === normalizedReply) {
      return index;
    }
  }

  return -1;
}

// Builds the full text message: [label] + blank line + one line per option.
export function buildMenuSimpleMessage(data: {
  label?: string;
  markerStyle?: MenuSimpleMarkerStyle;
  menuOptions?: MenuSimpleOption[];
}): string {
  const label = (data.label ?? "").trim();
  const style = data.markerStyle ?? "emoji_number";
  const options = data.menuOptions ?? [];

  const lines = options.map(
    (option, index) => `${getMenuMarker(style, index)} ${option.text}`.trimEnd(),
  );

  if (lines.length === 0) {
    return label;
  }

  return label ? `${label}\n\n${lines.join("\n")}` : lines.join("\n");
}
