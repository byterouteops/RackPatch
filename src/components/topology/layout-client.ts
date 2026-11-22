"use client";

import ELK from "elkjs/lib/elk-api";
import { computeLayout, type ElkLike, type LayoutInput, type TopoLayout } from "@/lib/topology/layout";

const memory = new Map<string, TopoLayout>();
const STORE = "rp.topo.layout.";
const INDEX = "rp.topo.layout.index";
const MAX_STORED = 8;

let workerElk: ElkLike | null = null;
let fallbackElk: Promise<ElkLike> | null = null;
let workerFailure: Promise<never> | null = null;

/** ELK API on the page, layout algorithm in a Web Worker. elk-api ignores worker errors, so surface them here. */
function getWorkerElk(): { elk: ElkLike; failed: Promise<never> } {
  if (!workerElk) {
    let fail: (e: Error) => void = () => {};
    workerFailure = new Promise<never>((_, reject) => (fail = reject));
    workerFailure.catch(() => {});
    workerElk = new ELK({
      workerFactory: () => {
        const w = new Worker(new URL("../../lib/topology/layout.worker.ts", import.meta.url));
        w.addEventListener("error", (e) => fail(new Error(e.message || "layout worker failed")));
        return w;
      },
    });
  }
  return { elk: workerElk, failed: workerFailure! };
}

/** Same algorithm on the main thread, only if the worker cannot start. */
function getFallbackElk(): Promise<ElkLike> {
  if (!fallbackElk) fallbackElk = import("elkjs/lib/elk.bundled.js").then((m) => new m.default());
  return fallbackElk;
}

function readStored(key: string): TopoLayout | null {
  try {
    const raw = localStorage.getItem(STORE + key);
    return raw ? (JSON.parse(raw) as TopoLayout) : null;
  } catch {
    return null;
  }
}

function store(layout: TopoLayout) {
  try {
    const index = (JSON.parse(localStorage.getItem(INDEX) ?? "[]") as string[]).filter((k) => k !== layout.key);
    index.unshift(layout.key);
    for (const old of index.splice(MAX_STORED)) localStorage.removeItem(STORE + old);
    localStorage.setItem(STORE + layout.key, JSON.stringify(layout));
    localStorage.setItem(INDEX, JSON.stringify(index));
  } catch {
    // Storage full or disabled: the in-memory cache still applies.
  }
}

/** Cached layout for an unchanged topology structure (statuses never invalidate it). */
export function cachedLayout(key: string): TopoLayout | null {
  const hit = memory.get(key) ?? readStored(key);
  if (hit) memory.set(key, hit);
  return hit;
}

export function forgetLayout(key: string) {
  memory.delete(key);
  try {
    localStorage.removeItem(STORE + key);
  } catch {}
}

/** Runs ELK in a Web Worker so large topologies never block the page. */
export async function requestLayout(input: LayoutInput): Promise<TopoLayout> {
  let layout: TopoLayout;
  try {
    const { elk, failed } = getWorkerElk();
    layout = await Promise.race([computeLayout(elk, input), failed]);
  } catch (err) {
    console.warn("Topology layout worker unavailable, using main thread", err);
    layout = await computeLayout(await getFallbackElk(), input);
  }
  memory.set(layout.key, layout);
  store(layout);
  return layout;
}
