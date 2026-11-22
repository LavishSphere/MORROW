/**
 * Live rail vehicle feeds beyond the MBTA, shared by the web app (which
 * polls them) and the API (which fetches, decodes and caches them).
 *
 * Every feed goes through `GET /api/transit/vehicles?feed=<id>` because the
 * upstreams are GTFS-realtime protobuf, send no CORS headers, or need a key.
 * Keys live only in server env vars named here; values are never committed
 * or shipped to the browser. A keyed feed whose env var is unset answers 501
 * and the web app stops polling it.
 *
 * Route colours come from each agency's static GTFS routes.txt.
 */

export type TransitBbox = { west: number; south: number; east: number; north: number };

export type TransitSourceFormat = "gtfs-rt" | "cta-train-tracker";

export type TransitFeedDef = {
  id: string;
  label: string;
  bbox: TransitBbox;
  /** Browser poll interval. Never below 15 s. */
  pollMs: number;
  /** Server cache per feed. Defaults to 10 s. */
  cacheMs?: number;
  /** Upstream documents merged into one vehicle list. */
  sources: Array<{ url: string; format: TransitSourceFormat }>;
  /** Server env var holding the key, and where the upstream expects it. */
  key?: { env: string; query?: string; header?: string };
  /** routeId → `#rrggbb`. Matched case-insensitively. */
  routes: Record<string, string>;
  /** Mixed bus + rail feeds: keep only vehicles on a route listed above. */
  railOnly: boolean;
};

export const TRANSIT_FEEDS: TransitFeedDef[] = [
  {
    id: "mta-lirr",
    label: "Long Island Rail Road",
    bbox: { west: -74.1, south: 40.55, east: -71.85, north: 41.05 },
    pollMs: 20_000,
    sources: [
      {
        url: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr",
        format: "gtfs-rt",
      },
    ],
    routes: {
      "1": "#00985F",
      "2": "#CE8E00",
      "3": "#00AF3F",
      "4": "#A626AA",
      "5": "#00B2A9",
      "6": "#FF6319",
      "7": "#6E3219",
      "8": "#00A1DE",
      "9": "#C60C30",
      "10": "#006EC7",
      "11": "#60269E",
      "12": "#4D5357",
      "13": "#A626AA",
    },
    railOnly: false,
  },
  {
    id: "mta-mnr",
    label: "Metro-North Railroad",
    bbox: { west: -74.1, south: 40.7, east: -72.85, north: 41.9 },
    pollMs: 20_000,
    sources: [
      {
        url: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr",
        format: "gtfs-rt",
      },
    ],
    routes: {
      "1": "#009B3A",
      "2": "#0039A6",
      "3": "#EE0034",
      "4": "#EE0034",
      "5": "#EE0034",
      "6": "#EE0034",
    },
    railOnly: false,
  },
  {
    id: "septa",
    label: "SEPTA Regional Rail and trolleys",
    bbox: { west: -75.95, south: 39.6, east: -74.7, north: 40.45 },
    pollMs: 20_000,
    sources: [
      {
        url: "https://www3.septa.org/gtfsrt/septarail-pa-us/Vehicle/rtVehiclePosition.pb",
        format: "gtfs-rt",
      },
      {
        url: "https://www3.septa.org/gtfsrt/septa-pa-us/Vehicle/rtVehiclePosition.pb",
        format: "gtfs-rt",
      },
    ],
    routes: {
      AIR: "#4F758B",
      CHE: "#4F758B",
      CHW: "#4F758B",
      CYN: "#4F758B",
      FOX: "#4F758B",
      LAN: "#4F758B",
      MED: "#4F758B",
      NOR: "#4F758B",
      PAO: "#4F758B",
      TRE: "#4F758B",
      WAR: "#4F758B",
      WIL: "#4F758B",
      WTR: "#4F758B",
      T1: "#5A960A",
      T2: "#5A960A",
      T3: "#5A960A",
      T4: "#5A960A",
      T5: "#5A960A",
      G1: "#FFD700",
      D1: "#DC2E6B",
      D2: "#DC2E6B",
      M1: "#5F249F",
    },
    railOnly: true,
  },
  {
    id: "metro-transit",
    label: "Metro Transit light rail",
    bbox: { west: -93.5, south: 44.75, east: -92.95, north: 45.1 },
    pollMs: 20_000,
    sources: [
      { url: "https://svc.metrotransit.org/mtgtfs/vehiclepositions.pb", format: "gtfs-rt" },
    ],
    routes: { "901": "#00539F", "902": "#008144" },
    railOnly: true,
  },
  {
    id: "rtd",
    label: "RTD Denver rail",
    bbox: { west: -105.3, south: 39.5, east: -104.6, north: 40.05 },
    pollMs: 20_000,
    sources: [
      {
        url: "https://www.rtd-denver.com/files/gtfs-rt/VehiclePosition.pb",
        format: "gtfs-rt",
      },
    ],
    routes: {
      "101C": "#F79239",
      "101D": "#008348",
      "101E": "#552683",
      "101T": "#B71318",
      "103W": "#009DAA",
      "107R": "#C4D600",
      "113B": "#4E9D2D",
      "113G": "#F6B221",
      "117N": "#9F26B5",
      A: "#57C1E9",
    },
    railOnly: true,
  },
  {
    id: "wmata",
    label: "WMATA Metrorail",
    bbox: { west: -77.55, south: 38.75, east: -76.8, north: 39.15 },
    pollMs: 20_000,
    sources: [
      { url: "https://api.wmata.com/gtfs/rail-gtfsrt-vehiclepositions.pb", format: "gtfs-rt" },
    ],
    key: { env: "WMATA_API_KEY", header: "api_key" },
    routes: {
      RED: "#BF0D3E",
      BLUE: "#009CDE",
      ORANGE: "#ED8B00",
      SILVER: "#919D9D",
      GREEN: "#00B140",
      YELLOW: "#FFD100",
    },
    railOnly: false,
  },
  {
    id: "cta",
    label: "CTA 'L'",
    bbox: { west: -87.95, south: 41.7, east: -87.55, north: 42.08 },
    pollMs: 20_000,
    sources: [
      {
        url: "https://lapi.transitchicago.com/api/1.0/ttpositions.aspx?rt=red,blue,brn,g,org,p,pink,y&outputType=JSON",
        format: "cta-train-tracker",
      },
    ],
    key: { env: "CTA_TRAIN_TRACKER_KEY", query: "key" },
    routes: {
      Red: "#C60C30",
      Blue: "#00A1DE",
      Brn: "#62361B",
      G: "#009B3A",
      Org: "#F9461C",
      P: "#522398",
      Pink: "#E27EA6",
      Y: "#F9E300",
    },
    railOnly: false,
  },
  {
    id: "metra",
    label: "Metra",
    bbox: { west: -88.6, south: 41.3, east: -87.5, north: 42.6 },
    pollMs: 30_000,
    sources: [
      { url: "https://gtfspublic.metrarr.com/gtfs/public/positions", format: "gtfs-rt" },
    ],
    key: { env: "METRA_API_TOKEN", query: "api_token" },
    routes: {
      BNSF: "#29C233",
      HC: "#550E0C",
      "MD-N": "#CC5500",
      "MD-W": "#F1AD0E",
      ME: "#EB5C00",
      NCS: "#9785BC",
      RI: "#E02400",
      SWS: "#0042A8",
      "UP-N": "#008000",
      "UP-NW": "#FFE600",
      "UP-W": "#FE8D81",
    },
    railOnly: false,
  },
  {
    id: "trimet",
    label: "TriMet MAX and WES",
    bbox: { west: -123.1, south: 45.25, east: -122.4, north: 45.65 },
    pollMs: 20_000,
    sources: [
      { url: "https://developer.trimet.org/ws/V1/VehiclePositions", format: "gtfs-rt" },
    ],
    key: { env: "TRIMET_APP_ID", query: "appID" },
    routes: {
      "90": "#C41F3E",
      "100": "#1359AE",
      "190": "#FFC52F",
      "193": "#72A130",
      "194": "#D91965",
      "195": "#4650BE",
      "200": "#008342",
      "203": "#6E6E6E",
      "290": "#D05F27",
    },
    railOnly: true,
  },
  {
    id: "muni",
    label: "Muni Metro, streetcars and cable cars",
    bbox: { west: -122.53, south: 37.7, east: -122.35, north: 37.82 },
    // 511.org allows 60 requests an hour per key by default.
    pollMs: 60_000,
    cacheMs: 60_000,
    sources: [
      { url: "https://api.511.org/Transit/VehiclePositions?agency=SF", format: "gtfs-rt" },
    ],
    key: { env: "SF511_API_KEY", query: "api_key" },
    routes: {
      F: "#B49A36",
      J: "#A96614",
      K: "#437C93",
      L: "#942D83",
      M: "#008547",
      N: "#005B95",
      T: "#BF2B45",
      PH: "#B49A36",
      PM: "#B49A36",
      CA: "#B49A36",
    },
    railOnly: true,
  },
];

export function findTransitFeed(id: string): TransitFeedDef | undefined {
  return TRANSIT_FEEDS.find((feed) => feed.id === id);
}

export function bboxesOverlap(a: TransitBbox, b: TransitBbox): boolean {
  return a.west <= b.east && b.west <= a.east && a.south <= b.north && b.south <= a.north;
}

/** Colour for a route, or null when the route is not listed. */
export function routeColor(feed: TransitFeedDef, routeId: string): string | null {
  const direct = feed.routes[routeId];
  if (direct) return direct;
  const lower = routeId.toLowerCase();
  for (const [id, color] of Object.entries(feed.routes)) {
    if (id.toLowerCase() === lower) return color;
  }
  return null;
}
