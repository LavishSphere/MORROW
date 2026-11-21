/**
 * Brand colors sampled from the logo files.
 * Opaque pixels in morrow-logo-blue.png are #1488FF.
 * Opaque pixels in morrow-logo-white.png are #FFFFFF.
 * Neither file contains any other color.
 */
export const BRAND_BLACK = "#000000";
export const LOGO_BLUE = "#1488FF";
export const TEXT_WHITE = "#FFFFFF";

export const brandPalette = {
  black: BRAND_BLACK,
  blue: LOGO_BLUE,
  white: TEXT_WHITE,
} as const;

export const WORDMARK = "MORROW";
export const TAGLINE = "Make tomorrow possible";
