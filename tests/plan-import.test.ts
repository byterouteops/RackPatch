import { describe, expect, it } from "vitest";
import { importPlanCsv, SAMPLE_CSV } from "@/lib/csv/plan-import";
import { readFileSync } from "fs";
import { join } from "path";

describe("plan CSV import", () => {
  it("parses sample and demo CSV", () => {
    const sample = importPlanCsv(SAMPLE_CSV);
    expect(sample.errors).toHaveLength(0);
    expect(sample.rows[0].cableId).toBe("C-001");

    const demo = importPlanCsv(
      readFileSync(join(__dirname, "../fixtures/demo-cables.csv"), "utf8"),
    );
    expect(demo.errors).toHaveLength(0);
    expect(demo.rows.length).toBe(9);
  });

  it("rejects duplicate cable IDs with line numbers", () => {
    const csv = `cable_id,a_rack,a_device,a_port,z_rack,z_device,z_port
C-1,R1,A,1,R1,B,1
C-1,R1,C,1,R1,D,1
`;
    const result = importPlanCsv(csv);
    expect(result.errors.some((e) => e.message.includes("Duplicate"))).toBe(true);
  });

  it("rejects port conflicts and identical endpoints", () => {
    const conflict = importPlanCsv(`cable_id,a_rack,a_device,a_port,z_rack,z_device,z_port
C-1,R1,Leaf-01,Eth1/1,R1,GPU-01,NIC1
C-2,R1,Leaf-01,Ethernet1/1,R1,GPU-02,NIC1
`);
    expect(conflict.errors.some((e) => e.message.includes("Port conflict"))).toBe(true);

    const same = importPlanCsv(`cable_id,a_rack,a_device,a_port,z_rack,z_device,z_port
C-1,R1,Leaf-01,Eth1/1,R1,Leaf-01,Ethernet1/1
`);
    expect(same.errors.some((e) => e.message.includes("identical"))).toBe(true);
  });

  it("handles quoted fields and embedded commas", () => {
    const csv = `cable_id,a_rack,a_device,a_port,z_rack,z_device,z_port,notes
"C-1","R1","GPU-01","NIC 1","R1","Leaf-01","Eth1/1","Backend, fabric"
`;
    const result = importPlanCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].notes).toBe("Backend, fabric");
  });
});
