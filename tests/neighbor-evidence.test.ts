import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseNeighborEvidence } from "@/lib/lldp/parse-neighbor-evidence";
import { parseNxosLldpNeighborsDetail } from "@/lib/lldp/nxos-neighbors-detail";

const fx = (name: string) => readFileSync(join(__dirname, "../fixtures", name), "utf8");

describe("multi-vendor neighbor evidence", () => {
  it("auto-detects NX-OS LLDP demo fixture", () => {
    const parsed = parseNeighborEvidence(fx("demo-lldp-leaf02.txt"));
    expect(parsed.failed).toBe(false);
    expect(parsed.format).toBe("cisco-nxos-lldp");
    expect(parsed.observations.length).toBeGreaterThanOrEqual(2);
  });

  it("parses Cisco IOS-XE LLDP", () => {
    const parsed = parseNeighborEvidence(fx("sample-ios-xe-lldp.txt"));
    expect(parsed.failed).toBe(false);
    expect(parsed.format).toBe("cisco-ios-lldp");
    expect(parsed.observations.map((o) => o.localInterface)).toContain("Gi1/0/1");
    expect(parsed.observations.find((o) => o.localInterface === "Gi1/0/1")?.remoteSystemName).toBe(
      "Core-SW-01",
    );
  });

  it("parses Cisco CDP", () => {
    const parsed = parseNeighborEvidence(fx("sample-cisco-cdp.txt"));
    expect(parsed.failed).toBe(false);
    expect(parsed.format).toBe("cisco-cdp");
    expect(parsed.observations).toHaveLength(2);
    expect(parsed.observations[0].remoteSystemName).toBe("Core-SW-01");
    expect(parsed.observations[0].remotePortId).toMatch(/GigabitEthernet0\/1/i);
  });

  it("parses Arista EOS LLDP", () => {
    const parsed = parseNeighborEvidence(fx("sample-arista-eos-lldp.txt"));
    expect(parsed.failed).toBe(false);
    expect(parsed.format).toBe("arista-eos-lldp");
    expect(parsed.observations.map((o) => o.localInterface)).toEqual([
      "Ethernet1",
      "Ethernet2",
    ]);
    expect(parsed.observations[0].remoteSystemName).toBe("Leaf-B");
  });

  it("parses Juniper Junos LLDP", () => {
    const parsed = parseNeighborEvidence(fx("sample-junos-lldp.txt"));
    expect(parsed.failed).toBe(false);
    expect(parsed.format).toBe("juniper-junos-lldp");
    expect(parsed.observations).toHaveLength(2);
    expect(parsed.observations[0].localInterface).toContain("ge-0/0/0");
    expect(parsed.observations[0].remoteSystemName).toBe("Core-SW-01");
    expect(parsed.observations[0].remotePortId).toBe("ge-0/0/1.0");
    expect(parsed.observations[1].remotePortId).toBe("eth0");
  });

  it("honors explicit format hint", () => {
    const text = fx("sample-cisco-cdp.txt");
    const asCdp = parseNeighborEvidence(text, "cisco-cdp");
    expect(asCdp.failed).toBe(false);
    expect(asCdp.format).toBe("cisco-cdp");
  });

  it("fails visibly on junk", () => {
    const parsed = parseNeighborEvidence("hello world not evidence");
    expect(parsed.failed).toBe(true);
    expect(parsed.error).toMatch(/Unrecognized|Supported/i);
  });

  it("keeps NX-OS-only parser working for demos", () => {
    const parsed = parseNxosLldpNeighborsDetail(fx("demo-lldp-leaf01.txt"));
    expect(parsed.failed).toBe(false);
  });
});
