import { addAfterEffect, addEffect, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type * as THREE from "three";

/**
 * Development-only frame probe, on with `?perf` in the URL. Shows frame
 * time (p50 / p95), what the renderer drew, and which useFrame callbacks
 * cost the most, and exposes the same numbers on `window.__morrowPerf`
 * for scripted measurements. Nothing runs without the flag.
 */
export const PERF_PROBE =
  import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("perf");

type Sample = { gap: number; cpu: number; frame: number; render: number };

type Snapshot = {
  frames: number;
  gapP50: number;
  gapP95: number;
  gapMax: number;
  cpuP50: number;
  cpuP95: number;
  renderP50: number;
  renderP95: number;
  frameHooksP50: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  heapMB: number | null;
  longTasks: number[];
  slowFrames: string[];
  hooks: { name: string; ms: number; count: number; max: number }[];
  cpuMax: number;
  renderMax: number;
};

function quantile(values: number[], q: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

const round = (value: number) => Math.round(value * 100) / 100;

const WRAPPED = Symbol("perf-wrapped");
type Callback = ((...args: unknown[]) => void) & { [WRAPPED]?: true };

export function PerfProbe() {
  const gl = useThree((state) => state.gl);
  const get = useThree((state) => state.get);

  useEffect(() => {
    const samples: Sample[] = [];
    const longTasks: number[] = [];
    const hooks = new Map<string, { ms: number; count: number; max: number }>();
    let start = 0;
    let lastStart = 0;
    let renderMs = 0;
    let hooksDone = 0;
    let info = { calls: 0, triangles: 0 };

    // Time each useFrame callback, named by the start of its source.
    const wrapSubscribers = () => {
      const subscribers = (get().internal as unknown as { subscribers: { ref: { current: Callback } }[] }).subscribers;
      for (const sub of subscribers) {
        const fn = sub.ref.current;
        if (!fn || fn[WRAPPED]) continue;
        const name = fn.toString().replace(/\s+/g, " ").slice(0, 90);
        const wrapped: Callback = (...args: unknown[]) => {
          const t0 = performance.now();
          fn(...args);
          const entry = hooks.get(name) ?? { ms: 0, count: 0, max: 0 };
          const took = performance.now() - t0;
          entry.ms += took;
          entry.max = Math.max(entry.max, took);
          entry.count += 1;
          hooks.set(name, entry);
        };
        wrapped[WRAPPED] = true;
        sub.ref.current = wrapped;
      }
    };

    const render = gl.render.bind(gl);
    gl.render = (scene, camera) => {
      if (!hooksDone) hooksDone = performance.now();
      const t0 = performance.now();
      render(scene, camera);
      renderMs += performance.now() - t0;
      info = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
    };

    const offBefore = addEffect(() => {
      start = performance.now();
      renderMs = 0;
      hooksDone = 0;
      wrapSubscribers();
    });
    const offAfter = addAfterEffect(() => {
      const end = performance.now();
      if (lastStart) {
        samples.push({
          gap: start - lastStart,
          cpu: end - start,
          frame: (hooksDone || end) - start,
          render: renderMs,
        });
        if (samples.length > 3000) samples.shift();
      }
      lastStart = start;
    });

    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(round(entry.duration));
      });
      observer.observe({ type: "longtask", buffered: false });
    } catch {
      observer = null;
    }
    // Long animation frames, with the scripts that made them long (Chromium).
    const slowFrames: string[] = [];
    let frameObserver: PerformanceObserver | null = null;
    try {
      frameObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as {
          duration: number;
          renderStart: number;
          startTime: number;
          styleAndLayoutStart: number;
          scripts: { invoker: string; sourceFunctionName: string; sourceURL: string; duration: number }[];
        }[]) {
          if (entry.duration < 100) continue;
          const scripts = entry.scripts
            .filter((script) => script.duration > 20)
            .map((script) => `${Math.round(script.duration)}ms ${script.invoker} ${script.sourceFunctionName}@${script.sourceURL.split("/").pop()}`)
            .join("; ");
          const layout = entry.styleAndLayoutStart ? Math.round(entry.startTime + entry.duration - entry.styleAndLayoutStart) : 0;
          slowFrames.push(`${Math.round(entry.duration)}ms layout+paint ${layout}ms :: ${scripts}`);
          if (slowFrames.length > 40) slowFrames.shift();
        }
      });
      frameObserver.observe({ type: "long-animation-frame", buffered: false });
    } catch {
      frameObserver = null;
    }

    const snapshot = (): Snapshot => {
      const pick = (key: keyof Sample) => samples.map((s) => s[key]);
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return {
        frames: samples.length,
        gapP50: round(quantile(pick("gap"), 0.5)),
        gapP95: round(quantile(pick("gap"), 0.95)),
        gapMax: round(Math.max(0, ...pick("gap"))),
        cpuP50: round(quantile(pick("cpu"), 0.5)),
        cpuP95: round(quantile(pick("cpu"), 0.95)),
        renderP50: round(quantile(pick("render"), 0.5)),
        renderP95: round(quantile(pick("render"), 0.95)),
        frameHooksP50: round(quantile(pick("frame"), 0.5)),
        cpuMax: round(Math.max(0, ...pick("cpu"))),
        renderMax: round(Math.max(0, ...pick("render"))),
        calls: info.calls,
        triangles: info.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        programs: gl.info.programs?.length ?? 0,
        heapMB: memory ? round(memory.usedJSHeapSize / 1048576) : null,
        longTasks: [...longTasks],
        slowFrames: [...slowFrames],
        hooks: [...hooks.entries()]
          .map(([name, v]) => ({ name, ms: round(v.ms), count: v.count, max: round(v.max) }))
          .sort((a, b) => b.ms - a.ms)
          .slice(0, 10),
      };
    };
    const reset = () => {
      samples.length = 0;
      longTasks.length = 0;
      slowFrames.length = 0;
      hooks.clear();
      lastStart = 0;
    };
    /** Visible triangles by mesh, biggest first (instances counted). */
    const breakdown = () => {
      const rows: { name: string; tris: number; instances: number; shadow: boolean }[] = [];
      get().scene.traverseVisible((object) => {
        const mesh = object as THREE.Mesh & { count?: number; isInstancedMesh?: boolean };
        if (!mesh.isMesh || !mesh.geometry) return;
        const g = mesh.geometry;
        const per = (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3;
        const instances = mesh.isInstancedMesh ? (mesh.count ?? 0) : 1;
        const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        const name =
          mesh.name ||
          `${mesh.isInstancedMesh ? "inst" : "mesh"}:${g.type}:${(material as { color?: THREE.Color })?.color?.getHexString?.() ?? ""}:${mesh.parent?.name ?? ""}`;
        rows.push({ name, tris: Math.round(per * instances), instances, shadow: mesh.castShadow });
      });
      return rows.sort((a, b) => b.tris - a.tris).slice(0, 40);
    };
    (window as unknown as { __morrowPerf?: unknown }).__morrowPerf = { snapshot, reset, breakdown };

    const overlay = document.createElement("pre");
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.cssText =
      "position:fixed;left:8px;bottom:8px;z-index:9999;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;" +
      "color:#e8fff9;background:rgba(0,0,0,.72);border-radius:6px;pointer-events:none;white-space:pre";
    document.body.appendChild(overlay);
    const tick = window.setInterval(() => {
      const s = snapshot();
      const recent = samples.slice(-120).map((x) => x.gap);
      overlay.textContent =
        `frame p50 ${round(quantile(recent, 0.5))} p95 ${round(quantile(recent, 0.95))} ms\n` +
        `cpu p50 ${s.cpuP50} p95 ${s.cpuP95} · render ${s.renderP50} ms\n` +
        `calls ${s.calls} · tris ${(s.triangles / 1000).toFixed(0)}k\n` +
        `geo ${s.geometries} · tex ${s.textures} · prog ${s.programs}` +
        (s.heapMB !== null ? ` · heap ${s.heapMB} MB` : "");
    }, 500);

    return () => {
      offBefore();
      offAfter();
      observer?.disconnect();
      frameObserver?.disconnect();
      window.clearInterval(tick);
      overlay.remove();
      gl.render = render;
    };
  }, [gl, get]);

  return null;
}
