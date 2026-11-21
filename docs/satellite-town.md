# Satellite town

The canvas is a top-down satellite of the Wellesley showcase, not the low-poly street model.

## What this view owns

`src/satellite/camera` flies the camera. `src/satellite/town` is the frame around it: the black bar, the wordmark, the **See next problem** control, the before/after photos, and the blue pins drawn on the imagery.

Body copy is white. `#1488FF` is the wordmark, the pin diamonds, and the button outline. A move between places eases out and back in. The imagery blurs about 1.75px during that move and is sharp when the camera settles. Reduced motion snaps, with no blur.

The town frame is the bbox in `data/wellesley/bbox.json`. Imagery is Esri World Imagery (Maxar, Earthstar Geographics), credited on the view.

## What this view does not own

Pins are not a list typed into the camera.

- `src/satellite/pins/index.ts` exports `useAiDetection()`. It returns the detected problems (`id`, `longitude`, `latitude`, `title`), `selectedId`, `seeNextProblem`, `selectProblem`, `phase`, and `sourceLabel`. The button and the markers call those functions. The town does not keep its own list of places.
- `src/satellite/stats/index.ts` exports `SatelliteStats({ problemId })`. That component renders the improvement figures and the Gemini cost estimate. The town view only gives it a white slot on the card.

The before/after photos are an illustrative curb and ramp, so the change is readable at a glance. They are not a field photo of a verified Wellesley defect.

## Run

```bash
npm install
npm run dev
```

Open the local Vite URL. **See next problem** moves the camera to the next problem the detection pass returns.
