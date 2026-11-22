/**
 * Minimal GTFS-realtime decoder for vehicle positions.
 *
 * Reads only the FeedMessage fields a map needs (header timestamp, and each
 * entity's VehiclePosition: trip, position, status, stop, vehicle id). Every
 * other field, including agency extensions such as NYCT's, is skipped by
 * wire type. Works on a plain Uint8Array (a Node Buffer is one).
 *
 * Field numbers follow gtfs-realtime.proto:
 * https://gtfs.org/documentation/realtime/proto/
 */

export type GtfsVehiclePosition = {
  entityId: string;
  vehicleId: string | null;
  vehicleLabel: string | null;
  tripId: string | null;
  routeId: string | null;
  directionId: number | null;
  /** Null when the feed reports stop progress without coordinates (NYCT). */
  lat: number | null;
  lon: number | null;
  bearing: number | null;
  speed: number | null;
  stopId: string | null;
  currentStatus: "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO" | null;
  /** POSIX seconds; falls back to the feed header timestamp. */
  timestamp: number | null;
};

export type GtfsFeed = {
  timestamp: number | null;
  vehicles: GtfsVehiclePosition[];
};

const STATUS = ["INCOMING_AT", "STOPPED_AT", "IN_TRANSIT_TO"] as const;

const utf8 = new TextDecoder();

class Reader {
  pos: number;
  readonly end: number;
  readonly buf: Uint8Array;
  readonly view: DataView;

  constructor(buf: Uint8Array, start = 0, end = buf.length) {
    this.buf = buf;
    this.pos = start;
    this.end = end;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  done(): boolean {
    return this.pos >= this.end;
  }

  /** Varint as a JS number (exact up to 2^53, which covers timestamps). */
  varint(): number {
    let result = 0;
    let scale = 1;
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.end) throw new Error("Truncated varint");
      const byte = this.buf[this.pos++] as number;
      result += (byte & 0x7f) * scale;
      if (byte < 0x80) return result;
      scale *= 128;
    }
    throw new Error("Varint too long");
  }

  float(): number {
    if (this.pos + 4 > this.end) throw new Error("Truncated float");
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  double(): number {
    if (this.pos + 8 > this.end) throw new Error("Truncated double");
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  /** Length-delimited field: returns a sub-reader and advances past it. */
  sub(): Reader {
    const len = this.varint();
    const start = this.pos;
    const end = start + len;
    if (end > this.end) throw new Error("Truncated message");
    this.pos = end;
    return new Reader(this.buf, start, end);
  }

  string(): string {
    const r = this.sub();
    return utf8.decode(this.buf.subarray(r.pos, r.end));
  }

  skip(wireType: number): void {
    switch (wireType) {
      case 0:
        this.varint();
        return;
      case 1:
        this.pos += 8;
        break;
      case 2:
        this.sub();
        return;
      case 5:
        this.pos += 4;
        break;
      default:
        throw new Error(`Unsupported wire type ${wireType}`);
    }
    if (this.pos > this.end) throw new Error("Truncated field");
  }

  /** Iterate fields; the callback returns true when it consumed the value. */
  fields(onField: (field: number, wireType: number) => boolean): void {
    while (!this.done()) {
      const key = this.varint();
      const field = Math.floor(key / 8);
      const wireType = key % 8;
      if (!onField(field, wireType)) this.skip(wireType);
    }
  }
}

function emptyVehicle(entityId: string): GtfsVehiclePosition {
  return {
    entityId,
    vehicleId: null,
    vehicleLabel: null,
    tripId: null,
    routeId: null,
    directionId: null,
    lat: null,
    lon: null,
    bearing: null,
    speed: null,
    stopId: null,
    currentStatus: null,
    timestamp: null,
  };
}

function readTrip(r: Reader, v: GtfsVehiclePosition): void {
  r.fields((field, wt) => {
    if (field === 1 && wt === 2) v.tripId = r.string();
    else if (field === 5 && wt === 2) v.routeId = r.string();
    else if (field === 6 && wt === 0) v.directionId = r.varint();
    else return false;
    return true;
  });
}

function readPosition(r: Reader, v: GtfsVehiclePosition): void {
  r.fields((field, wt) => {
    if (field === 1 && wt === 5) v.lat = r.float();
    else if (field === 2 && wt === 5) v.lon = r.float();
    else if (field === 3 && wt === 5) v.bearing = r.float();
    else if (field === 5 && wt === 5) v.speed = r.float();
    else return false;
    return true;
  });
}

function readDescriptor(r: Reader, v: GtfsVehiclePosition): void {
  r.fields((field, wt) => {
    if (field === 1 && wt === 2) v.vehicleId = r.string();
    else if (field === 2 && wt === 2) v.vehicleLabel = r.string();
    else return false;
    return true;
  });
}

function readVehicle(r: Reader, v: GtfsVehiclePosition): void {
  r.fields((field, wt) => {
    if (field === 1 && wt === 2) readTrip(r.sub(), v);
    else if (field === 2 && wt === 2) readPosition(r.sub(), v);
    else if (field === 4 && wt === 0) v.currentStatus = STATUS[r.varint()] ?? null;
    else if (field === 5 && wt === 0) v.timestamp = r.varint();
    else if (field === 7 && wt === 2) v.stopId = r.string();
    else if (field === 8 && wt === 2) readDescriptor(r.sub(), v);
    else return false;
    return true;
  });
}

/** TripUpdate.trip (field 1): only trip_id and route_id are kept. */
function readTripUpdate(r: Reader): GtfsVehiclePosition {
  const trip = emptyVehicle("");
  r.fields((field, wt) => {
    if (field !== 1 || wt !== 2) return false;
    readTrip(r.sub(), trip);
    return true;
  });
  return trip;
}

function readEntity(
  r: Reader,
  routes: Map<string, string>,
): GtfsVehiclePosition | null {
  let id = "";
  let deleted = false;
  let vehicle: GtfsVehiclePosition | null = null;
  let update: GtfsVehiclePosition | null = null;
  r.fields((field, wt) => {
    if (field === 1 && wt === 2) {
      id = r.string();
      if (vehicle) vehicle.entityId = id;
    } else if (field === 2 && wt === 0) {
      deleted = r.varint() !== 0;
    } else if (field === 3 && wt === 2) {
      update = readTripUpdate(r.sub());
    } else if (field === 4 && wt === 2) {
      vehicle = emptyVehicle(id);
      readVehicle(r.sub(), vehicle);
    } else {
      return false;
    }
    return true;
  });
  const u = update as GtfsVehiclePosition | null;
  if (u?.routeId) {
    if (u.tripId) routes.set(u.tripId, u.routeId);
    // Metro-North keys the vehicle's trip_id by train number, which is the
    // trip update's entity id rather than its trip_id.
    if (id && !routes.has(id)) routes.set(id, u.routeId);
  }
  return deleted ? null : vehicle;
}

/** Decode a GTFS-realtime FeedMessage, keeping only vehicle positions. */
export function decodeVehiclePositions(buf: Uint8Array): GtfsFeed {
  const r = new Reader(buf);
  let timestamp: number | null = null;
  const vehicles: GtfsVehiclePosition[] = [];
  // Some feeds (LIRR, Metro-North) leave route_id off the vehicle's trip but
  // set it on the matching trip update in the same message.
  const routes = new Map<string, string>();
  r.fields((field, wt) => {
    if (field === 1 && wt === 2) {
      const h = r.sub();
      h.fields((f, w) => {
        if (f === 3 && w === 0) {
          timestamp = h.varint();
          return true;
        }
        return false;
      });
    } else if (field === 2 && wt === 2) {
      const v = readEntity(r.sub(), routes);
      if (v) vehicles.push(v);
    } else {
      return false;
    }
    return true;
  });
  for (const v of vehicles) {
    if (v.timestamp === null || v.timestamp === 0) v.timestamp = timestamp;
    if (!v.routeId && v.tripId) v.routeId = routes.get(v.tripId) ?? null;
  }
  return { timestamp, vehicles };
}
