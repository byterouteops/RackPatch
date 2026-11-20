import { describe, expect, it } from "vitest";
import { normalizeDevice, normalizePort, endpointKey } from "@/lib/csv/normalize";

describe("normalizePort", () => {
  it("aliases Eth1/17 to Ethernet1/17 for matching", () => {
    expect(normalizePort("Eth1/17")).toBe(normalizePort("Ethernet1/17"));
    expect(normalizePort("eth1/17")).toBe("ethernet1/17");
  });

  it("keeps Ethernet17, Ethernet1/17, and Ethernet1/17/1 distinct", () => {
    const a = normalizePort("Ethernet17");
    const b = normalizePort("Ethernet1/17");
    const c = normalizePort("Ethernet1/17/1");
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("preserves case only in display — keys are lowercase", () => {
    expect(normalizePort("Ethernet1/17")).toBe("ethernet1/17");
  });
});

describe("normalizeDevice", () => {
  it("does not merge similar hostnames", () => {
    expect(normalizeDevice("Leaf-01")).not.toBe(normalizeDevice("Leaf-02"));
    expect(normalizeDevice("GPU-07")).not.toBe(normalizeDevice("GPU-07a"));
  });
});

describe("endpointKey", () => {
  it("is orientation-insensitive", () => {
    const a = endpointKey("leaf-02", "ethernet1/1", "gpu-05", "nic1");
    const b = endpointKey("gpu-05", "nic1", "leaf-02", "ethernet1/1");
    expect(a).toBe(b);
  });
});
