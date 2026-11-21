/**
 * Synthetic multi-vendor neighbor evidence for the AI/HPC demo (DEMO / SYNTHETIC — never live).
 *
 * Evidence is derived from the *actual* wiring of a snapshot: the planned cable matrix with the
 * snapshot's faults applied. A device's neighbor table lists a remote only when the remote
 * transmits and the local side is collectable (directional). Passive panels, carrier demarcs,
 * serial console cables and devices without a supported parser get no fabricated observations.
 */
import { buildTopology, findCable, type CableSpec, type DeviceSpec, type OsProfile, type Topology } from "@/lib/demo/ai-hpc/topology";
import { normalizePort } from "@/lib/csv/normalize";

export const SNAPSHOTS = ["BASELINE", "FAULT_INJECTED", "CORRECTED"] as const;
export type Snapshot = (typeof SNAPSHOTS)[number];

export const SNAPSHOT_META: Record<Snapshot, { label: string; capture: string; explain: string }> = {
  BASELINE: { label: "Baseline", capture: "2026-11-18T09:00:00Z", explain: "Installed exactly as planned (expected clean state)." },
  FAULT_INJECTED: { label: "Fault injected", capture: "2026-11-20T14:30:00Z", explain: "Field discrepancies injected: swaps, wrong device/port, missing and stale evidence." },
  CORRECTED: { label: "Corrected", capture: "2026-11-21T11:15:00Z", explain: "Discrepancies re-patched and evidence re-collected." },
};

const SYNTHETIC_BANNER = "SYNTHETIC DEMO - not a live collection";

type Wire = { a: { device: string; port: string }; z: { device: string; port: string }; cableId: string | null };

export type FaultExpectation = {
  id: number;
  title: string;
  cableIds: string[];
  /** Expected stored finding type per cable in FAULT_INJECTED. */
  expected: Record<string, string>;
  /** Expected finding type per cable in CORRECTED (and BASELINE). */
  corrected: Record<string, string>;
  explain: string;
};

/** Cable lookups for the scenario fault set (stable across runs). */
export function faultCables(t: Topology = buildTopology()) {
  return {
    feSwapA: findCable(t, "GPU-08A", "ens1f0np0"),
    feSwapB: findCable(t, "GPU-08B", "ens1f0np0"),
    beSwapA: findCable(t, "GPU-09A", "ens5np0"),
    beSwapB: findCable(t, "GPU-09A", "ens6np0"),
    missingUplink: findCable(t, "FE-LEAF-03", "Ethernet1/49"),
    wrongDevice: findCable(t, "CTRL-02", "ens1f1"),
    wrongPort: findCable(t, "GPU-10B", "ens8np0"),
    oneWay: findCable(t, "GPU-10A", "ens1f1np1"),
    linkDown: findCable(t, "GPU-10B", "ens1f1np1"),
    dupA: findCable(t, "CTRL-03", "ens1f0"),
    dupB: findCable(t, "CPU-03", "ens1f0"),
    dupC: findCable(t, "CTRL-03", "ens1f1"),
    dupD: findCable(t, "CPU-03", "ens1f1"),
    correct: findCable(t, "GPU-08A", "ens1f1np1"),
    fwHa: findCable(t, "FW-01", "ethernet1/16"),
    fwRouter: findCable(t, "FW-01", "ethernet1/1"),
    consoleEth: findCable(t, "CON-SRV1", "eth0"),
  };
}

export const STALE_DEVICE = "RTR-02";
export const DUP_HOSTS = ["CTRL-03", "CPU-03"];
export const PARSER_ERROR_DEVICE = "OOB-SW2";

function actualWiring(t: Topology, snapshot: Snapshot): Wire[] {
  const wires: Wire[] = t.cables
    .filter((c) => c.fabric !== "PATCH" && c.media !== "serial")
    .map((c) => ({ a: { device: c.a.device, port: c.a.port }, z: { device: c.z.device, port: c.z.port }, cableId: c.cableId }));
  if (snapshot !== "FAULT_INJECTED") return wires;
  const f = faultCables(t);
  const byId = new Map(wires.map((w) => [w.cableId, w]));
  // 02 FE swap at the leaf: the two GPU NIC0 cables are crossed.
  const a = byId.get(f.feSwapA.cableId)!;
  const b = byId.get(f.feSwapB.cableId)!;
  [a.z, b.z] = [b.z, a.z];
  // 03 BE swap on one GPU: NIC0 and NIC1 crossed (right devices, wrong ports).
  const c = byId.get(f.beSwapA.cableId)!;
  const d = byId.get(f.beSwapB.cableId)!;
  [c.z, d.z] = [d.z, c.z];
  // 05 wrong destination device: the leaf port is patched to an unplanned spare host.
  byId.get(f.wrongDevice.cableId)!.z = { device: "SPARE-07", port: "eth0" };
  // 06 wrong remote interface: GPU NIC lands on a free leaf port instead of the planned one.
  const wp = byId.get(f.wrongPort.cableId)!;
  wp.a = { device: wp.a.device, port: "swp16" };
  // 11 link down: cable not seated.
  return wires.filter((w) => w.cableId !== f.linkDown.cableId);
}

type Obs = { localPort: string; remoteName: string; remotePort: string; remoteMac: string; remoteDescr: string; caps: string };

function macFor(device: string, port: string) {
  let h = 2166136261;
  for (const ch of `${device}|${port}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const b = [(h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255].map((x) => x.toString(16).padStart(2, "0"));
  return `0c:42:a1:${b[1]}:${b[2]}:${b[3]}`;
}

function advertised(dev: DeviceSpec | undefined, deviceName: string, port: string): { name: string; port: string; descr: string; caps: string } {
  if (!dev) return { name: deviceName.toLowerCase(), port, descr: "Linux (unplanned host)", caps: "S" };
  if (dev.os === "linux-lldpd") {
    if (port === "bmc0") return { name: `${dev.name.toLowerCase()}-bmc`, port: "dedicated", descr: "BMC (Redfish)", caps: "S" };
    if (dev.role === "storage" && port.startsWith("ens1")) return { name: dev.name.toLowerCase(), port: macFor(dev.name, port), descr: "Linux storage node", caps: "S" };
    return { name: dev.name.toLowerCase(), port, descr: "Linux lldpd", caps: "S" };
  }
  if (dev.os === "iosxe") return { name: dev.name, port: port.replace(/^GigabitEthernet/, "Gi").replace(/^TenGigabitEthernet/, "Te"), descr: "Cisco IOS XE (fictional profile)", caps: "B,R" };
  const descr = dev.os === "nxos" ? "Cisco NX-OS (fictional profile)" : dev.os === "eos" ? "Arista EOS (fictional profile)" : dev.os === "cumulus" ? "Cumulus Linux (fictional profile)" : dev.os === "junos" ? "Juniper Junos (fictional profile)" : "NGFW OS (fictional profile)";
  return { name: dev.name, port, descr, caps: dev.role === "firewall" || dev.role === "router" ? "R" : "B,R" };
}

/** Synthetic neighbor tables per collectable device for a snapshot. */
export function neighborTables(snapshot: Snapshot, t: Topology = buildTopology()): Map<string, Obs[]> {
  const devices = new Map(t.devices.map((d) => [d.name, d]));
  const f = faultCables(t);
  const tables = new Map<string, Obs[]>();
  const collectable = (d: DeviceSpec | undefined, port: string) =>
    !!d && d.discovery.collectable && d.discovery.ports?.[normalizePort(port)]?.collectable !== false;
  const transmits = (d: DeviceSpec | undefined, port: string) =>
    !d ? true : d.discovery.transmits && d.discovery.ports?.[normalizePort(port)]?.transmits !== false;

  for (const w of actualWiring(t, snapshot)) {
    for (const [local, remote] of [[w.a, w.z], [w.z, w.a]] as const) {
      const ld = devices.get(local.device);
      const rd = devices.get(remote.device);
      if (!collectable(ld, local.port) || !transmits(rd, remote.port)) continue;
      if (snapshot === "FAULT_INJECTED") {
        // 04 missing spine uplink: physically up, LLDP not received in either direction.
        if (w.cableId === f.missingUplink.cableId) continue;
        // 07 one-way advertisement: the GPU's lldpd does not transmit on its second FE NIC.
        if (w.cableId === f.oneWay.cableId && local.device !== "GPU-10A") continue;
      }
      const adv = advertised(rd, remote.device, remote.port);
      const dupHost = snapshot === "FAULT_INJECTED" && DUP_HOSTS.includes(remote.device) && remote.port !== "bmc0";
      const list = tables.get(local.device) ?? [];
      list.push({
        localPort: local.port,
        // 10 duplicate identity: two hosts cloned from one image still advertise the template hostname.
        remoteName: dupHost ? "node-template" : adv.name,
        remotePort: adv.port,
        remoteMac: macFor(remote.device, remote.port),
        remoteDescr: adv.descr,
        caps: adv.caps,
      });
      tables.set(local.device, list);
    }
  }
  for (const list of tables.values()) list.sort((x, y) => x.localPort.localeCompare(y.localPort, undefined, { numeric: true }));
  return tables;
}

const shortNx = (p: string) => p.replace(/^Ethernet/, "Eth");
const shortEos = (p: string) => p.replace(/^Ethernet/, "Et");
const pad = (s: string, n: number) => (s.length >= n ? `${s} ` : s.padEnd(n));

function header(device: string, os: OsProfile, command: string, snapshot: Snapshot) {
  const c = os === "junos" ? "#" : os === "linux-lldpd" || os === "cumulus" ? "#" : "!";
  return `${c} ${SYNTHETIC_BANNER} | ${device} | ${command} | snapshot ${snapshot} | captured ${SNAPSHOT_META[snapshot].capture}\n`;
}

function nxosDetail(obs: Obs[]) {
  const out = ["Capability codes:", "  (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device", "  (W) WLAN Access Point, (P) Repeater, (S) Station, (O) Other", ""];
  for (const o of obs) {
    out.push(`Chassis id: ${o.remoteMac}`, `Port id: ${o.remotePort}`, `Local Port id: ${shortNx(o.localPort)}`, "Port Description: - not advertised -", `System Name: ${o.remoteName}`, `System Description: ${o.remoteDescr}`, "Time remaining: 112 seconds", `System Capabilities: ${o.caps}`, `Enabled Capabilities: ${o.caps}`, "-------------------------------------------------------");
  }
  out.push(`Total entries displayed: ${obs.length}`);
  return out.join("\n");
}
function nxosSummary(obs: Obs[]) {
  return [
    "Capability codes:",
    "  (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device",
    "  (W) WLAN Access Point, (P) Repeater, (S) Station, (O) Other",
    `${pad("Device ID", 21)}${pad("Local Intf", 16)}${pad("Hold-time", 11)}${pad("Capability", 12)}Port ID`,
    ...obs.map((o) => `${pad(o.remoteName.slice(0, 20), 21)}${pad(shortNx(o.localPort), 16)}${pad("120", 11)}${pad(o.caps.replace(/,/g, ""), 12)}${o.remotePort}`),
    "",
    `Total entries displayed: ${obs.length}`,
  ].join("\n");
}
function cdpDetail(obs: Obs[], local: (p: string) => string) {
  const out: string[] = [];
  for (const o of obs) {
    out.push("-------------------------", `Device ID: ${o.remoteName}`, "Entry address(es):", "  IP address: 192.0.2.1", `Platform: ${o.remoteDescr},  Capabilities: Router Switch`, `Interface: ${local(o.localPort)},  Port ID (outgoing port): ${o.remotePort}`, "Holdtime : 150 sec", "", "advertisement version: 2", "Duplex: full", "");
  }
  out.push("-------------------------");
  return out.join("\n");
}
function cdpSummary(obs: Obs[]) {
  return [
    "Capability Codes: R - Router, T - Trans-Bridge, B - Source-Route-Bridge",
    "                  S - Switch, H - Host, I - IGMP, r - Repeater",
    "",
    `${pad("Device-ID", 20)}${pad("Local Intrfce", 15)}${pad("Hldtme", 8)}${pad("Capability", 12)}${pad("Platform", 22)}Port ID`,
    ...obs.map((o) => `${pad(o.remoteName, 20)}${pad(shortNx(o.localPort), 15)}${pad("150", 8)}${pad("R S", 12)}${pad(o.remoteDescr.slice(0, 20), 22)}${o.remotePort}`),
    "",
    `Total entries displayed: ${obs.length}`,
  ].join("\n");
}
function eosDetail(obs: Obs[]) {
  return obs
    .map((o) => [`Interface ${o.localPort} detected 1 LLDP neighbors:`, "", `  Neighbor System Name: ${o.remoteName}`, `  Neighbor Chassis ID: ${o.remoteMac}`, `  Neighbor Port ID: ${o.remotePort}`, `  Neighbor System Description: ${o.remoteDescr}`, `  Neighbor System Capabilities: ${o.caps}`, ""].join("\n"))
    .join("\n");
}
function eosSummary(obs: Obs[]) {
  return [
    "Last table change time   : 0:12:03 ago",
    `Number of table inserts  : ${obs.length}`,
    "Number of table deletes  : 0",
    "Number of table drops    : 0",
    "Number of table age-outs : 0",
    "",
    `${pad("Port", 11)}${pad("Neighbor Device ID", 25)}${pad("Neighbor Port ID", 23)}TTL`,
    `${"-".repeat(10)} ${"-".repeat(24)} ${"-".repeat(22)} ---`,
    ...obs.map((o) => `${pad(shortEos(o.localPort), 11)}${pad(o.remoteName, 25)}${pad(o.remotePort, 23)}120`),
  ].join("\n");
}
function junosDetail(obs: Obs[]) {
  return obs
    .map((o, i) => ["LLDP Neighbor Information:", `Local Interface : ${o.localPort}`, "Parent Interface: -", `Local Port ID: ${500 + i}`, "Age: 14", "Chassis ID Type: MAC address", `Chassis ID: ${o.remoteMac}`, "Port ID Type: Interface name", `Port ID: ${o.remotePort}`, `System Name: ${o.remoteName}`, `System Description: ${o.remoteDescr}`, ""].join("\n"))
    .join("\n");
}
function junosSummary(obs: Obs[]) {
  return [
    `${pad("Local Interface", 19)}${pad("Parent Interface", 20)}${pad("Chassis Id", 20)}${pad("Port info", 19)}System Name`,
    ...obs.map((o) => `${pad(o.localPort, 19)}${pad("-", 20)}${pad(o.remoteMac, 20)}${pad(o.remotePort, 19)}${o.remoteName}`),
  ].join("\n");
}
function iosDetail(obs: Obs[]) {
  const out = ["------------------------------------------------"];
  for (const o of obs) {
    out.push(`Local Intf: ${o.localPort.replace(/^GigabitEthernet/, "Gi").replace(/^TenGigabitEthernet/, "Te")}`, `Chassis id: ${o.remoteMac}`, `Port id: ${o.remotePort}`, "Port Description: - not advertised -", `System Name: ${o.remoteName}`, `System Description: ${o.remoteDescr}`, "Time remaining: 108 seconds", `System Capabilities: ${o.caps}`, `Enabled Capabilities: ${o.caps}`, "------------------------------------------------");
  }
  out.push(`Total entries displayed: ${obs.length}`);
  return out.join("\n");
}
function iosSummary(obs: Obs[]) {
  return [
    `${pad("Device ID", 20)}${pad("Local Intf", 15)}${pad("Hold-time", 11)}${pad("Capability", 16)}Port ID`,
    ...obs.map((o) => `${pad(o.remoteName.slice(0, 19), 20)}${pad(o.localPort.replace(/^GigabitEthernet/, "Gi").replace(/^TenGigabitEthernet/, "Te"), 15)}${pad("120", 11)}${pad(o.caps, 16)}${o.remotePort}`),
    "",
    `Total entries displayed: ${obs.length}`,
  ].join("\n");
}
function lldpdKeyvalue(obs: Obs[]) {
  return obs
    .flatMap((o, i) => {
      const portKey = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(o.remotePort) ? "port.mac" : "port.ifname";
      return [`lldp.${o.localPort}.via=LLDP`, `lldp.${o.localPort}.rid=${i + 1}`, `lldp.${o.localPort}.age=0 day, 00:12:03`, `lldp.${o.localPort}.chassis.mac=${o.remoteMac}`, `lldp.${o.localPort}.chassis.name=${o.remoteName}`, `lldp.${o.localPort}.chassis.descr=${o.remoteDescr}`, `lldp.${o.localPort}.${portKey}=${o.remotePort}`, `lldp.${o.localPort}.ttl=120`];
    })
    .join("\n");
}
function lldpdHuman(obs: Obs[]) {
  const bar = "-".repeat(79);
  return [
    bar,
    "LLDP neighbors:",
    bar,
    ...obs.flatMap((o, i) => [
      `Interface:    ${o.localPort}, via: LLDP, RID: ${i + 1}, Time: 0 day, 00:12:03`,
      "  Chassis:",
      `    ChassisID:    mac ${o.remoteMac}`,
      `    SysName:      ${o.remoteName}`,
      `    SysDescr:     ${o.remoteDescr}`,
      "  Port:",
      `    PortID:       ${/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(o.remotePort) ? "mac" : "ifname"} ${o.remotePort}`,
      "    TTL:          120",
      bar,
    ]),
  ].join("\n");
}

function interfaceStatus(dev: DeviceSpec, snapshot: Snapshot, t: Topology) {
  const f = faultCables(t);
  const wires = actualWiring(t, snapshot);
  const connected = new Map<string, string | null>();
  for (const w of wires) {
    for (const ep of [w.a, w.z]) {
      if (ep.device !== dev.name) continue;
      const plan = t.cables.find((c) => c.cableId === w.cableId);
      connected.set(ep.port, plan?.speed ?? null);
    }
  }
  const eos = dev.os === "eos";
  const rows = dev.ports
    .filter((p) => /^Ethernet/.test(p.name))
    .map((p) => {
      const speed = connected.get(p.name);
      const up = connected.has(p.name) && !(snapshot === "FAULT_INJECTED" && p.name === f.linkDown.a.port && dev.name === f.linkDown.a.device);
      const name = eos ? shortEos(p.name) : shortNx(p.name);
      const status = up ? "connected" : eos ? "notconnect" : "notconnec";
      const spd = up ? speed ?? p.speed ?? "auto" : "auto";
      return `${pad(name, 14)}${pad("--", 19)}${pad(status, 13)}${pad("routed", 10)}${pad(up ? "full" : "auto", 8)}${pad(spd, 8)}${up ? "QSFP-DD" : "--"}`;
    });
  return [
    "-".repeat(80),
    `${pad("Port", 14)}${pad("Name", 19)}${pad("Status", 13)}${pad("Vlan", 10)}${pad("Duplex", 8)}${pad("Speed", 8)}Type`,
    "-".repeat(80),
    ...rows,
  ].join("\n");
}

export type EvidenceFile = {
  snapshot: Snapshot;
  device: string;
  os: OsProfile;
  command: string;
  /** Parser id used for import; null = display only (summary views, unsupported). */
  formatId: string | null;
  kind: "NEIGHBOR" | "INTERFACE_STATE" | "DISPLAY";
  /** True for the single neighbor capture per device imported into verification. */
  importForVerification: boolean;
  captureTime: string;
  text: string;
};

const STALE_CAPTURE = "2026-11-09T08:00:00Z";

/** Every synthetic CLI file for a snapshot, in deterministic order. */
export function evidenceFiles(snapshot: Snapshot, t: Topology = buildTopology()): EvidenceFile[] {
  const tables = neighborTables(snapshot, t);
  const files: EvidenceFile[] = [];
  for (const dev of t.devices) {
    if (!dev.discovery.collectable) continue;
    const obs = tables.get(dev.name) ?? [];
    const capture = snapshot === "FAULT_INJECTED" && dev.name === STALE_DEVICE ? STALE_CAPTURE : SNAPSHOT_META[snapshot].capture;
    const push = (command: string, formatId: string | null, kind: EvidenceFile["kind"], body: string, importForVerification = false) =>
      files.push({ snapshot, device: dev.name, os: dev.os, command, formatId, kind, importForVerification, captureTime: capture, text: header(dev.name, dev.os, command, snapshot) + body + "\n" });

    switch (dev.os) {
      case "nxos": {
        const cisco = obs.filter((o) => /NX-OS|IOS/.test(o.remoteDescr));
        push("show lldp neighbors", null, "DISPLAY", nxosSummary(obs));
        push("show lldp neighbors detail", "cisco-nxos-lldp", "NEIGHBOR", nxosDetail(obs), true);
        push("show cdp neighbors", null, "DISPLAY", cdpSummary(cisco));
        push("show cdp neighbors detail", "cisco-cdp", "NEIGHBOR", cdpDetail(cisco, (p) => p));
        push("show interface status", "interface-status", "INTERFACE_STATE", interfaceStatus(dev, snapshot, t), true);
        break;
      }
      case "eos":
        push("show lldp neighbors", null, "DISPLAY", eosSummary(obs));
        push("show lldp neighbors detail", "arista-eos-lldp", "NEIGHBOR", eosDetail(obs), true);
        push("show interface status", "interface-status", "INTERFACE_STATE", interfaceStatus(dev, snapshot, t), true);
        break;
      case "cumulus":
        push("lldpctl", null, "DISPLAY", lldpdHuman(obs));
        push("lldpcli show neighbors -f keyvalue", "lldpd-keyvalue", "NEIGHBOR", lldpdKeyvalue(obs), true);
        break;
      case "junos":
        push("show lldp neighbors", null, "DISPLAY", junosSummary(obs));
        push("show lldp neighbors detail", "juniper-junos-lldp", "NEIGHBOR", junosDetail(obs), true);
        break;
      case "iosxe": {
        const broken = snapshot === "FAULT_INJECTED" && dev.name === PARSER_ERROR_DEVICE;
        push("show lldp neighbors", null, "DISPLAY", iosSummary(obs));
        push(
          "show lldp neighbors detail",
          "cisco-ios-lldp",
          "NEIGHBOR",
          broken ? "% Invalid input detected at '^' marker.\n\nOOB-SW2#show lldp neighbours detial\n                           ^" : iosDetail(obs),
          true,
        );
        push("show cdp neighbors detail", "cisco-cdp", "NEIGHBOR", cdpDetail(obs.filter((o) => /NX-OS|IOS/.test(o.remoteDescr)), (p) => p));
        break;
      }
      case "linux-lldpd":
        push("lldpcli show neighbors", null, "DISPLAY", lldpdHuman(obs));
        push("lldpcli show neighbors -f keyvalue", "lldpd-keyvalue", "NEIGHBOR", lldpdKeyvalue(obs), true);
        break;
      default:
        break;
    }
  }
  return files;
}

/** Device + port aliases the demo needs (explicit mapping rules, never inferred). */
export function demoAliases(t: Topology = buildTopology()) {
  const deviceAliases: Array<{ alias: string; deviceName: string }> = [];
  const portAliases: Array<{ deviceName: string; alias: string; portLabel: string }> = [];
  for (const d of t.devices) {
    if (d.ports.some((p) => p.name === "bmc0")) {
      deviceAliases.push({ alias: `${d.name.toLowerCase()}-bmc`, deviceName: d.name });
      portAliases.push({ deviceName: d.name, alias: "dedicated", portLabel: "bmc0" });
    }
    if (d.role === "storage") {
      for (const p of ["ens1f0", "ens1f1"]) portAliases.push({ deviceName: d.name, alias: macFor(d.name, p), portLabel: p });
    }
  }
  return { deviceAliases, portAliases };
}

/** Expected outcomes for the 12 CDP/LLDP fault scenarios (asserted by tests). */
export function faultExpectations(t: Topology = buildTopology()): FaultExpectation[] {
  const f = faultCables(t);
  const ok = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, "EXACT_MATCH"]));
  const staleCables = t.cables.filter((c) => c.media !== "serial" && (c.a.device === STALE_DEVICE || c.z.device === STALE_DEVICE) && c.a.device !== "ISP-B-DEMARC").map((c) => c.cableId);
  return [
    { id: 1, title: "Correct front-end leaf-to-GPU connection", cableIds: [f.correct.cableId], expected: ok([f.correct.cableId]), corrected: ok([f.correct.cableId]), explain: "Both ends advertise and receive; observations agree with the plan." },
    { id: 2, title: "Swapped front-end cables", cableIds: [f.feSwapA.cableId, f.feSwapB.cableId], expected: { [f.feSwapA.cableId]: "WRONG_NEIGHBOR", [f.feSwapB.cableId]: "WRONG_NEIGHBOR" }, corrected: ok([f.feSwapA.cableId, f.feSwapB.cableId]), explain: "FE-LEAF-01 sees the other GPU on each port; each finding names its swap partner." },
    { id: 3, title: "Swapped back-end GPU cables", cableIds: [f.beSwapA.cableId, f.beSwapB.cableId], expected: { [f.beSwapA.cableId]: "WRONG_PORT", [f.beSwapB.cableId]: "WRONG_PORT" }, corrected: ok([f.beSwapA.cableId, f.beSwapB.cableId]), explain: "GPU-09A NIC0/NIC1 crossed between the rail-A leafs: each leaf sees the right host on the wrong NIC (right device, wrong port); the swap partner is named." },
    { id: 4, title: "Missing leaf-to-spine neighbor", cableIds: [f.missingUplink.cableId], expected: { [f.missingUplink.cableId]: "MISSING_NEIGHBOR" }, corrected: ok([f.missingUplink.cableId]), explain: "Interface is up but neither side lists the other in LLDP (e.g. LLDP disabled on the port)." },
    { id: 5, title: "Wrong remote device", cableIds: [f.wrongDevice.cableId], expected: { [f.wrongDevice.cableId]: "WRONG_NEIGHBOR" }, corrected: ok([f.wrongDevice.cableId]), explain: "Leaf port reports an unplanned host (spare-07) instead of CTRL-02." },
    { id: 6, title: "Wrong remote interface", cableIds: [f.wrongPort.cableId], expected: { [f.wrongPort.cableId]: "WRONG_PORT" }, corrected: ok([f.wrongPort.cableId]), explain: "GPU-10B reports BE-LEAF-04 swp16; the plan expects swp6." },
    { id: 7, title: "Missing LLDP advertisement (one direction)", cableIds: [f.oneWay.cableId], expected: { [f.oneWay.cableId]: "EXACT_MATCH" }, corrected: ok([f.oneWay.cableId]), explain: "The host does not transmit on that NIC; the host's own table still proves the link, so it verifies with 'Z side observed only'." },
    { id: 8, title: "Unsupported discovery protocol", cableIds: [f.fwHa.cableId, f.consoleEth.cableId], expected: { [f.fwHa.cableId]: "UNOBSERVABLE", [f.consoleEth.cableId]: "UNOBSERVABLE" }, corrected: { [f.fwHa.cableId]: "UNOBSERVABLE", [f.consoleEth.cableId]: "UNOBSERVABLE" }, explain: "Firewall OS has no parser and the console server does not run LLDP: never marked verified, physical check required." },
    { id: 9, title: "Stale observation", cableIds: staleCables, expected: Object.fromEntries(staleCables.map((id) => [id, "STALE_EVIDENCE"])), corrected: ok(staleCables), explain: `${STALE_DEVICE} evidence is 11 days older than the snapshot (policy limit 7 days).` },
    (() => {
      const ids = [f.dupA.cableId, f.dupB.cableId, f.dupC.cableId, f.dupD.cableId];
      return { id: 10, title: "Duplicate or ambiguous device identity", cableIds: ids, expected: Object.fromEntries(ids.map((id) => [id, "AMBIGUOUS_IDENTITY"])), corrected: ok(ids), explain: "CTRL-03 and CPU-03 were cloned from one image and both advertise hostname 'node-template' with identical port IDs." };
    })(),
    { id: 11, title: "Link down with no neighbor", cableIds: [f.linkDown.cableId], expected: { [f.linkDown.cableId]: "LINK_DOWN" }, corrected: ok([f.linkDown.cableId]), explain: "`show interface status` reports notconnec; no neighbor in either table." },
    { id: 12, title: "Corrected cabling after remediation", cableIds: [f.feSwapA.cableId, f.beSwapA.cableId, f.wrongPort.cableId], expected: { [f.feSwapA.cableId]: "WRONG_NEIGHBOR", [f.beSwapA.cableId]: "WRONG_PORT", [f.wrongPort.cableId]: "WRONG_PORT" }, corrected: ok([f.feSwapA.cableId, f.beSwapA.cableId, f.wrongPort.cableId]), explain: "After re-patching and re-collection the CORRECTED snapshot returns the faulted links to MATCH." },
  ];
}

export function isSyntheticCable(c: CableSpec) {
  return c.cableId.startsWith("CBL-");
}
