import { useSyncExternalStore } from "react";
import { issueFact, measureIssue, type IssueMeasure, type MapIssue } from "../../shared/issues.ts";
import type { IssueFact } from "../../shared/types.ts";
import { flyTo } from "./cityStore";

/** How close the camera comes when an issue is selected (street-sign range). */
const ISSUE_ZOOM = 26;

/**
 * The accessibility issues found in the current map, and what the resident
 * has done with them: which one is selected, which are improved, and which
 * are going into the proposal. Shared by the 3D city and the mode pages.
 */

export type SceneIssue = MapIssue & {
  /** Marker position in scene units. */
  x: number;
  z: number;
  /** The issue's way in scene units. */
  path: [number, number][];
};

type State = {
  issues: SceneIssue[];
  /** The map the issues came from; measurements are computed against it. */
  collection: unknown;
  /** True for the bundled Wellesley town, which the API can verify by id. */
  serverKnown: boolean;
  selectedId: string | null;
  fixed: ReadonlySet<string>;
  chosen: ReadonlySet<string>;
  /** Bumped when a 3D marker is clicked, so the app opens Improve. */
  openImprove: number;
  /** Compare's switch: show the city as it is today, without the fixes. */
  showBefore: boolean;
};

let state: State = {
  issues: [],
  collection: null,
  serverKnown: false,
  selectedId: null,
  fixed: new Set(),
  chosen: new Set(),
  openImprove: 0,
  showBefore: false,
};
const listeners = new Set<() => void>();
const measures = new Map<string, IssueMeasure>();

function emit(next: Partial<State>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getState() {
  return state;
}

export function useIssueState() {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function publishIssues(issues: SceneIssue[], collection: unknown, serverKnown: boolean) {
  if (collection === state.collection) return;
  measures.clear();
  // Ids are OpenStreetMap way ids: when more of the same city loads, the
  // resident's fixes and picks carry over; anything not on the new map drops.
  const ids = new Set(issues.map((issue) => issue.id));
  const keep = (set: ReadonlySet<string>) => new Set([...set].filter((id) => ids.has(id)));
  emit({
    issues,
    collection,
    serverKnown,
    selectedId: state.selectedId && ids.has(state.selectedId) ? state.selectedId : null,
    fixed: keep(state.fixed),
    chosen: keep(state.chosen),
  });
}

export function selectIssue(id: string | null, options: { openImprove?: boolean } = {}) {
  // Zoom in on it, whether picked in a list or clicked on the map.
  const issue = id ? state.issues.find((item) => item.id === id) : null;
  if (issue) flyTo(issue.x, issue.z, { distance: ISSUE_ZOOM, overhead: true });
  emit({
    selectedId: id,
    ...(options.openImprove ? { openImprove: state.openImprove + 1 } : {}),
  });
}

/** Improve or undo. Improving also adds the issue to the proposal. */
export function toggleFixed(id: string) {
  const fixed = new Set(state.fixed);
  const chosen = new Set(state.chosen);
  if (fixed.has(id)) {
    fixed.delete(id);
  } else {
    fixed.add(id);
    chosen.add(id);
  }
  emit({ fixed, chosen });
}

export function toggleChosen(id: string) {
  const chosen = new Set(state.chosen);
  if (chosen.has(id)) chosen.delete(id);
  else chosen.add(id);
  emit({ chosen });
}

export function setShowBefore(showBefore: boolean) {
  if (state.showBefore !== showBefore) emit({ showBefore });
}

/** Before/after for one issue, computed once per map. */
export function measureFor(issue: MapIssue): IssueMeasure {
  let measure = measures.get(issue.id);
  if (!measure) {
    measure = measureIssue(issue, state.collection);
    measures.set(issue.id, measure);
  }
  return measure;
}

/** Proposal facts for the chosen issues, computed in the browser. */
export function chosenFacts(): IssueFact[] {
  return state.issues
    .filter((issue) => state.chosen.has(issue.id))
    .map((issue) => issueFact(issue, state.collection));
}
