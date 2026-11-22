/**
 * Overture Maps buildings for one neighborhood box, release 2026-11-18.0.
 * The STAC index names the parquet files that touch the box. Only row groups
 * whose bbox statistics overlap the box are read.
 */

import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";
import {
  OVERTURE_RELEASE,
  osmWayId,
  type HeightSource,
  type OvertureFootprint,
} from "./buildingHeight.ts";

export type NeighborhoodBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

const STAC = `https://stac.overturemaps.org/${OVERTURE_RELEASE}/collections.parquet`;

type Row = Record<string, unknown>;

function intersects(
  box: NeighborhoodBox,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number,
): boolean {
  return xmin < box.east && xmax > box.west && ymin < box.north && ymax > box.south;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function httpsHref(assets: unknown): string | null {
  if (!assets || typeof assets !== "object") return null;
  const row = assets as { azure?: { href?: unknown }; aws?: { href?: unknown } };
  const azure = row.azure?.href;
  if (typeof azure === "string" && azure.startsWith("http")) return azure;
  const aws = row.aws?.href;
  if (typeof aws !== "string") return null;
  if (aws.startsWith("http")) return aws;
  const prefix = "s3://overturemaps-us-west-2/";
  if (aws.startsWith(prefix)) {
    return `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/${aws.slice(prefix.length)}`;
  }
  return null;
}

function stat(column: { meta_data?: { path_in_schema?: string[]; statistics?: { min?: unknown; max?: unknown; min_value?: unknown; max_value?: unknown } } } | undefined, which: "min" | "max"): number | null {
  const statistics = column?.meta_data?.statistics;
  if (!statistics) return null;
  const value = which === "min" ? (statistics.min_value ?? statistics.min) : (statistics.max_value ?? statistics.max);
  return typeof value === "number" ? value : null;
}

function groupOverlaps(
  group: { columns: { meta_data?: { path_in_schema?: string[]; statistics?: { min?: unknown; max?: unknown; min_value?: unknown; max_value?: unknown } } }[] },
  box: NeighborhoodBox,
): boolean {
  const column = (path: string) =>
    group.columns.find((item) => item.meta_data?.path_in_schema?.join(".") === path);
  const xmin = stat(column("bbox.xmin"), "min");
  const xmax = stat(column("bbox.xmax"), "max");
  const ymin = stat(column("bbox.ymin"), "min");
  const ymax = stat(column("bbox.ymax"), "max");
  if (xmin == null || xmax == null || ymin == null || ymax == null) return true;
  return intersects(box, xmin, ymin, xmax, ymax);
}

function sourcesOf(value: unknown): HeightSource[] {
  if (!Array.isArray(value)) return [];
  const sources: HeightSource[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { property?: unknown; dataset?: unknown; record_id?: unknown };
    sources.push({
      property: typeof row.property === "string" ? row.property : "",
      dataset: typeof row.dataset === "string" ? row.dataset : null,
      record_id: typeof row.record_id === "string" ? row.record_id : null,
    });
  }
  return sources;
}

/** Outer rings of a WKB/EWKB polygon or multipolygon. */
export function ringsFromWkb(bytes: Uint8Array): [number, number][][] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const readUint32 = (little: boolean) => {
    const value = view.getUint32(offset, little);
    offset += 4;
    return value;
  };

  const readRing = (little: boolean): [number, number][] => {
    const count = readUint32(little);
    const ring: [number, number][] = [];
    for (let i = 0; i < count; i += 1) {
      const x = view.getFloat64(offset, little);
      const y = view.getFloat64(offset + 8, little);
      offset += 16;
      ring.push([x, y]);
    }
    return ring;
  };

  const readPolygon = (little: boolean): [number, number][][] => {
    const rings = readUint32(little);
    const out: [number, number][][] = [];
    for (let i = 0; i < rings; i += 1) {
      const ring = readRing(little);
      if (i === 0 && ring.length >= 4) out.push(ring);
    }
    return out;
  };

  const readGeometry = (): [number, number][][] => {
    if (offset >= view.byteLength) return [];
    const little = view.getUint8(offset) === 1;
    offset += 1;
    const type = readUint32(little);
    if (type & 0x20000000) offset += 4;
    const base = type & 0xff;
    if (base === 3) return readPolygon(little);
    if (base === 6) {
      const polygons = readUint32(little);
      const out: [number, number][][] = [];
      for (let i = 0; i < polygons; i += 1) out.push(...readGeometry());
      return out;
    }
    return [];
  };

  try {
    return readGeometry();
  } catch {
    return [];
  }
}

function geometryBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) return Uint8Array.from(value);
  return null;
}

function ringFromGeometry(value: unknown): [number, number][] | null {
  if (value && typeof value === "object" && "type" in value) {
    const geometry = value as { type?: unknown; coordinates?: unknown };
    const polygon =
      geometry.type === "Polygon"
        ? geometry.coordinates
        : geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)
          ? geometry.coordinates[0]
          : null;
    const outer = Array.isArray(polygon) ? polygon[0] : null;
    if (!Array.isArray(outer)) return null;
    const ring: [number, number][] = [];
    for (const point of outer) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const lon = asNumber(point[0]);
      const lat = asNumber(point[1]);
      if (lon == null || lat == null) continue;
      ring.push([lon, lat]);
    }
    return ring.length >= 4 ? ring : null;
  }
  const bytes = geometryBytes(value);
  const ring = bytes ? ringsFromWkb(bytes)[0] : undefined;
  return ring && ring.length >= 4 ? ring : null;
}

function footprintFromRow(row: Row, box: NeighborhoodBox): OvertureFootprint | null {
  const bbox = row.bbox;
  if (bbox && typeof bbox === "object") {
    const limits = bbox as { xmin?: unknown; ymin?: unknown; xmax?: unknown; ymax?: unknown };
    const xmin = asNumber(limits.xmin);
    const ymin = asNumber(limits.ymin);
    const xmax = asNumber(limits.xmax);
    const ymax = asNumber(limits.ymax);
    if (xmin != null && ymin != null && xmax != null && ymax != null && !intersects(box, xmin, ymin, xmax, ymax)) {
      return null;
    }
  }
  const ring = ringFromGeometry(row.geometry);
  if (!ring) return null;
  const id = typeof row.id === "string" ? row.id : String(row.id ?? "");
  if (!id) return null;
  const sources = sourcesOf(row.sources);
  return {
    id,
    ring,
    height: asNumber(row.height),
    numFloors: asNumber(row.num_floors),
    roofShape: typeof row.roof_shape === "string" ? row.roof_shape : null,
    roofHeight: asNumber(row.roof_height),
    minHeight: asNumber(row.min_height),
    sources,
    osmId: osmWayId(sources),
  };
}

const COLUMNS = [
  "id",
  "height",
  "num_floors",
  "roof_shape",
  "roof_height",
  "min_height",
  "sources",
  "geometry",
  "bbox",
];

type ParquetFile = Awaited<ReturnType<typeof asyncBufferFromUrl>>;
type ParquetMeta = Awaited<ReturnType<typeof parquetMetadataAsync>>;

/**
 * Each parquet file's footer, read once per session. A city that grows
 * tile by tile asks the same few files again and again.
 */
const opened = new Map<string, Promise<{ file: ParquetFile; metadata: ParquetMeta }>>();

function openParquet(url: string) {
  let entry = opened.get(url);
  if (!entry) {
    entry = (async () => {
      const file = await asyncBufferFromUrl({ url });
      return { file, metadata: await parquetMetadataAsync(file) };
    })();
    // A failed read is not kept, so a later call can try again.
    entry.catch(() => opened.delete(url));
    opened.set(url, entry);
  }
  return entry;
}

/** The release's file index, read once per session. */
let stacIndex: Promise<Row[]> | null = null;

function readIndex(): Promise<Row[]> {
  if (!stacIndex) {
    const index = (async () => {
      const file = await asyncBufferFromUrl({ url: STAC });
      return (await parquetReadObjects({
        file,
        columns: ["collection", "bbox", "assets"],
        compressors,
      })) as Row[];
    })();
    index.catch(() => {
      if (stacIndex === index) stacIndex = null;
    });
    stacIndex = index;
  }
  return stacIndex;
}

/**
 * The parts of `box` not inside any of `covered`, as boxes. Parts thinner
 * than `minSize` degrees are dropped: footprints that cross a covered
 * edge were already read with it.
 */
export function uncoveredParts(
  box: NeighborhoodBox,
  covered: readonly NeighborhoodBox[],
  minSize = 0,
): NeighborhoodBox[] {
  let parts: NeighborhoodBox[] = [box];
  for (const cover of covered) {
    const next: NeighborhoodBox[] = [];
    for (const part of parts) {
      if (!intersects(cover, part.west, part.south, part.east, part.north)) {
        next.push(part);
        continue;
      }
      const west = Math.max(part.west, cover.west);
      const east = Math.min(part.east, cover.east);
      if (part.west < cover.west) next.push({ ...part, east: cover.west });
      if (part.east > cover.east) next.push({ ...part, west: cover.east });
      if (part.south < cover.south) next.push({ west, east, south: part.south, north: cover.south });
      if (part.north > cover.north) next.push({ west, east, south: cover.north, north: part.north });
    }
    parts = next;
  }
  return parts.filter((part) => part.east - part.west >= minSize && part.north - part.south >= minSize);
}

async function rowsInBox(url: string, box: NeighborhoodBox): Promise<OvertureFootprint[]> {
  const { file, metadata } = await openParquet(url);
  const footprints: OvertureFootprint[] = [];
  let start = 0;
  for (const group of metadata.row_groups) {
    const count = Number(group.num_rows);
    const end = start + count;
    if (groupOverlaps(group, box)) {
      const rows = await parquetReadObjects({
        file,
        metadata,
        rowStart: start,
        rowEnd: end,
        columns: COLUMNS,
        compressors,
      });
      for (const row of rows) {
        const footprint = footprintFromRow(row as Row, box);
        if (footprint) footprints.push(footprint);
      }
    }
    start = end;
  }
  return footprints;
}

/**
 * Buildings from Overture release 2026-11-18.0 whose bbox meets the neighborhood.
 * An empty list means the extract could not be read; callers keep OSM heights.
 */
export async function fetchOvertureBuildings(box: NeighborhoodBox): Promise<OvertureFootprint[]> {
  const files = await readIndex();
  const urls: string[] = [];
  for (const file of files) {
    const row = file as Row;
    if (row.collection !== "building") continue;
    const limits = row.bbox as { xmin?: unknown; ymin?: unknown; xmax?: unknown; ymax?: unknown } | undefined;
    const xmin = asNumber(limits?.xmin);
    const ymin = asNumber(limits?.ymin);
    const xmax = asNumber(limits?.xmax);
    const ymax = asNumber(limits?.ymax);
    if (xmin == null || ymin == null || xmax == null || ymax == null) continue;
    if (!intersects(box, xmin, ymin, xmax, ymax)) continue;
    const url = httpsHref(row.assets);
    if (url) urls.push(url);
  }
  const batches = await Promise.all(urls.map((url) => rowsInBox(url, box).catch(() => [] as OvertureFootprint[])));
  return batches.flat();
}
