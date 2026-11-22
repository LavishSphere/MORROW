import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { advance, CAR_GAP, newAgent, spawn, type Agent, type Lane, type TrafficLanes } from "./trafficLanes.ts";

/** Traffic runs once the camera is this close to what it looks at. */
const ZOOMED_IN = 40;
/** Only lanes within this distance of the view center carry traffic. */
const RADIUS = 30;
const CAR_CAP = 300;
const PEOPLE_CAP = 400;
/** One car per this much nearby lane, one walker per this much nearby path. */
const CAR_SPACING = 6;
const WALK_SPACING = 4;
/** Wheels roll on the road surface, not through it. */
const CAR_LIFT = 0.035;
/** How far arms and legs swing, in radians. */
const STRIDE = 0.6;

const CAR_COLORS = ["#e8eef2", "#d4543c", "#3d6fb5", "#f2c14e", "#2f3438", "#7eb0c8", "#9aa3a8", "#2e5a3a"];
const SHIRTS = ["#ff6b6b", "#ffd23f", "#3ec1d3", "#1488ff", "#8e7cff", "#2ecc71", "#ff9f43", "#f78fb3", "#f4f4f4"];
const SKINS = ["#f1c9a5", "#e0ac83", "#c68a5e", "#a0673f", "#7a4a2a", "#5b3a24"];
const PANTS = ["#2d3a4f", "#3b4552", "#1f2328", "#6b5a45", "#4a5f7a", "#8a8f96", "#5a3f5e"];

type Geo = THREE.BufferGeometry;
type TrafficShapes = { car: Geo; windows: Geo; wheels: Geo; hubs: Geo; headlights: Geo; body: Geo; head: Geo; legs: Geo };
type TrafficLooks = {
  paint: THREE.Material;
  glass: THREE.Material;
  tire: THREE.Material;
  hub: THREE.Material;
  lamp: THREE.Material;
  shirt: THREE.Material;
  skin: THREE.Material;
  pants: THREE.Material;
};

/**
 * Swing arms and legs about the shoulder and hip: each vertex's `aSwing`
 * says how much and around what height, and each walker's `aWalk` gives
 * its phase and stride. Rotation is about local z, so limbs move along +x,
 * the way the figure faces.
 */
function walkCycle(source: THREE.Material) {
  const material = source.clone();
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aSwing;\nattribute vec2 aWalk;")
      .replace(
        "#include <beginnormal_vertex>",
        [
          "#include <beginnormal_vertex>",
          "float swingA = aSwing.x * sin(aWalk.x) * aWalk.y;",
          "float swingC = cos(swingA);",
          "float swingS = sin(swingA);",
          "objectNormal.xy = vec2(objectNormal.x * swingC - objectNormal.y * swingS, objectNormal.x * swingS + objectNormal.y * swingC);",
        ].join("\n"),
      )
      .replace(
        "#include <begin_vertex>",
        [
          "#include <begin_vertex>",
          "float swingY = transformed.y - aSwing.y;",
          "transformed.xy = vec2(transformed.x * swingC - swingY * swingS, transformed.x * swingS + swingY * swingC + aSwing.y);",
        ].join("\n"),
      );
  };
  material.customProgramCacheKey = () => "morrow-walk-cycle";
  return material;
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] ?? list[0]!;
}

/** Instanced meshes that share one instance-matrix buffer: one upload per frame for all parts. */
function pool(parts: [Geo, THREE.Material, boolean][], cap: number) {
  const matrix = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16);
  matrix.setUsage(THREE.DynamicDrawUsage);
  const meshes = parts.map(([geometry, material, shadow]) => {
    const mesh = new THREE.InstancedMesh(geometry, material, cap);
    mesh.instanceMatrix = matrix;
    mesh.count = 0;
    mesh.visible = false;
    // Instances move, so a cached bounding sphere would cull them wrongly.
    mesh.frustumCulled = false;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.raycast = () => null;
    return mesh;
  });
  return { matrix, meshes };
}

/** Write a yaw-only transform without allocating. */
function writeMatrix(out: Float32Array, i: number, x: number, y: number, z: number, yaw: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const o = i * 16;
  out[o] = c;
  out[o + 1] = 0;
  out[o + 2] = -s;
  out[o + 3] = 0;
  out[o + 4] = 0;
  out[o + 5] = 1;
  out[o + 6] = 0;
  out[o + 7] = 0;
  out[o + 8] = s;
  out[o + 9] = 0;
  out[o + 10] = c;
  out[o + 11] = 0;
  out[o + 12] = x;
  out[o + 13] = y;
  out[o + 14] = z;
  out[o + 15] = 1;
}

/** Lanes near the view center, and how many agents they should carry. */
function nearby(lanes: readonly Lane[], x: number, z: number, out: number[], spacing: number) {
  out.length = 0;
  let room = 0;
  for (let i = 0; i < lanes.length; i += 1) {
    const lane = lanes[i]!;
    const dx = Math.max(lane.minX - x, 0, x - lane.maxX);
    const dz = Math.max(lane.minZ - z, 0, z - lane.maxZ);
    if (dx * dx + dz * dz > RADIUS * RADIUS) continue;
    out.push(i);
    room += Math.min(lane.length, RADIUS * 2);
  }
  return Math.floor(room / spacing);
}

/** One kind of mover: its agents, lanes, and the meshes that draw them. */
class Crowd {
  readonly agents: Agent[];
  readonly near: number[] = [];
  readonly lanes: readonly Lane[];
  readonly matrix: THREE.InstancedBufferAttribute;
  readonly meshes: THREE.InstancedMesh[];
  readonly walk: THREE.InstancedBufferAttribute | null;
  readonly cap: number;
  readonly spacing: number;
  count = 0;

  constructor(
    lanes: readonly Lane[],
    parts: [Geo, THREE.Material, boolean][],
    cap: number,
    spacing: number,
    walk: THREE.InstancedBufferAttribute | null,
  ) {
    this.lanes = lanes;
    this.cap = cap;
    this.spacing = spacing;
    this.walk = walk;
    this.agents = Array.from({ length: cap }, newAgent);
    const { matrix, meshes } = pool(parts, cap);
    this.matrix = matrix;
    this.meshes = meshes;
  }

  /** Choose lanes around (x, z) and fill them; the old agents start over. */
  retarget(x: number, z: number) {
    const want = nearby(this.lanes, x, z, this.near, this.spacing);
    this.count = Math.min(this.cap, want);
    for (let i = 0; i < this.count; i += 1) this.agents[i]!.lane = -1;
    for (let i = 0; i < this.count; i += 1) this.respawn(i, x, z);
  }

  /** Put agent i somewhere on a nearby lane, spaced from cars already on it. */
  respawn(i: number, x: number, z: number) {
    const agent = this.agents[i]!;
    agent.lane = -1;
    if (this.near.length === 0) return;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const laneIndex = this.near[Math.floor(Math.random() * this.near.length)]!;
      const lane = this.lanes[laneIndex]!;
      const s = Math.random() * lane.length;
      if (lane.kind === "car" && this.crowded(laneIndex, s, i)) continue;
      spawn(agent, this.lanes, laneIndex, s);
      if ((agent.x - x) ** 2 + (agent.z - z) ** 2 < RADIUS * RADIUS) return;
    }
    agent.lane = -1;
  }

  private crowded(laneIndex: number, s: number, self: number) {
    for (let j = 0; j < this.count; j += 1) {
      const other = this.agents[j]!;
      if (j !== self && other.lane === laneIndex && Math.abs(other.s - s) < CAR_GAP) return true;
    }
    return false;
  }

  step(dt: number, x: number, z: number) {
    const out = this.matrix.array as Float32Array;
    const phases = this.walk ? (this.walk.array as Float32Array) : null;
    let respawns = 0;
    for (let i = 0; i < this.count; i += 1) {
      const agent = this.agents[i]!;
      if (agent.lane >= 0) {
        advance(agent, this.lanes, dt);
        if ((agent.x - x) ** 2 + (agent.z - z) ** 2 > RADIUS * RADIUS && respawns < 12) {
          respawns += 1;
          this.respawn(i, x, z);
        }
      } else if (respawns < 12) {
        respawns += 1;
        this.respawn(i, x, z);
      }
      if (agent.lane < 0) {
        // Not placed yet: park it far below the ground.
        writeMatrix(out, i, 0, -1000, 0, 0);
        continue;
      }
      if (phases) {
        phases[i * 2] = agent.phase;
        phases[i * 2 + 1] = STRIDE;
        const bob = (1 - Math.cos(agent.phase * 2)) * 0.006;
        writeMatrix(out, i, agent.x, bob, agent.z, agent.yaw);
      } else {
        writeMatrix(out, i, agent.x, CAR_LIFT, agent.z, agent.yaw);
      }
    }
    this.matrix.clearUpdateRanges();
    this.matrix.addUpdateRange(0, this.count * 16);
    this.matrix.needsUpdate = true;
    if (this.walk) {
      this.walk.clearUpdateRanges();
      this.walk.addUpdateRange(0, this.count * 2);
      this.walk.needsUpdate = true;
    }
    this.show(true);
  }

  show(on: boolean) {
    const count = on ? this.count : 0;
    for (const mesh of this.meshes) {
      mesh.count = count;
      mesh.visible = count > 0;
    }
  }

  dispose() {
    for (const mesh of this.meshes) mesh.dispose();
  }
}

/** Everything that moves: cars and walkers, built once per map. */
class Sim {
  readonly cars: Crowd;
  readonly walkers: Crowd;
  readonly group = new THREE.Group();
  private readonly owned: { dispose(): void }[] = [];
  active = false;
  private lastX = Infinity;
  private lastZ = Infinity;

  constructor(lanes: TrafficLanes, shapes: TrafficShapes, looks: TrafficLooks, cars: number, people: number) {
    this.group.name = "traffic";
    this.cars = new Crowd(
      lanes.cars,
      [
        [shapes.car, looks.paint, true],
        [shapes.windows, looks.glass, false],
        [shapes.wheels, looks.tire, false],
        [shapes.hubs, looks.hub, false],
        [shapes.headlights, looks.lamp, false],
      ],
      cars,
      CAR_SPACING,
      null,
    );
    const color = new THREE.Color();
    const paint = this.cars.meshes[0]!;
    for (let i = 0; i < cars; i += 1) paint.setColorAt(i, color.set(pick(CAR_COLORS)));

    // Walkers draw the standing figure's shapes with a walk cycle: copies
    // of the geometry carry the per-walker phase, and copies of the materials
    // carry the shader swing, so standing people stay still.
    const walk = new THREE.InstancedBufferAttribute(new Float32Array(people * 2), 2);
    walk.setUsage(THREE.DynamicDrawUsage);
    const body = shapes.body.clone().setAttribute("aWalk", walk);
    const head = shapes.head.clone().setAttribute("aWalk", walk);
    const legs = shapes.legs.clone().setAttribute("aWalk", walk);
    const shirt = walkCycle(looks.shirt);
    const skin = walkCycle(looks.skin);
    const pants = walkCycle(looks.pants);
    this.owned.push(body, head, legs, shirt, skin, pants);
    this.walkers = new Crowd(
      lanes.walks,
      [
        [body, shirt, false],
        [head, skin, false],
        [legs, pants, false],
      ],
      people,
      WALK_SPACING,
      walk,
    );
    const [shirts, skins, trousers] = this.walkers.meshes;
    for (let i = 0; i < people; i += 1) {
      shirts!.setColorAt(i, color.set(pick(SHIRTS)));
      skins!.setColorAt(i, color.set(pick(SKINS)));
      trousers!.setColorAt(i, color.set(pick(PANTS)));
    }
    this.group.add(...this.cars.meshes, ...this.walkers.meshes);
  }

  /** Turn traffic on or off, and pick new lanes once the view has moved. */
  check(active: boolean, x: number, z: number) {
    if (!active) {
      if (this.active) {
        this.cars.show(false);
        this.walkers.show(false);
      }
      this.active = false;
      this.lastX = Infinity;
      return;
    }
    if (!this.active || Math.hypot(x - this.lastX, z - this.lastZ) > RADIUS * 0.25) {
      this.lastX = x;
      this.lastZ = z;
      if (!this.active) {
        this.cars.retarget(x, z);
        this.walkers.retarget(x, z);
      } else {
        // Keep everyone moving; only the lane choice and head count change.
        this.cars.count = Math.min(this.cars.cap, nearby(this.cars.lanes, x, z, this.cars.near, CAR_SPACING));
        this.walkers.count = Math.min(this.walkers.cap, nearby(this.walkers.lanes, x, z, this.walkers.near, WALK_SPACING));
      }
    }
    this.active = true;
  }

  step(dt: number, x: number, z: number) {
    this.cars.step(dt, x, z);
    this.walkers.step(dt, x, z);
  }

  dispose() {
    this.cars.dispose();
    this.walkers.dispose();
    for (const item of this.owned) item.dispose();
  }
}

/**
 * Moving cars and walking people near the view center, only when zoomed in.
 * Off when the OS asks for reduced motion and while the tab is hidden.
 * Checked a few times a second; each frame just moves pooled instances.
 */
export function Traffic({
  lanes,
  shapes,
  looks,
  reducedMotion = false,
  cars = 150,
  people = 250,
}: {
  lanes: TrafficLanes;
  shapes: TrafficShapes;
  looks: TrafficLooks;
  reducedMotion?: boolean;
  cars?: number;
  people?: number;
}) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as {
    target: THREE.Vector3;
  } | null;
  const carCap = Math.max(0, Math.min(CAR_CAP, Math.floor(cars)));
  const peopleCap = Math.max(0, Math.min(PEOPLE_CAP, Math.floor(people)));
  const sim = useMemo(
    () => new Sim(lanes, shapes, looks, carCap, peopleCap),
    [lanes, shapes, looks, carCap, peopleCap],
  );
  useEffect(() => () => sim.dispose(), [sim]);
  const lastCheck = useRef(-Infinity);

  useFrame(({ clock }, delta) => {
    const target = controls?.target;
    if (!target) return;
    if (clock.elapsedTime - lastCheck.current >= 0.25) {
      lastCheck.current = clock.elapsedTime;
      const hidden = typeof document !== "undefined" && document.hidden;
      const zoomed = camera.position.distanceTo(target) < ZOOMED_IN;
      sim.check(!reducedMotion && !hidden && zoomed, target.x, target.z);
    }
    if (!sim.active) return;
    sim.step(Math.min(delta, 0.1), target.x, target.z);
  });

  return <primitive object={sim.group} />;
}
