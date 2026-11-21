/**
 * Writes the synthetic AI/HPC demo plan fixtures (valid, duplicate cable ID, port conflict).
 * Usage: npx tsx scripts/gen-ai-hpc-fixtures.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildTopology, planCsv } from "../src/lib/demo/ai-hpc/topology";

export function fixtureFiles() {
  const cables = buildTopology().cables;
  const dupCable = { ...cables[5], cableId: cables[4].cableId };
  const conflict = { ...cables[7], cableId: "CBL-FE-9999", z: { ...cables[7].z, port: cables[6].z.port, device: cables[6].z.device, rack: cables[6].z.rack } };
  return {
    "pod-a-plan.csv": planCsv(cables),
    "pod-a-duplicate-cable-id.csv": planCsv([...cables.slice(0, 5), dupCable, ...cables.slice(6, 12)]),
    "pod-a-port-conflict.csv": planCsv([...cables.slice(0, 7), conflict, ...cables.slice(8, 12)]),
  };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/gen-ai-hpc-fixtures.ts")) {
  const dir = join(process.cwd(), "fixtures", "demos", "ai-hpc");
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(fixtureFiles())) {
    writeFileSync(join(dir, name), text);
    console.log(`wrote fixtures/demos/ai-hpc/${name}`);
  }
}
