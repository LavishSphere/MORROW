/**
 * Moving traffic and walking people, as plain data. Lanes are built once per
 * map from the road and footpath centerlines; agents slide along them with a
 * segment cursor, so a step is a few additions and no allocation.
 *
 * Scene frame: x is east, z is south. Right of travel along (dx, dz) is
 * (-dz, dx), so cars keep to the right side of a two-way street.
 */

export type Pt = readonly [number, number];

/** The parts of a parsed way that traffic reads. */
export type TrafficWay = {
  layer: string;
  points: readonly Pt[];
  /** Scene units. Half the carriageway width. */
  halfWidth: number;
  highway: string | null;
  /** 1 follows the drawn direction, -1 runs against it, 0 is two-way. */
  oneway?: 1 | -1 | 0;
  /** Indoor, covered, or below ground. Nobody is drawn moving here. */
  indoor?: boolean;
};

export type Lane = {
  kind: "car" | "walk";
  xs: Float64Array;
  zs: Float64Array;
  /** Distance along the lane at each point. */
  cum: Float64Array;
  length: number;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** Scene units per second. */
  speed: number;
  /** Snapped centerline endpoint keys. A lane continues into lanes that start where it ends. */
  start: string;
  end: string;
  /** Lanes a car may turn into at the end of this one. */
  next: number[];
  /** The same street in the other direction, or -1. */
  reverse: number;
};

export type TrafficLanes = { cars: Lane[]; walks: Lane[] };

export type Agent = {
  lane: number;
  seg: number;
  /** Distance along the lane. */
  s: number;
  /** Walkers turn around; cars always move forward. */
  dir: 1 | -1;
  speed: number;
  /** Sideways shift from the lane line, in scene units (walkers). */
  side: number;
  x: number;
  z: number;
  /** Rotation about +y that points local +x along the direction of motion. */
  yaw: number;
  /** Walk-cycle phase in radians. */
  phase: number;
};

/** Half the width of the instanced car body. */
export const CAR_HALF_WIDTH = 0.17;
/** Smallest gap between two cars spawned on the same lane. */
export const CAR_GAP = 1.2;
/** Endpoints closer than this are the same intersection. */
const SNAP = 0.01;
/** Highway classes that get no moving cars: driveways, parking aisles, dirt tracks. */
const NO_CARS = new Set(["service", "track", "pedestrian", "footway", "path", "steps", "corridor", "cycleway", "bridleway"]);
/** Footpaths nobody walks on in the scene: drive aisles and indoor corridors. */
const NO_WALKERS = new Set(["service", "corridor"]);

/**
 * Car speed by road class, in scene units per second. Roughly the real speed
 * times 0.14 scene units per meter, slowed a little so motion reads clearly.
 */
export function carSpeed(highway: string | null): number {
  const base = (highway ?? "").replace(/_link$/, "");
  const link = (highway ?? "").endsWith("_link");
  let speed = 1.6;
  if (base === "motorway" || base === "trunk" || base === "primary") speed = 2.8;
  else if (base === "secondary" || base === "tertiary") speed = 2.2;
  return link ? Math.min(speed, 2.2) : speed;
}

/** OSM oneway, with roundabouts one-way in the drawn direction. */
export function onewayOf(tags: Record<string, unknown> | null | undefined): 1 | -1 | 0 {
  const value = String(tags?.oneway ?? "").trim().toLowerCase();
  if (value === "-1" || value === "reverse") return -1;
  if (value === "yes" || value === "true" || value === "1") return 1;
  if (value === "no") return 0;
  return tags?.junction === "roundabout" ? 1 : 0;
}

/**
 * Indoor corridors, covered passages, tunnels, and anything on another level
 * or below ground. The OSM layer tag travels as "layer:osm", because "layer"
 * names the basemap layer.
 */
export function isIndoor(tags: Record<string, unknown> | null | undefined): boolean {
  if (!tags) return false;
  const text = (key: string) => (typeof tags[key] === "string" ? (tags[key] as string).trim() : null);
  if (text("highway") === "corridor") return true;
  const indoor = text("indoor");
  if (indoor && indoor !== "no") return true;
  const tunnel = text("tunnel");
  if (tunnel && tunnel !== "no") return true;
  if (text("covered") === "yes") return true;
  const layer = Number.parseFloat(text("layer:osm") ?? "");
  if (Number.isFinite(layer) && layer < 0) return true;
  const level = text("level");
  if (level !== null && level !== "" && level !== "0") return true;
  return false;
}

/** Sideways distance from the centerline to the middle of a car lane. */
export function carLaneOffset(way: Pick<TrafficWay, "halfWidth" | "oneway">): number {
  return way.oneway ? 0 : way.halfWidth * 0.5;
}

/**
 * Building footprints on a coarse grid, built once, so "is this spot inside
 * a building" checks a handful of rings instead of all of them.
 */
export class FootprintGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly rings: readonly (readonly Pt[])[];
  private readonly cell: number;

  constructor(rings: readonly (readonly Pt[])[], cell = 4) {
    this.rings = rings;
    this.cell = cell;
    rings.forEach((ring, index) => {
      if (ring.length < 3) return;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const [x, z] of ring) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      for (let cx = Math.floor(minX / cell); cx <= Math.floor(maxX / cell); cx += 1) {
        for (let cz = Math.floor(minZ / cell); cz <= Math.floor(maxZ / cell); cz += 1) {
          const key = this.key(cx, cz);
          const list = this.cells.get(key);
          if (list) list.push(index);
          else this.cells.set(key, [index]);
        }
      }
    });
  }

  private key(cx: number, cz: number) {
    return cx * 1_000_003 + cz;
  }

  inside(x: number, z: number): boolean {
    const list = this.cells.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (!list) return false;
    for (const index of list) {
      const ring = this.rings[index]!;
      let hit = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const [xi, zi] = ring[i]!;
        const [xj, zj] = ring[j]!;
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
      }
      if (hit) return true;
    }
    return false;
  }
}

function snapKey(p: Pt) {
  return `${Math.round(p[0] / SNAP)},${Math.round(p[1] / SNAP)}`;
}

/** The polyline shifted `d` to the right of travel, mitred at the bends. */
export function offsetRight(points: readonly Pt[], d: number): Pt[] {
  if (d === 0) return points.map((p) => [p[0], p[1]] as const);
  const normals: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const dx = points[i + 1]![0] - points[i]![0];
    const dz = points[i + 1]![1] - points[i]![1];
    const len = Math.hypot(dx, dz) || 1;
    normals.push([-dz / len, dx / len]);
  }
  return points.map((p, i) => {
    const before = normals[i - 1] ?? normals[i]!;
    const after = normals[i] ?? normals[i - 1]!;
    let mx = before[0] + after[0];
    let mz = before[1] + after[1];
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) {
      mx = after[0];
      mz = after[1];
    } else {
      mx /= ml;
      mz /= ml;
    }
    const scale = d / Math.max(0.4, mx * after[0] + mz * after[1]);
    return [p[0] + mx * scale, p[1] + mz * scale] as const;
  });
}

function makeLane(kind: Lane["kind"], points: readonly Pt[], speed: number, start: string, end: string): Lane | null {
  const xs: number[] = [];
  const zs: number[] = [];
  for (const [x, z] of points) {
    const n = xs.length;
    if (n > 0 && Math.hypot(x - xs[n - 1]!, z - zs[n - 1]!) < 1e-4) continue;
    xs.push(x);
    zs.push(z);
  }
  if (xs.length < 2) return null;
  const cum = new Float64Array(xs.length);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < xs.length; i += 1) {
    if (i > 0) cum[i] = cum[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, zs[i]! - zs[i - 1]!);
    minX = Math.min(minX, xs[i]!);
    maxX = Math.max(maxX, xs[i]!);
    minZ = Math.min(minZ, zs[i]!);
    maxZ = Math.max(maxZ, zs[i]!);
  }
  const length = cum[cum.length - 1]!;
  if (length < 0.05) return null;
  return {
    kind,
    xs: Float64Array.from(xs),
    zs: Float64Array.from(zs),
    cum,
    length,
    minX,
    minZ,
    maxX,
    maxZ,
    speed,
    start,
    end,
    next: [],
    reverse: -1,
  };
}

/**
 * Split a footpath where it passes through a building and keep only the
 * outdoor pieces. Points are sampled about every 0.25 units.
 */
function outdoorRuns(points: readonly Pt[], grid: FootprintGrid): Pt[][] {
  const runs: Pt[][] = [];
  let run: Pt[] = [];
  const visit = (p: Pt) => {
    if (grid.inside(p[0], p[1])) {
      if (run.length > 1) runs.push(run);
      run = [];
    } else {
      run.push(p);
    }
  };
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[i + 1]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25));
    for (let k = 0; k < steps; k += 1) visit([ax + ((bx - ax) * k) / steps, az + ((bz - az) * k) / steps]);
  }
  visit(points[points.length - 1]!);
  if (run.length > 1) runs.push(run);
  return runs;
}

function drivable(way: TrafficWay) {
  return way.points.length >= 2 && !way.indoor && way.layer === "road" && !NO_CARS.has(way.highway ?? "");
}

/**
 * Cut a street at every point another street shares, so a car can turn
 * where streets cross mid-way and not only where a mapped way ends.
 */
function atIntersections(points: readonly Pt[], shared: ReadonlyMap<string, number>): Pt[][] {
  const pieces: Pt[][] = [];
  let piece: Pt[] = [points[0]!];
  for (let i = 1; i < points.length; i += 1) {
    piece.push(points[i]!);
    if (i < points.length - 1 && (shared.get(snapKey(points[i]!)) ?? 0) > 1) {
      pieces.push(piece);
      piece = [points[i]!];
    }
  }
  pieces.push(piece);
  return pieces;
}

/**
 * Car lanes from drivable roads (two per two-way street, one per one-way
 * street) joined where streets meet, and walk lanes from footpaths with
 * the pieces inside buildings cut out.
 */
export function buildTrafficLanes(ways: readonly TrafficWay[], grid?: FootprintGrid): TrafficLanes {
  const cars: Lane[] = [];
  const walks: Lane[] = [];
  // How many streets touch each point.
  const shared = new Map<string, number>();
  for (const way of ways) {
    if (!drivable(way)) continue;
    for (const key of new Set(way.points.map(snapKey))) shared.set(key, (shared.get(key) ?? 0) + 1);
  }
  for (const way of ways) {
    if (way.points.length < 2 || way.indoor) continue;
    const highway = way.highway ?? "";
    if (drivable(way)) {
      for (const piece of atIntersections(way.points, shared)) addStreet(cars, way, piece);
      continue;
    }
    if ((way.layer === "footway" || way.layer === "sidewalk" || way.layer === "path") && !NO_WALKERS.has(highway)) {
      for (const run of grid ? outdoorRuns(way.points, grid) : [way.points]) {
        const lane = makeLane("walk", run, 0.21, snapKey(run[0]!), snapKey(run[run.length - 1]!));
        if (lane && lane.length >= 0.8) walks.push(lane);
      }
    }
  }
  const starts = new Map<string, number[]>();
  cars.forEach((lane, index) => {
    const list = starts.get(lane.start);
    if (list) list.push(index);
    else starts.set(lane.start, [index]);
  });
  cars.forEach((lane, index) => {
    const onward = (starts.get(lane.end) ?? []).filter((other) => other !== lane.reverse && other !== index);
    // A dead end turns around; a lone one-way stub starts over.
    lane.next = onward.length > 0 ? onward : lane.reverse >= 0 ? [lane.reverse] : [];
  });
  return { cars, walks };
}

/** One lane for a one-way piece of street, two (paired) for a two-way piece. */
function addStreet(cars: Lane[], way: TrafficWay, points: readonly Pt[]) {
  const speed = carSpeed(way.highway);
  const forward = points;
  const backward = [...points].reverse();
  const offset = carLaneOffset(way);
  const add = (line: readonly Pt[]) => {
    const lane = makeLane("car", offsetRight(line, offset), speed, snapKey(line[0]!), snapKey(line[line.length - 1]!));
    if (!lane) return -1;
    cars.push(lane);
    return cars.length - 1;
  };
  if (way.oneway === 1) add(forward);
  else if (way.oneway === -1) add(backward);
  else {
    const a = add(forward);
    const b = add(backward);
    if (a >= 0 && b >= 0) {
      cars[a]!.reverse = b;
      cars[b]!.reverse = a;
    }
  }
}

/** Put the agent at distance `s` on its lane and refresh x, z, and yaw. */
export function place(agent: Agent, lane: Lane) {
  const last = lane.cum.length - 2;
  if (agent.seg > last || agent.seg < 0) agent.seg = 0;
  while (agent.seg < last && agent.s > lane.cum[agent.seg + 1]!) agent.seg += 1;
  while (agent.seg > 0 && agent.s < lane.cum[agent.seg]!) agent.seg -= 1;
  const i = agent.seg;
  const ax = lane.xs[i]!;
  const az = lane.zs[i]!;
  const span = lane.cum[i + 1]! - lane.cum[i]! || 1;
  const dx = (lane.xs[i + 1]! - ax) / span;
  const dz = (lane.zs[i + 1]! - az) / span;
  const t = agent.s - lane.cum[i]!;
  agent.x = ax + dx * t - dz * agent.side;
  agent.z = az + dz * t + dx * agent.side;
  agent.yaw = Math.atan2(-dz * agent.dir, dx * agent.dir);
}

/** Start an agent on a lane at distance `s`. */
export function spawn(agent: Agent, lanes: readonly Lane[], laneIndex: number, s: number, rand: () => number = Math.random) {
  const lane = lanes[laneIndex]!;
  agent.lane = laneIndex;
  agent.seg = 0;
  agent.s = Math.max(0, Math.min(lane.length, s));
  if (lane.kind === "car") {
    agent.dir = 1;
    agent.speed = lane.speed;
    agent.side = 0;
  } else {
    agent.dir = rand() < 0.5 ? 1 : -1;
    agent.speed = 0.18 + rand() * 0.07;
    // Keep to the right of the path, a little apart from each other.
    agent.side = agent.dir * (0.03 + rand() * 0.06);
    agent.phase = rand() * Math.PI * 2;
  }
  place(agent, lane);
}

export function newAgent(): Agent {
  return { lane: -1, seg: 0, s: 0, dir: 1, speed: 0, side: 0, x: 0, z: 0, yaw: 0, phase: 0 };
}

/**
 * Move an agent `dt` seconds along its lanes. A car that reaches the end of
 * a lane turns into a random street that continues from there (turning
 * around at a dead end); a walker turns back at the end of the path.
 */
export function advance(agent: Agent, lanes: readonly Lane[], dt: number, rand: () => number = Math.random) {
  let lane = lanes[agent.lane];
  if (!lane) return;
  agent.s += agent.dir * agent.speed * dt;
  if (lane.kind === "walk") {
    agent.phase += dt * agent.speed * 40;
    if (agent.s > lane.length) {
      agent.s = Math.max(0, 2 * lane.length - agent.s);
      agent.dir = -1;
      agent.side = -Math.abs(agent.side);
    } else if (agent.s < 0) {
      agent.s = Math.min(lane.length, -agent.s);
      agent.dir = 1;
      agent.side = Math.abs(agent.side);
    }
  } else {
    for (let guard = 0; agent.s > lane.length && guard < 8; guard += 1) {
      const over = agent.s - lane.length;
      const options: readonly number[] = lane.next;
      if (options.length > 0) agent.lane = options[Math.floor(rand() * options.length) % options.length]!;
      lane = lanes[agent.lane]!;
      agent.s = Math.min(over, lane.length);
      agent.seg = 0;
      agent.speed = lane.speed;
    }
    if (agent.s > lane.length) agent.s = lane.length;
  }
  place(agent, lane);
}
