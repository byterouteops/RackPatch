/**
 * Northstar DC1 · AI/HPC Pod A — deterministic synthetic topology (DEMO / SYNTHETIC DATA).
 *
 * Single source of truth for the demo: racks, devices (rack-unit placement, interface inventory,
 * discovery profile) and the cable matrix. Everything (CSV fixture, seed, evidence generator,
 * docs) is derived from here. All hardware models are fictional profiles.
 */
import { normalizeDevice, normalizePort } from "@/lib/csv/normalize";

export const DEMO = {
  organization: "Northstar Infrastructure Labs",
  workspaceSlug: "northstar-ai-demo",
  workspaceName: "Northstar Infrastructure Labs (Demo)",
  site: "Northstar DC1",
  siteSlug: "northstar-dc1",
  location: "Fictional technology campus",
  projectName: "AI/HPC Fabric Commissioning \u2014 Pod A",
  projectCode: "NS-DC1-AI-POD-A",
  customer: "Northstar Infrastructure Labs (synthetic)",
  emailDomain: "demo.northstar.local",
} as const;

export type FabricCode = "FE" | "BE" | "OOB" | "EXT" | "STORAGE" | "PATCH";
export type OsProfile = "nxos" | "eos" | "cumulus" | "junos" | "iosxe" | "linux-lldpd" | "ngfw" | "console" | "passive";
export type Role =
  | "fe-spine"
  | "fe-leaf"
  | "border-leaf"
  | "be-spine"
  | "be-leaf"
  | "gpu"
  | "cpu"
  | "controller"
  | "storage"
  | "oob"
  | "console"
  | "jump"
  | "nms"
  | "router"
  | "firewall"
  | "panel"
  | "demarc";

export type PortSpec = { name: string; speed: string | null };

export type Discovery = {
  transmits: boolean;
  collectable: boolean;
  reason?: string;
  ports?: Record<string, { transmits?: boolean; collectable?: boolean; reason?: string }>;
};

export type DeviceSpec = {
  name: string;
  rack: string;
  rackUnit: number;
  uHeight: number;
  role: Role;
  vendor: string;
  model: string;
  os: OsProfile;
  ports: PortSpec[];
  discovery: Discovery;
  design: Record<string, unknown>;
};

export type RackSpec = { name: string; purpose: string; heightU: number; position: number; row: string; fabricTag: string };

export type Endpoint = { rack: string; device: string; port: string };

export type CableSpec = {
  cableId: string;
  fabric: FabricCode;
  a: Endpoint;
  z: Endpoint;
  cableType: string;
  speed: string | null;
  lengthM: number;
  connector: string;
  media: string;
  rail: string | null;
  color: string;
  purpose: string;
};

export type PanelMapping = { panel: string; portIndex: number; cableId: string; side: "A" | "Z" };
export type CircuitSpec = { name: string; mediaType: string; a: { panel: string; portIndex: number }; z: { panel: string; portIndex: number } | null; note: string };

export const RACKS: RackSpec[] = [
  { name: "R01", purpose: "External Edge & Security", fabricTag: "External / FW" },
  { name: "R02", purpose: "Front-End Spine", fabricTag: "FE Fabric" },
  { name: "R03", purpose: "Back-End Spine", fabricTag: "BE Fabric" },
  { name: "R04", purpose: "Front-End Leaf A", fabricTag: "FE Fabric" },
  { name: "R05", purpose: "Front-End Leaf B", fabricTag: "FE Fabric" },
  { name: "R06", purpose: "Back-End Leaf Rail A", fabricTag: "BE Fabric" },
  { name: "R07", purpose: "Back-End Leaf Rail B", fabricTag: "BE Fabric" },
  { name: "R08", purpose: "GPU Rack 01", fabricTag: "GPU" },
  { name: "R09", purpose: "GPU Rack 02", fabricTag: "GPU" },
  { name: "R10", purpose: "GPU Rack 03", fabricTag: "GPU" },
  { name: "R11", purpose: "CPU & Control Plane", fabricTag: "CPU / Ctrl" },
  { name: "R12", purpose: "Storage", fabricTag: "Storage" },
  { name: "R13", purpose: "OOB Management", fabricTag: "OOB" },
  { name: "R14", purpose: "Fiber Patching & Spares", fabricTag: "Patching" },
].map((r, i) => ({ ...r, heightU: 42, position: i + 1, row: "DC1 Row A" }));

export const FABRIC_DESIGN: Record<string, Record<string, string>> = {
  FE: {
    name: "Front-End Fabric",
    technology: "Ethernet EVPN/VXLAN (design)",
    underlay: "eBGP IPv4 unnumbered (design)",
    vlanRange: "100\u2013199 (design)",
    vniRange: "10100\u201310199 (design)",
    uplinkSpeed: "400G",
    hostSpeed: "100G GPU / 25G CPU / 100G storage",
  },
  BE: {
    name: "Back-End Fabric",
    technology: "Ethernet RoCEv2 RDMA (design)",
    rails: "Rail A (R06) / Rail B (R07)",
    pfc: "Priority 3 lossless (design assumption \u2014 not verified by LLDP)",
    ecn: "ECN marking enabled (design assumption \u2014 not verified by LLDP)",
    addressing: "Separate /31 point-to-point space from FE (design)",
    uplinkSpeed: "800G",
    hostSpeed: "400G",
  },
  OOB: {
    name: "Out-of-Band Management",
    technology: "Dedicated L2 management network (design)",
    subnet: "10.100.0.0/24 (design, RFC 1918)",
    services: "DHCP, DNS, NTP, Syslog on NMS-01 (design)",
  },
  EXT: {
    name: "External Connectivity",
    technology: "Dual carrier handoff \u2192 edge routers \u2192 HA firewalls \u2192 border leafs (design)",
    note: "BGP sessions, firewall policy and reachability are NOT verified by RackPatch (physical cabling only).",
  },
};

const range = (n: number, start = 1) => Array.from({ length: n }, (_, i) => i + start);

const SW = { transmits: true, collectable: true } as const;
const HOST: Discovery = {
  transmits: true,
  collectable: true,
  ports: { bmc0: { collectable: false, reason: "BMC transmits LLDP but its neighbor table is not collectable" } },
};

function nxosPorts(n: number, speedFor: (i: number) => string) {
  return [...range(n).map((i) => ({ name: `Ethernet1/${i}`, speed: speedFor(i) })), { name: "mgmt0", speed: "1G" }, { name: "console", speed: null }];
}
function eosPorts(n: number, speedFor: (i: number) => string) {
  return [...range(n).map((i) => ({ name: `Ethernet${i}/1`, speed: speedFor(i) })), { name: "Management1", speed: "1G" }, { name: "console", speed: null }];
}
function cumulusPorts(n: number, speedFor: (i: number) => string) {
  return [...range(n).map((i) => ({ name: `swp${i}`, speed: speedFor(i) })), { name: "eth0", speed: "1G" }, { name: "console", speed: null }];
}

function buildDevices(): DeviceSpec[] {
  const d: DeviceSpec[] = [];
  const add = (x: Omit<DeviceSpec, "design"> & { design?: Record<string, unknown> }) => d.push({ design: {}, ...x });

  // R01 — edge & security
  for (const [i, name] of ["ISP-A-DEMARC", "ISP-B-DEMARC"].entries()) {
    add({
      name, rack: "R01", rackUnit: 42 - i, uHeight: 1, role: "demarc", vendor: "Carrier", model: "Carrier handoff (fictional)",
      os: "passive", ports: [{ name: "HANDOFF1", speed: "100G" }],
      discovery: { transmits: false, collectable: false, reason: "Carrier demarcation (not managed)" },
      design: { carrier: i === 0 ? "ISP-A (synthetic)" : "ISP-B (synthetic)" },
    });
  }
  for (const [i, name] of ["RTR-01", "RTR-02"].entries()) {
    add({
      name, rack: "R01", rackUnit: 38 - i * 2, uHeight: 2, role: "router", vendor: "Juniper-class", model: "NSJ-MX204 edge router (fictional profile)",
      os: "junos", ports: [...range(12, 0).map((n) => ({ name: `et-0/0/${n}`, speed: "100G" })), { name: "fxp0", speed: "1G" }, { name: "console", speed: null }],
      discovery: SW, design: { bgp: "eBGP to carrier (design, not verified)", power: "Dual PSU A/B (design)" },
    });
  }
  for (const [i, name] of ["FW-01", "FW-02"].entries()) {
    add({
      name, rack: "R01", rackUnit: 32 - i * 2, uHeight: 2, role: "firewall", vendor: "NGFW-class", model: "NSF-5400 next-gen firewall (fictional profile)",
      os: "ngfw", ports: [...range(16).map((n) => ({ name: `ethernet1/${n}`, speed: n <= 4 ? "100G" : "10G" })), { name: "mgmt", speed: "1G" }, { name: "console", speed: null }],
      discovery: { transmits: true, collectable: false, reason: "Firewall OS has no supported RackPatch parser (advertises LLDP only)" },
      design: { ha: i === 0 ? "Active (design)" : "Standby (design)" },
    });
  }
  for (const [i, name] of ["BL-01", "BL-02"].entries()) {
    add({
      name, rack: "R01", rackUnit: 26 - i, uHeight: 1, role: "border-leaf", vendor: "Cisco-class", model: "NSX-9364 border leaf (fictional profile)",
      os: "nxos", ports: nxosPorts(56, (p) => (p >= 49 ? "400G" : "100G")), discovery: SW, design: { evpn: "Border gateway (design)" },
    });
  }

  // R02 / R03 spines + rack MPO panels
  for (const rack of ["R02", "R03", "R04", "R05", "R06", "R07"]) {
    add({
      name: `PP-${rack}`, rack, rackUnit: 42, uHeight: 1, role: "panel", vendor: "Passive", model: "1U MPO-12 cassette panel (12 ports)",
      os: "passive", ports: range(12).map((n) => ({ name: `MPO${n}`, speed: null })),
      discovery: { transmits: false, collectable: false, reason: "Passive patch panel (no LLDP)" },
    });
  }
  for (const [i, name] of ["FE-SPINE-01", "FE-SPINE-02"].entries()) {
    add({
      name, rack: "R02", rackUnit: 38 - i * 3, uHeight: 2, role: "fe-spine", vendor: "Cisco-class", model: "NSX-9336 400G spine (fictional profile)",
      os: "nxos", ports: nxosPorts(36, () => "400G"), discovery: SW,
    });
  }
  for (const [i, name] of ["BE-SPINE-01", "BE-SPINE-02"].entries()) {
    add({
      name, rack: "R03", rackUnit: 36 - i * 5, uHeight: 4, role: "be-spine", vendor: "Arista-class", model: "NSA-7800 800G spine (fictional profile)",
      os: "eos", ports: eosPorts(32, () => "800G"), discovery: SW,
    });
  }

  // R04 / R05 FE leafs (two redundant pairs)
  for (const [rack, names] of [["R04", ["FE-LEAF-01", "FE-LEAF-02"]], ["R05", ["FE-LEAF-03", "FE-LEAF-04"]]] as const) {
    names.forEach((name, i) =>
      add({
        name, rack, rackUnit: 40 - i, uHeight: 1, role: "fe-leaf", vendor: "Cisco-class", model: "NSX-9364 100G/400G leaf (fictional profile)",
        os: "nxos", ports: nxosPorts(56, (p) => (p >= 49 ? "400G" : "100G")), discovery: SW,
        design: { pair: rack === "R04" ? "Pair A (vPC, design)" : "Pair B (vPC, design)" },
      }),
    );
  }

  // R06 / R07 BE leafs, rail-aligned. Rail A = Arista EOS, Rail B = NVIDIA Spectrum running Cumulus Linux.
  for (const [i, name] of ["BE-LEAF-01", "BE-LEAF-02"].entries()) {
    add({
      name, rack: "R06", rackUnit: 40 - i * 3, uHeight: 2, role: "be-leaf", vendor: "Arista-class", model: "NSA-7060 400G leaf (fictional profile)",
      os: "eos", ports: eosPorts(56, (p) => (p >= 49 ? "800G" : "400G")), discovery: SW, design: { rail: "A", railIndex: i },
    });
  }
  for (const [i, name] of ["BE-LEAF-03", "BE-LEAF-04"].entries()) {
    add({
      name, rack: "R07", rackUnit: 40 - i * 3, uHeight: 2, role: "be-leaf", vendor: "NVIDIA-class", model: "Spectrum-class SN-5600 leaf, Cumulus Linux (fictional profile)",
      os: "cumulus", ports: cumulusPorts(56, (p) => (p >= 49 ? "800G" : "400G")), discovery: SW, design: { rail: "B", railIndex: i + 2 },
    });
  }

  // R08–R10 GPU servers
  for (const rack of ["R08", "R09", "R10"]) {
    const n = rack.slice(1);
    for (const [i, suffix] of ["A", "B"].entries()) {
      add({
        name: `GPU-${n}${suffix}`, rack, rackUnit: i === 0 ? 27 : 17, uHeight: 8, role: "gpu", vendor: "HGX-class",
        model: "HGX/H200-class 8-GPU server (fictional profile)", os: "linux-lldpd",
        ports: [
          { name: "ens1f0np0", speed: "100G" },
          { name: "ens1f1np1", speed: "100G" },
          ...range(4, 5).map((k) => ({ name: `ens${k}np0`, speed: "400G" })),
          { name: "bmc0", speed: "1G" },
        ],
        discovery: HOST,
        design: { gpus: "8\u00d7 H200-class (fictional)", feNics: "2\u00d7 100G (bonded, design)", beNics: "4\u00d7 400G RoCEv2 (rail-aligned)", power: "Dual PDU A/B (design)", formFactor: "8U" },
      });
    }
  }

  // R11 CPU & control plane
  for (const [i, name] of ["CTRL-01", "CTRL-02", "CTRL-03"].entries()) {
    add({
      name, rack: "R11", rackUnit: 40 - i, uHeight: 1, role: "controller", vendor: "x86-class", model: "1U control-plane server (fictional profile)",
      os: "linux-lldpd", ports: [{ name: "ens1f0", speed: "25G" }, { name: "ens1f1", speed: "25G" }, { name: "bmc0", speed: "1G" }],
      discovery: HOST, design: { services: "Kubernetes control plane (design)" },
    });
  }
  for (const [i, name] of ["CPU-01", "CPU-02", "CPU-03"].entries()) {
    add({
      name, rack: "R11", rackUnit: 34 - i * 2, uHeight: 2, role: "cpu", vendor: "x86-class", model: "2U CPU compute node (fictional profile)",
      os: "linux-lldpd", ports: [{ name: "ens1f0", speed: "25G" }, { name: "ens1f1", speed: "25G" }, { name: "bmc0", speed: "1G" }],
      discovery: HOST, design: { services: "Inference serving / Kubernetes workers (design)" },
    });
  }

  // R12 storage
  for (const [i, name] of ["STO-01", "STO-02", "STO-03"].entries()) {
    add({
      name, rack: "R12", rackUnit: 30 - i * 6, uHeight: 4, role: "storage", vendor: "x86-class", model: "4U NVMe storage node (fictional profile)",
      os: "linux-lldpd",
      ports: [{ name: "ens1f0", speed: "100G" }, { name: "ens1f1", speed: "100G" }, { name: "eno1", speed: "1G" }, { name: "bmc0", speed: "1G" }],
      discovery: HOST,
      design: { services: "Ceph (RBD/S3) + NFS export /data (design)", capacity: "Design capacity only \u2014 not measured" },
    });
  }

  // R13 OOB
  for (const [i, name] of ["OOB-SW1", "OOB-SW2"].entries()) {
    add({
      name, rack: "R13", rackUnit: 41 - i, uHeight: 1, role: "oob", vendor: "Cisco-class", model: "NSC-9300 48\u00d71G management switch (fictional profile)",
      os: "iosxe",
      ports: [...range(48).map((n) => ({ name: `GigabitEthernet1/0/${n}`, speed: "1G" })), ...range(4).map((n) => ({ name: `TenGigabitEthernet1/1/${n}`, speed: "10G" })), { name: "console", speed: null }],
      discovery: SW,
    });
  }
  add({
    name: "CON-SRV1", rack: "R13", rackUnit: 38, uHeight: 1, role: "console", vendor: "Console-class", model: "48-port serial console server (fictional profile)",
    os: "console", ports: [{ name: "eth0", speed: "1G" }, ...range(48).map((n) => ({ name: `port${n}`, speed: null }))],
    discovery: { transmits: false, collectable: false, reason: "Console server does not run LLDP" },
  });
  add({
    name: "JUMP-01", rack: "R13", rackUnit: 36, uHeight: 1, role: "jump", vendor: "x86-class", model: "1U jump host (fictional profile)",
    os: "linux-lldpd", ports: [{ name: "eth0", speed: "1G" }], discovery: { transmits: true, collectable: true },
  });
  add({
    name: "NMS-01", rack: "R13", rackUnit: 35, uHeight: 1, role: "nms", vendor: "x86-class", model: "1U monitoring host (fictional profile)",
    os: "linux-lldpd", ports: [{ name: "eth0", speed: "1G" }], discovery: { transmits: true, collectable: true },
    design: { services: "Monitoring, syslog, DHCP/DNS/NTP for OOB (design)" },
  });

  // R14 patching
  for (const [i, name] of ["PP-MPO-01", "PP-MPO-02"].entries()) {
    add({
      name, rack: "R14", rackUnit: 40 - i, uHeight: 1, role: "panel", vendor: "Passive", model: "1U MPO-12 trunk panel (12 ports)",
      os: "passive", ports: range(12).map((n) => ({ name: `MPO${n}`, speed: null })),
      discovery: { transmits: false, collectable: false, reason: "Passive patch panel (no LLDP)" },
      design: { purpose: i === 0 ? "FE trunks" : "BE trunks" },
    });
  }
  for (const [i, name] of ["PP-LC-01", "PP-LC-02"].entries()) {
    add({
      name, rack: "R14", rackUnit: 37 - i, uHeight: 1, role: "panel", vendor: "Passive", model: "1U 48-port duplex LC panel",
      os: "passive", ports: range(48).map((n) => ({ name: `LC${n}`, speed: null })),
      discovery: { transmits: false, collectable: false, reason: "Passive patch panel (no LLDP)" },
      design: { purpose: i === 0 ? "FE spine\u2013leaf cross-connects" : "BE spine\u2013leaf cross-connects" },
    });
  }
  return d;
}

const rackPos = (r: string) => Number(r.slice(1));
const lengthFor = (a: string, b: string) => (a === b ? 2 : Math.min(30, Math.ceil(3 + Math.abs(rackPos(a) - rackPos(b)) * 1.2)));

function buildCables(devices: DeviceSpec[]): CableSpec[] {
  const byName = new Map(devices.map((x) => [x.name, x]));
  const rackOf = (n: string) => byName.get(n)!.rack;
  const out: CableSpec[] = [];
  const counters: Record<string, number> = {};
  const add = (
    prefix: string,
    fabric: FabricCode,
    a: [string, string],
    z: [string, string],
    o: { cableType: string; speed: string | null; connector: string; media: string; color: string; purpose: string; rail?: string | null },
  ) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    out.push({
      cableId: `CBL-${prefix}-${String(counters[prefix]).padStart(4, "0")}`,
      fabric,
      a: { rack: rackOf(a[0]), device: a[0], port: a[1] },
      z: { rack: rackOf(z[0]), device: z[0], port: z[1] },
      lengthM: lengthFor(rackOf(a[0]), rackOf(z[0])),
      rail: o.rail ?? null,
      cableType: o.cableType,
      speed: o.speed,
      connector: o.connector,
      media: o.media,
      color: o.color,
      purpose: o.purpose,
    });
  };

  // FE spine ↔ leaf / border (2 links per leaf per spine)
  const feLeaves = ["FE-LEAF-01", "FE-LEAF-02", "FE-LEAF-03", "FE-LEAF-04", "BL-01", "BL-02"];
  for (const [s, spine] of ["FE-SPINE-01", "FE-SPINE-02"].entries()) {
    feLeaves.forEach((leaf, li) => {
      for (const k of [0, 1]) {
        add("FE", "FE", [spine, `Ethernet1/${li * 2 + k + 1}`], [leaf, `Ethernet1/${49 + s * 2 + k}`], {
          cableType: "AOC", speed: "400G", connector: "QSFP-DD", media: "AOC 400G", color: "Aqua",
          purpose: leaf.startsWith("BL") ? "FE spine \u2194 border leaf" : "FE spine \u2194 leaf",
        });
      }
    });
  }
  // FE leaf pair A ↔ GPU (NIC0 → odd leaf, NIC1 → even leaf)
  const gpus = devices.filter((x) => x.role === "gpu").map((x) => x.name);
  gpus.forEach((g, i) => {
    add("FE", "FE", ["FE-LEAF-01", `Ethernet1/${i + 1}`], [g, "ens1f0np0"], { cableType: "AOC", speed: "100G", connector: "QSFP28", media: "AOC 100G", color: "Blue", purpose: "GPU front-end (bond member 1)" });
    add("FE", "FE", ["FE-LEAF-02", `Ethernet1/${i + 1}`], [g, "ens1f1np1"], { cableType: "AOC", speed: "100G", connector: "QSFP28", media: "AOC 100G", color: "Blue", purpose: "GPU front-end (bond member 2)" });
  });
  // FE leaf pair B ↔ CPU/control + storage client access
  const cpus = devices.filter((x) => x.role === "controller" || x.role === "cpu").map((x) => x.name);
  cpus.forEach((c, i) => {
    add("FE", "FE", ["FE-LEAF-03", `Ethernet1/${i + 1}`], [c, "ens1f0"], { cableType: "AOC", speed: "25G", connector: "SFP28", media: "AOC 25G", color: "Blue", purpose: "CPU/control front-end" });
    add("FE", "FE", ["FE-LEAF-04", `Ethernet1/${i + 1}`], [c, "ens1f1"], { cableType: "AOC", speed: "25G", connector: "SFP28", media: "AOC 25G", color: "Blue", purpose: "CPU/control front-end" });
  });
  const stos = devices.filter((x) => x.role === "storage").map((x) => x.name);
  stos.forEach((s, i) => {
    add("STO", "STORAGE", ["FE-LEAF-03", `Ethernet1/${33 + i}`], [s, "ens1f0"], { cableType: "AOC", speed: "100G", connector: "QSFP28", media: "AOC 100G", color: "Cyan", purpose: "Storage data access (NFS/S3/Ceph clients via FE)" });
    add("STO", "STORAGE", ["FE-LEAF-04", `Ethernet1/${33 + i}`], [s, "ens1f1"], { cableType: "AOC", speed: "100G", connector: "QSFP28", media: "AOC 100G", color: "Cyan", purpose: "Storage data access (NFS/S3/Ceph clients via FE)" });
  });

  // BE spine ↔ leaf (2 × 800G per leaf per spine)
  const beLeaves = ["BE-LEAF-01", "BE-LEAF-02", "BE-LEAF-03", "BE-LEAF-04"];
  const leafPort = (leaf: string, n: number) => (byName.get(leaf)!.os === "cumulus" ? `swp${n}` : `Ethernet${n}/1`);
  for (const [s, spine] of ["BE-SPINE-01", "BE-SPINE-02"].entries()) {
    beLeaves.forEach((leaf, li) => {
      for (const k of [0, 1]) {
        add("BE", "BE", [spine, `Ethernet${li * 2 + k + 1}/1`], [leaf, leafPort(leaf, 49 + s * 2 + k)], {
          cableType: "AOC", speed: "800G", connector: "OSFP", media: "AOC 800G", color: "Yellow", purpose: "BE spine \u2194 leaf (RoCEv2)",
          rail: li < 2 ? "A" : "B",
        });
      }
    });
  }
  // BE leaf ↔ GPU (rail-aligned: NIC k → BE-LEAF-0(k+1))
  gpus.forEach((g, gi) => {
    beLeaves.forEach((leaf, k) => {
      add("BE", "BE", [leaf, leafPort(leaf, gi + 1)], [g, `ens${k + 5}np0`], {
        cableType: "AOC", speed: "400G", connector: "OSFP", media: "AOC 400G", color: "Yellow", purpose: `GPU RDMA NIC${k} (rail ${k < 2 ? "A" : "B"})`,
        rail: k < 2 ? "A" : "B",
      });
    });
  });

  // External: carrier handoff → routers → firewalls → border leafs
  add("EXT", "EXT", ["ISP-A-DEMARC", "HANDOFF1"], ["RTR-01", "et-0/0/0"], { cableType: "SMF", speed: "100G", connector: "LC", media: "SMF 100G-LR4", color: "Orange", purpose: "WAN handoff ISP-A" });
  add("EXT", "EXT", ["ISP-B-DEMARC", "HANDOFF1"], ["RTR-02", "et-0/0/0"], { cableType: "SMF", speed: "100G", connector: "LC", media: "SMF 100G-LR4", color: "Orange", purpose: "WAN handoff ISP-B" });
  add("EXT", "EXT", ["RTR-01", "et-0/0/10"], ["RTR-02", "et-0/0/10"], { cableType: "DAC", speed: "100G", connector: "QSFP28", media: "DAC 100G", color: "Orange", purpose: "Router interconnect (iBGP, design)" });
  for (const [fi, fw] of ["FW-01", "FW-02"].entries()) {
    for (const [ri, rtr] of ["RTR-01", "RTR-02"].entries()) {
      add("EXT", "EXT", [fw, `ethernet1/${ri + 1}`], [rtr, `et-0/0/${fi + 1}`], { cableType: "DAC", speed: "100G", connector: "QSFP28", media: "DAC 100G", color: "Orange", purpose: "Firewall \u2194 router" });
    }
    for (const [bi, bl] of ["BL-01", "BL-02"].entries()) {
      add("EXT", "EXT", [fw, `ethernet1/${bi + 3}`], [bl, `Ethernet1/${fi + 1}`], { cableType: "DAC", speed: "100G", connector: "QSFP28", media: "DAC 100G", color: "Orange", purpose: "Firewall \u2194 border leaf" });
    }
  }
  add("EXT", "EXT", ["FW-01", "ethernet1/16"], ["FW-02", "ethernet1/16"], { cableType: "DAC", speed: "10G", connector: "SFP+", media: "DAC 10G", color: "Red", purpose: "Firewall HA link" });

  // OOB management: every managed device's mgmt port, alternating between the two OOB switches
  const mgmt: Array<[string, string]> = [];
  for (const dev of devices) {
    const port =
      dev.os === "nxos" ? "mgmt0" : dev.os === "eos" ? "Management1" : dev.os === "cumulus" ? "eth0" : dev.os === "junos" ? "fxp0" : dev.os === "ngfw" ? "mgmt" : null;
    if (port) mgmt.push([dev.name, port]);
    if (dev.ports.some((p) => p.name === "bmc0")) mgmt.push([dev.name, "bmc0"]);
    if (dev.role === "storage") mgmt.push([dev.name, "eno1"]);
    if (dev.role === "console" || dev.role === "jump" || dev.role === "nms") mgmt.push([dev.name, "eth0"]);
  }
  const nextPort: Record<string, number> = { "OOB-SW1": 1, "OOB-SW2": 1 };
  mgmt.forEach(([dev, port], i) => {
    const sw = i % 2 === 0 ? "OOB-SW1" : "OOB-SW2";
    const kind = port === "bmc0" ? "BMC" : port === "eno1" ? "Storage management" : "Management";
    add("OOB", "OOB", [sw, `GigabitEthernet1/0/${nextPort[sw]++}`], [dev, port], {
      cableType: "Cat6a", speed: "1G", connector: "RJ45", media: "Cat6A", color: "Green", purpose: `${kind} (${dev})`,
    });
  });
  add("OOB", "OOB", ["OOB-SW1", "TenGigabitEthernet1/1/1"], ["OOB-SW2", "TenGigabitEthernet1/1/1"], { cableType: "DAC", speed: "10G", connector: "SFP+", media: "DAC 10G", color: "Green", purpose: "OOB inter-switch link" });

  // Serial console from the console server to every switch, router and firewall
  const consoled = devices.filter((x) => x.ports.some((p) => p.name === "console"));
  consoled.forEach((dev, i) => {
    add("CON", "OOB", ["CON-SRV1", `port${i + 1}`], [dev.name, "console"], { cableType: "Other", speed: null, connector: "RJ45 rollover", media: "serial", color: "Purple", purpose: `Serial console (${dev.name})` });
  });

  // MPO trunks from the patching rack to each fabric rack
  const trunks: Array<[string, string]> = [["PP-MPO-01", "PP-R02"], ["PP-MPO-01", "PP-R04"], ["PP-MPO-01", "PP-R05"], ["PP-MPO-02", "PP-R03"], ["PP-MPO-02", "PP-R06"], ["PP-MPO-02", "PP-R07"]];
  const trunkIdx: Record<string, number> = {};
  for (const [src, dst] of trunks) {
    trunkIdx[src] = (trunkIdx[src] ?? 0) + 1;
    add("TRK", "PATCH", [src, `MPO${trunkIdx[src]}`], [dst, "MPO1"], { cableType: "MPO", speed: null, connector: "MPO-12", media: "MPO-12 OM4 trunk", color: "Aqua", purpose: `${src.endsWith("01") ? "FE" : "BE"} fiber trunk R14 \u2192 ${byName.get(dst)!.rack}` });
  }
  return out;
}

export type Topology = {
  racks: RackSpec[];
  devices: DeviceSpec[];
  cables: CableSpec[];
  panelMappings: PanelMapping[];
  circuits: CircuitSpec[];
};

let cached: Topology | null = null;

export function buildTopology(): Topology {
  if (cached) return cached;
  const devices = buildDevices();
  const cables = buildCables(devices);

  // LC cross-connect panels in R14 carry the A ends of spine–leaf links.
  const feTrunks = cables.filter((c) => c.fabric === "FE" && c.a.device.startsWith("FE-SPINE"));
  const beTrunks = cables.filter((c) => c.fabric === "BE" && c.a.device.startsWith("BE-SPINE"));
  const panelMappings: PanelMapping[] = [
    ...feTrunks.map((c, i) => ({ panel: "PP-LC-01", portIndex: i + 1, cableId: c.cableId, side: "A" as const })),
    ...beTrunks.map((c, i) => ({ panel: "PP-LC-02", portIndex: i + 1, cableId: c.cableId, side: "A" as const })),
  ];
  const circuits: CircuitSpec[] = [
    ...feTrunks.slice(0, 4).map((c, i) => ({ name: `CIR-FE-${String(i + 1).padStart(3, "0")}`, mediaType: "OM4 duplex LC", a: { panel: "PP-LC-01", portIndex: i + 1 }, z: null, note: `${c.a.device} ${c.a.port} \u2192 ${c.z.device} ${c.z.port}` })),
    ...beTrunks.slice(0, 4).map((c, i) => ({ name: `CIR-BE-${String(i + 1).padStart(3, "0")}`, mediaType: "OM4 duplex LC", a: { panel: "PP-LC-02", portIndex: i + 1 }, z: null, note: `${c.a.device} ${c.a.port} \u2192 ${c.z.device} ${c.z.port}` })),
  ];

  cached = { racks: RACKS, devices, cables, panelMappings, circuits };
  return cached;
}

export function findCable(t: Topology, device: string, port: string): CableSpec {
  const hit = t.cables.find((c) => (c.a.device === device && c.a.port === port) || (c.z.device === device && c.z.port === port));
  if (!hit) throw new Error(`No cable at ${device} ${port}`);
  return hit;
}

export const PLAN_COLUMNS = [
  "cable_id", "fabric", "a_rack", "a_device", "a_port", "z_rack", "z_device", "z_port",
  "cable_type", "speed", "length_m", "connector", "media", "rail", "color", "notes",
] as const;

function csvCell(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function cableRow(c: CableSpec): Array<string | number | null> {
  return [c.cableId, c.fabric, c.a.rack, c.a.device, c.a.port, c.z.rack, c.z.device, c.z.port, c.cableType, c.speed, c.lengthM, c.connector, c.media, c.rail, c.color, c.purpose];
}

export function planCsv(cables: CableSpec[] = buildTopology().cables): string {
  return [PLAN_COLUMNS.join(","), ...cables.map((c) => cableRow(c).map(csvCell).join(","))].join("\n") + "\n";
}

export const norm = { device: normalizeDevice, port: normalizePort };
