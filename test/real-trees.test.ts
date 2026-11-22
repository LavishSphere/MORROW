import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { neighborhoodGeoJson, treeRowPoints, waysFromOverpass } from "../src/data/overpass.ts";
import { tileQuery } from "../shared/osmQueries.ts";

test("mapped trees and tree rows come from OpenStreetMap and stand where they are mapped", async () => {
  assert.match(tileQuery("1:1"), /node\["natural"="tree"\]/);
  assert.match(tileQuery("1:1"), /way\["natural"="tree_row"\]/);
  const ways = waysFromOverpass({
    elements: [
      { type: "node", id: 1, lat: 42.37, lon: -71.12, tags: { natural: "tree", leaf_type: "needleleaved" } },
      { type: "node", id: 2, lat: 42.371, lon: -71.121, tags: { natural: "tree" } },
      {
        type: "way",
        id: 3,
        tags: { natural: "tree_row" },
        geometry: [
          { lat: 42.37, lon: -71.12 },
          { lat: 42.37, lon: -71.1188 },
        ],
      },
    ],
  });
  const trees = ways.filter((w) => w.kind === "tree");
  assert.equal(trees.length, 3);
  assert.equal(trees[0]?.tags?.leaf_type, "needleleaved");
  // About 100 m of row: a tree every ~9 m.
  assert.ok((trees[2]?.points.length ?? 0) >= 9 && (trees[2]?.points.length ?? 0) <= 12);
  assert.equal(treeRowPoints([[0, 0]]).length, 0);
  const geo = neighborhoodGeoJson({ place: { label: "x", lng: -71.12, lat: 42.37 }, ways } as never) as {
    features: { geometry: { type: string }; properties: { layer: string; leaf?: string | null } }[];
  };
  const layer = geo.features.filter((f) => f.properties.layer === "tree");
  assert.equal(layer.length, 3);
  assert.equal(layer[0]?.geometry.type, "MultiPoint");
  assert.equal(layer[0]?.properties.leaf, "needleleaved");
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  assert.match(city, /for \(const tree of model\.parsed\.trees \?\? \[\]\)/);
  assert.match(city, /occupancy\.markDisk\(tree\.x, tree\.z, 0\.9\)/);
});
