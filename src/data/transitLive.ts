export type LiveVehicle = { id: string; lat: number; lon: number; bearing: number | null; routeId: string; color: string | null; status: string | null; updatedAt: string }
export type LiveFeed = { id: string; label: string; covers(bbox: { west: number; south: number; east: number; north: number }): boolean; fetch(signal: AbortSignal): Promise<LiveVehicle[]>; pollMs: number }
