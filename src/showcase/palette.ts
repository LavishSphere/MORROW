/**
 * Logo blue sampled from the MORROW mark. Every opaque pixel in the PNG
 * is rgb(20, 136, 255). Space, selection, and route light use this blue
 * with pure black. Building and landscape colors are scene materials.
 */
export const LOGO_BLUE = "#1488FF";
export const BLACK = "#000000";

export const scene = {
  grass: "#7EBF45",
  stone: "#9A9386",
  stoneDark: "#635E54",
  underside: "#3A342E",
  asphalt: "#3E434C",
  sidewalk: "#D9D3C6",
  curb: "#F2EDE4",
  crosswalk: "#F7F4EE",
  wallCream: "#F6F1E7",
  wallSand: "#E7D5BE",
  wallWhite: "#FBF8F3",
  roofRed: "#C44B3C",
  roofSlate: "#5C6B78",
  roofBrown: "#8D5A3C",
  trunk: "#6A4630",
  leaf: "#3F8E34",
  leafLight: "#6BB84A",
  door: "#3B2C26",
} as const;
