import assert from "node:assert/strict";
import { test } from "node:test";
import { decideAddressQuery, isCityOrTown } from "../src/data/addressQuery.ts";
import { mergePlaceSuggestions, placeFromEsri } from "../src/data/places.ts";

const wellesley = { west: -71.32, south: 42.28, east: -71.26, north: 42.32 };

test("the geocoder records whether a match is a city or a street", () => {
  const city = placeFromEsri({
    candidates: [
      {
        address: "Wellesley, Massachusetts",
        location: { x: -71.292, y: 42.296 },
        attributes: { City: "Wellesley", RegionAbbr: "MA", Addr_type: "Locality" },
      },
    ],
  });
  assert.equal(city?.addrType, "Locality");
  assert.equal(city?.town, "Wellesley, MA");
  assert.equal(isCityOrTown(city!), true);

  const street = placeFromEsri({
    candidates: [
      {
        address: "106 Central St, Wellesley, MA, 02481",
        location: { x: -71.292, y: 42.296 },
        attributes: { City: "Wellesley", RegionAbbr: "MA", Addr_type: "PointAddress" },
      },
    ],
  });
  assert.equal(street?.addrType, "PointAddress");
  assert.equal(isCityOrTown(street!), false);
});

test("a city or town query keeps the city already on screen", () => {
  const wellesleyTown = {
    label: "Wellesley, Massachusetts",
    lng: -71.292,
    lat: 42.296,
    town: "Wellesley, MA",
    addrType: "Locality",
  };
  assert.equal(decideAddressQuery(wellesleyTown, wellesley, "Wellesley, MA"), "keep-city");
  // The town name matches even if the centroid sits outside this tile.
  assert.equal(
    decideAddressQuery(wellesleyTown, { west: -71.2, south: 42.2, east: -71.18, north: 42.22 }, "Wellesley, MA"),
    "keep-city",
  );
});

test("a different city loads the city view instead of focusing the camera", () => {
  const boston = {
    label: "Boston, Massachusetts",
    lng: -71.06,
    lat: 42.36,
    town: "Boston, MA",
    addrType: "Locality",
  };
  assert.equal(decideAddressQuery(boston, wellesley, "Wellesley, MA"), "load-city");
  // A city name with no Addr_type still counts as a city, not a street.
  assert.equal(
    decideAddressQuery(
      { label: "Greenville, South Carolina", lng: -82.4, lat: 34.85 },
      wellesley,
      "Wellesley, MA",
    ),
    "load-city",
  );
});

test("a street address in the current city focuses, and one outside loads then focuses", () => {
  const central = {
    label: "106 Central St, Wellesley, MA, 02481",
    lng: -71.292,
    lat: 42.296,
    town: "Wellesley, MA",
    addrType: "StreetAddress",
  };
  assert.equal(decideAddressQuery(central, wellesley, "Wellesley, MA"), "focus");
  const fifth = {
    label: "350 5th Ave, New York, New York, 10118",
    lng: -73.9857,
    lat: 40.7484,
    town: "New York, NY",
    addrType: "PointAddress",
  };
  assert.equal(decideAddressQuery(fifth, wellesley, "Wellesley, MA"), "load-and-focus");
  assert.equal(decideAddressQuery(fifth, null, "Wellesley, MA"), "load-and-focus");
});

test("suggestions put cities first until the query has a street number", () => {
  const cities = [{ label: "Boston, MA, USA", magicKey: "city" }];
  const addresses = [
    { label: "106 Central St, Wellesley, MA, USA", magicKey: "st" },
    { label: "Boston, MA, USA", magicKey: "dup" },
  ];
  assert.deepEqual(
    mergePlaceSuggestions("bos", cities, addresses).map((item) => item.magicKey),
    ["city", "st"],
  );
  assert.deepEqual(
    mergePlaceSuggestions("106 cen", cities, addresses).map((item) => item.magicKey),
    ["st", "dup"],
  );
});
