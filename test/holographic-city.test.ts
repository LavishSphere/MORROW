import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("the glass city is rebuilt from the real Wellesley map", async () => {
  const town = await readFile("src/showcase/scene/TownScene.tsx", "utf8");
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const canvas = await readFile("src/showcase/ShowcaseCanvas.tsx", "utf8");
  const sky = await readFile("src/showcase/scene/Space.tsx", "utf8");
  // No loaded city means the whole town; a loaded city rebuilds from its map.
  assert.match(town, /<City geoJson=\{geoJson === basemap \? undefined : geoJson\} \/>/);
  assert.match(city, /const model = useMemo\(\(\) => \(geoJson \? buildModel\(geoJson\) : TOWN\)/);
  // Real town data: every building and street comes from the OSM extract.
  assert.match(city, /data\/wellesley\/town\.geojson/);
  assert.match(city, /const TOWN = buildModel\(town, SHOWCASE_BBOX\.center\)/);
  assert.match(city, /parseBasemap\(geoJson, projector\)/);
  assert.match(city, /for \(const building of model\.parsed\.buildings\)/);
  assert.match(city, /way\.name === "Central Street"/);
  // Every side is glazed: curtain-wall glass wraps each real footprint.
  const glass = await readFile("src/showcase/scene/glass.ts", "utf8");
  assert.match(city, /worldCurtainWall\(/);
  assert.match(city, /walls\(tint, ring, PODIUM_H, top\)/);
  assert.match(glass, /Mullions and floor slabs/);
  assert.match(city, /MeshPhysicalMaterial/);
  assert.equal(city.includes("<Edges"), false);
  // Thousands of buildings stay fast: merged surfaces, instanced furniture.
  assert.match(city, /class Bucket/);
  assert.match(city, /new THREE\.InstancedMesh/);
  assert.match(city, /function Pothole/);
  assert.match(city, /shapes\.hydrant/);
  assert.match(city, /shapes\.pole/);
  assert.match(city, /shapes\.seat/);
  assert.match(city, /shapes\.canopy/);
  assert.equal(city.includes("CircuitGrid"), false);
  assert.match(city, /Sparkles/);
  assert.equal(city.includes("DetailedBuilding"), false);
  assert.equal(canvas.includes("OpeningSequence"), false);
  // Realistic daylight sky: blue zenith, sun glow, drifting clouds.
  assert.match(sky, /vec3 zenith/);
  assert.match(sky, /fbm\(/);
  assert.match(sky, /uSun/);
});

test("the town extract covers far more than the campus showcase", async () => {
  const town = JSON.parse(await readFile("data/wellesley/town.geojson", "utf8"));
  const campus = JSON.parse(await readFile("data/wellesley/basemap.geojson", "utf8"));
  const buildings = (fc: { features: { properties: { layer?: string } }[] }) =>
    fc.features.filter((f) => f.properties.layer === "building").length;
  assert.ok(buildings(town) > 10 * buildings(campus));
  const names = new Set(
    town.features
      .filter((f: { properties: { layer?: string } }) => f.properties.layer === "road")
      .map((f: { properties: { name?: string } }) => f.properties.name),
  );
  for (const street of ["Central Street", "Washington Street", "Worcester Street"]) {
    assert.ok(names.has(street), `missing ${street}`);
  }
});

test("a minimap, a where-am-I label, and street signs help you find your way", async () => {
  const slot = await readFile("src/components/CanvasSlot.tsx", "utf8");
  const minimap = await readFile("src/components/Minimap.tsx", "utf8");
  const signs = await readFile("src/showcase/scene/StreetSigns.tsx", "utf8");
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const rig = await readFile("src/showcase/scene/CameraRig.tsx", "utf8");
  assert.match(slot, /<Minimap placeLabel=/);
  assert.match(city, /publishMap\(mapFor\(model\)\)/);
  assert.match(rig, /publishPose\(/);
  // Click the minimap to fly there.
  assert.match(minimap, /flyTo\(/);
  assert.match(rig, /getCityState\(\)\.fly/);
  // The label names the street only when zoomed in.
  assert.match(minimap, /whereAmI\(map, pose\.x, pose\.z\)/);
  assert.match(minimap, /pose\.distance < ZOOMED_IN/);
  // Signs appear only when zoomed in, and only nearby.
  assert.match(signs, /camera\.position\.distanceTo\(target\) < ZOOMED_IN/);
  assert.match(signs, /\.slice\(0, MAX\)/);
  assert.match(city, /<StreetSigns signs=\{built\.signs\} \/>/);
});
