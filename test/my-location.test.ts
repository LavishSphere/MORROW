import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  canUseLocation,
  LOCATE_OPTIONS,
  locationErrorMessage,
  placeFromReverseEsri,
} from "../src/data/myLocation.ts";

test("a reverse-geocoded US point becomes a street, city, state and zip label", () => {
  const place = placeFromReverseEsri({
    address: {
      Match_addr: "Clapp Library",
      LongLabel: "Clapp Library, 106 Central St, Wellesley, MA, 02481, USA",
      Address: "106 Central St",
      City: "Wellesley",
      Region: "Massachusetts",
      RegionAbbr: "MA",
      Postal: "02481",
      CountryCode: "USA",
      Addr_type: "POI",
    },
    location: { x: -71.292, y: 42.296, spatialReference: { wkid: 4326 } },
  });
  assert.equal(place?.label, "106 Central St, Wellesley, MA, 02481");
  assert.equal(place?.town, "Wellesley, MA");
  assert.equal(place?.addrType, "POI");
  assert.equal(place?.inUs, true);
  assert.equal(place?.lng, -71.292);
  assert.equal(place?.lat, 42.296);
});

test("a point with no street still names its town", () => {
  const place = placeFromReverseEsri({
    address: { City: "Marfa", Region: "Texas", CountryCode: "USA", Addr_type: "Locality" },
    location: { x: -104.02, y: 30.31 },
  });
  assert.equal(place?.label, "Marfa, Texas");
  assert.equal(place?.inUs, true);
});

test("a point outside the US is named but flagged", () => {
  const place = placeFromReverseEsri({
    address: {
      Address: "10 Downing St",
      City: "London",
      Region: "England",
      Postal: "SW1A 2AA",
      CountryCode: "GBR",
    },
    location: { x: -0.1276, y: 51.5034 },
  });
  assert.equal(place?.inUs, false);
  // Without a country code the US box decides.
  const paris = placeFromReverseEsri({
    address: { LongLabel: "Paris, Île-de-France" },
    location: { x: 2.35, y: 48.85 },
  });
  assert.equal(paris?.inUs, false);
  assert.equal(paris?.label, "Paris, Île-de-France");
});

test("a reverse-geocode error or empty body gives no place", () => {
  assert.equal(
    placeFromReverseEsri({
      error: { code: 400, message: "Cannot perform query.", details: ["Unable to find address for the specified location."] },
    }),
    null,
  );
  assert.equal(placeFromReverseEsri(null), null);
  assert.equal(placeFromReverseEsri({ address: {}, location: { x: -71, y: 42 } }), null);
  assert.equal(placeFromReverseEsri({ address: { City: "Boston" } }), null);
  assert.equal(placeFromReverseEsri({ address: { City: "Boston" }, location: { x: Number.NaN, y: 42 } }), null);
});

test("each geolocation error has a short message", () => {
  assert.equal(locationErrorMessage(1), "Location is off for this site.");
  assert.match(locationErrorMessage(2), /not available/);
  assert.match(locationErrorMessage(3), /took too long/);
  assert.match(locationErrorMessage(undefined), /Could not find your location/);
});

test("location is offered only in a secure context with geolocation", () => {
  assert.equal(canUseLocation({ isSecureContext: true, geolocation: {} }), true);
  assert.equal(canUseLocation({ isSecureContext: false, geolocation: {} }), false);
  assert.equal(canUseLocation({ isSecureContext: true, geolocation: undefined }), false);
  assert.equal(canUseLocation({}), false);
  assert.deepEqual(LOCATE_OPTIONS, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
});

test("the address bar has a Use my location button that loads through the typed-address path", async () => {
  const address = await readFile("src/components/AddressBar.tsx", "utf8");
  assert.match(address, /aria-label="Use my location"/);
  assert.match(address, /navigator\.geolocation\.getCurrentPosition\(/);
  assert.match(address, /reverseGeocode\(longitude, latitude\)/);
  assert.match(address, /await go\(place\.label\)/);
  assert.match(address, /\{canLocate && \(/);
  assert.match(address, /disabled=\{busy \|\| locating\}/);
});
