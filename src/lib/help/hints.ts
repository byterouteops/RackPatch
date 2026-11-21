/**
 * In-app guidance: one page guide per route and a hint for every form field.
 * Field hints resolve by exact key (name / id / aria-label / label text), then keyword rules,
 * then a generic hint for the control type, so no field is ever without guidance.
 */

export type PageGuide = {
  id: string;
  /** Matched against the pathname with project/workspace ids replaced by ":id". */
  pattern: RegExp;
  title: string;
  purpose: string;
  steps: string[];
  tip?: string;
};

const P = "^/app/projects/:id";

export const PAGE_GUIDES: PageGuide[] = [
  { id: "home", pattern: /^\/app$/, title: "Dashboard", purpose: "Portfolio view of every project you can access.", steps: ["Open a project card to see its commissioning status.", "Use the search box (Ctrl/Cmd+K) to jump to any cable, device or project."], tip: "Numbers come straight from cable, finding and install records\u2014nothing is estimated." },
  { id: "projects", pattern: /^\/app\/projects$/, title: "Projects", purpose: "List and filter projects across workspaces.", steps: ["Filter by phase or search by name/site.", "Create a project from the workspace you own."] },
  { id: "overview", pattern: new RegExp(`${P}$`), title: "Project overview", purpose: "Commissioning status of this project at a glance.", steps: ["Check verification progress and open exceptions first.", "Use 'Fabric readiness' and 'Handover gate' for per-fabric progress and sign-off status.", "Follow 'Recommended next steps' to unblock the field team."], tip: "Every KPI links to the records it was calculated from." },
  { id: "racks", pattern: new RegExp(`${P}/racks$`), title: "Rack elevations", purpose: "Every rack with its devices placed by rack unit.", steps: ["Pick a rack to open its front/rear elevation.", "Colour shows each device's verification status (worst finding on its cables)."] },
  { id: "rack", pattern: new RegExp(`${P}/racks/[^/]+$`), title: "Rack detail", purpose: "Front/rear elevation, devices, ports and the cables leaving this rack.", steps: ["Click a device to list its ports and connected cables.", "Use 'Group by' to see cables by fabric or destination rack.", "Open a cable to trace it end-to-end."] },
  { id: "fabric", pattern: new RegExp(`${P}/fabric$`), title: "Fabric topology", purpose: "Spine/leaf topology drawn from the published cable plan.", steps: ["Lines are planned cables; colour is their verification status.", "Pick FE or BE to see that fabric alone.", "Design attributes (EVPN, RoCEv2, PFC) are labelled 'design' and are not verified by LLDP."] },
  { id: "fabric-detail", pattern: new RegExp(`${P}/fabric/[^/]+$`), title: "Fabric detail", purpose: "One fabric's switches, uplinks, host links and rails.", steps: ["Review uplink coverage per leaf.", "Open any red/amber link to see expected vs observed evidence."] },
  { id: "trace", pattern: new RegExp(`${P}/trace$`), title: "Path trace", purpose: "Follow a device port through panels and trunks to the far end.", steps: ["Enter a device and port (or a cable ID).", "Each hop shows the cable, its verification status and evidence source."] },
  { id: "cables", pattern: new RegExp(`${P}/cables$`), title: "Cable plan", purpose: "Every planned cable in the active revision.", steps: ["Filter by fabric, rack, status or search for a cable ID/device.", "Open a cable for its endpoints, evidence, photos and history.", "Select rows to create a work order or print labels."] },
  { id: "cable", pattern: new RegExp(`${P}/cables/[^/]+$`), title: "Cable detail", purpose: "Endpoints, install state, verification evidence and history for one cable.", steps: ["Update install status as the field work happens.", "Compare expected vs observed neighbor evidence.", "Attach a photo or request physical verification."] },
  { id: "plan", pattern: new RegExp(`${P}/plan$`), title: "Import cable plan", purpose: "Upload a CSV, map its columns, validate and publish a revision.", steps: ["Upload the CSV (cable_id, a_/z_ rack/device/port are required).", "Check the suggested column mapping and fix any errors.", "Review the diff against the current revision, then publish."], tip: "Install progress carries forward when a cable's endpoints are unchanged." },
  { id: "work-orders", pattern: new RegExp(`${P}/work-orders$`), title: "Work orders", purpose: "Group cables into assignable field tasks.", steps: ["Create a work order from a cable selection.", "Assign a technician and due date.", "Track progress as cables are installed."] },
  { id: "work-order", pattern: new RegExp(`${P}/work-orders/[^/]+$`), title: "Work order", purpose: "Cables in this task and their install/verification progress.", steps: ["Mark cables installed or blocked (with a reason).", "Move the work order to Done when every cable is installed."] },
  { id: "labels", pattern: new RegExp(`${P}/labels$`), title: "Labels", purpose: "Design and print cable labels with QR codes.", steps: ["Pick or edit a template.", "Choose cables and print; every print is audited."] },
  { id: "scan", pattern: new RegExp(`${P}/scan$`), title: "Scan", purpose: "Scan a cable QR label to open it in the field (works offline).", steps: ["Allow camera access, point at the label.", "Updates made offline sync when you reconnect."], tip: "This is a responsive web app with offline capability, not a native app." },
  { id: "verify", pattern: new RegExp(`${P}/verify$`), title: "Verification results", purpose: "Expected vs observed result for every cable.", steps: ["Filter by Match, Mismatch, Needs review or Pending.", "Open a row to see which side observed what.", "Use physical verification where LLDP cannot observe a link."] },
  { id: "lldp", pattern: new RegExp(`${P}/lldp$`), title: "LLDP / CDP import", purpose: "Paste or upload neighbor output from a device.", steps: ["Choose the source device and format (or Auto-detect).", "Preview the parsed neighbors and warnings.", "Import: findings recompute immediately."], tip: "Supported: NX-OS, IOS/IOS-XE, CDP, Arista EOS, Junos, Linux/Cumulus lldpd, and 'show interface status'." },
  { id: "explorer", pattern: new RegExp(`${P}/evidence/explorer$`), title: "Evidence explorer", purpose: "Raw CLI captures, parsed neighbors and expected-vs-observed per device.", steps: ["Filter by device, fabric, vendor, snapshot and status.", "Open a capture to compare raw text, parsed rows and the plan.", "Demo projects: switch playback snapshot (synthetic, never live)."] },
  { id: "exceptions", pattern: new RegExp(`${P}/exceptions$`), title: "Exceptions", purpose: "Every mismatch and review item that blocks handover.", steps: ["Assign an owner and due date.", "Fix in the field and re-import evidence\u2014exceptions close automatically.", "Only an authorised lead may record a waiver (with a reason)."] },
  { id: "qc", pattern: new RegExp(`${P}/qc$`), title: "Independent QC", purpose: "Physical verification by someone other than the installer.", steps: ["Confirm or reject each end of the cable.", "A rejection needs a note and re-opens the cable as an exception."] },
  { id: "compliance", pattern: new RegExp(`${P}/compliance$`), title: "Compliance", purpose: "Policy checks for evidence age, coverage and open exceptions.", steps: ["Set the maximum evidence age and recipients.", "Run a check; results are stored as a compliance run."] },
  { id: "collection", pattern: new RegExp(`${P}/collection$`), title: "Collection", purpose: "Allowlisted SSH collection of neighbor tables.", steps: ["Add a credential (encrypted) and targets.", "Accept each host key, then run a collection job."], tip: "Demo playback is synthetic and is never shown as a live SSH collection." },
  { id: "evidence", pattern: new RegExp(`${P}/evidence$`), title: "Evidence", purpose: "Photos, neighbor imports and physical checks in one place.", steps: ["Filter by evidence type or search a cable.", "Open the Evidence explorer for raw CLI and parsed neighbors."] },
  { id: "handover", pattern: new RegExp(`${P}/handover$`), title: "Handover", purpose: "Freeze a snapshot and collect staged approvals.", steps: ["Create a snapshot when verification is complete.", "Approvals: Installation \u2192 Independent QC \u2192 Engineering \u2192 Owner.", "Owner approval is blocked while critical exceptions are open without a waiver."] },
  { id: "handover-snapshot", pattern: new RegExp(`${P}/handover/[^/]+$`), title: "Handover snapshot", purpose: "Frozen record of the plan, evidence and exceptions at handover time.", steps: ["Review each approval stage.", "Share a read-only link with the customer."] },
  { id: "reports", pattern: new RegExp(`${P}/reports$`), title: "Reports", purpose: "Exportable commissioning reports.", steps: ["Pick a report and export CSV/print."] },
  { id: "analytics", pattern: new RegExp(`${P}/analytics$`), title: "Analytics", purpose: "Trends for installs, findings and evidence.", steps: ["Use the charts to spot slow racks or recurring faults."] },
  { id: "inventory", pattern: new RegExp(`${P}/inventory$`), title: "Port inventory", purpose: "Devices and their ports, synced from the active plan.", steps: ["Sync ports from the plan.", "Reserve ports or record speeds manually."] },
  { id: "capacity", pattern: new RegExp(`${P}/capacity$`), title: "Capacity", purpose: "Port and cable utilisation by rack, device and fabric.", steps: ["Find racks/devices near port exhaustion.", "Compare planned vs installed by fabric."] },
  { id: "panels", pattern: new RegExp(`${P}/panels$`), title: "Patch panels", purpose: "Panels, port mappings and circuits.", steps: ["Create a panel with its port count.", "Map panel ports to cable ends; define circuits."], tip: "Passive panels never produce LLDP\u2014use physical verification." },
  { id: "spares", pattern: new RegExp(`${P}/spares$`), title: "Spares", purpose: "Spare optics/cables with an immutable stock ledger.", steps: ["Add a SKU.", "Record receipts and issues as transactions."] },
  { id: "twin", pattern: new RegExp(`${P}/twin$`), title: "Rack twin", purpose: "Simple rack-to-rack cable map.", steps: ["Pick racks to see cables between them."] },
  { id: "assistant", pattern: new RegExp(`${P}/assistant$`), title: "Assistant", purpose: "Ask questions answered only from this project's records.", steps: ["Ask e.g. 'which cables are swapped?'."] },
  { id: "api", pattern: new RegExp(`${P}/api$`), title: "API", purpose: "Project-scoped API tokens.", steps: ["Create a token with the minimum scope; it is shown once."] },
  { id: "integrations", pattern: new RegExp(`${P}/integrations$`), title: "Integrations", purpose: "NetBox, GitOps and webhooks.", steps: ["Configure an integration, run a dry-run sync, then apply."] },
  { id: "team", pattern: /^\/app\/workspaces\/:id\/team$/, title: "Team", purpose: "Invite people and set their role.", steps: ["Invite by email with a role.", "Viewer = read-only auditor; Contractor = technician with QC acknowledge only."] },
  { id: "sites", pattern: /^\/app\/workspaces\/:id\/sites$/, title: "Sites", purpose: "Physical locations for projects.", steps: ["Add a site, then select it when creating projects."] },
  { id: "search", pattern: /^\/app\/search$/, title: "Search", purpose: "Find cables, devices and projects.", steps: ["Type a cable ID, device or port."] },
  { id: "notifications", pattern: /^\/app\/notifications$/, title: "Notifications", purpose: "Assignments, approvals and compliance alerts.", steps: ["Open a notification to jump to the record."] },
  { id: "settings", pattern: /^\/app\/settings$/, title: "Settings", purpose: "Your profile and preferences.", steps: ["Update your name and notification preferences."] },
  { id: "help", pattern: /^\/app\/help$/, title: "Help center", purpose: "How RackPatch works, page by page.", steps: ["Browse the page guides below or start the demo tour."] },
  { id: "admin", pattern: /^\/app\/admin$/, title: "Admin", purpose: "Platform administration (admins only).", steps: ["Activate projects and review pilot requests."] },
];

const ID_SEGMENT = /^(c[a-z0-9]{20,}|[0-9a-f-]{24,})$/i;

/** Replace dynamic ids with ":id" so guides match any project/workspace. */
export function normalizeGuidePath(pathname: string): string {
  return pathname
    .split("/")
    .map((s, i, arr) => (ID_SEGMENT.test(s) && (arr[i - 1] === "projects" || arr[i - 1] === "workspaces") ? ":id" : s))
    .join("/")
    .replace(/\/$/, "") || "/";
}

export function guideFor(pathname: string): PageGuide | null {
  const p = normalizeGuidePath(pathname);
  return PAGE_GUIDES.find((g) => g.pattern.test(p)) ?? null;
}

/** Exact field keys (normalised: lower-case, non-alphanumerics collapsed to "_"). */
export const FIELD_HINTS: Record<string, string> = {
  cable_id: "Unique cable identifier printed on the label, e.g. CBL-FE-0001.",
  a_rack: "Rack of the A end (e.g. R04).",
  a_device: "Device name at the A end, exactly as configured (hostname).",
  a_port: "Interface at the A end, e.g. Ethernet1/1 or swp3. Short forms like Eth1/1 are normalised.",
  z_rack: "Rack of the Z end.",
  z_device: "Device name at the Z end.",
  z_port: "Interface at the Z end.",
  cable_type: "Cable type, e.g. AOC, DAC, SMF, MPO, Cat6a.",
  speed: "Planned speed, e.g. 100G, 400G, 800G. Used to flag speed mismatches from interface status.",
  length_m: "Cable length in metres (0\u201310000).",
  connector: "Connector type, e.g. QSFP-DD, OSFP, LC, RJ45.",
  media: "Media description, e.g. AOC 400G. 'serial' or 'power' marks non-Ethernet links (LLDP not applicable).",
  fabric: "Fabric: FE, BE, OOB, EXT, STORAGE or PATCH.",
  rail: "Back-end rail (A/B) for rail-aligned GPU fabrics.",
  color: "Cable/jacket colour used in the field.",
  notes: "Optional free text shown on the cable.",
  note: "Short note for the audit trail (what you saw or did).",
  reason: "Why you are doing this; stored in the audit log.",
  q: "Search by cable ID, device, port or text.",
  email: "Work email address of the person.",
  businessemail: "Work email; we only use it to reply to this request.",
  password: "Your account password.",
  name: "Display name.",
  company: "Organisation name.",
  customername: "Customer or end-user organisation (shown on handover reports).",
  site: "Physical site or data hall.",
  projectsize: "Approximate number of cables.",
  role: "Permission level. Viewer is read-only; Technician installs; Lead publishes plans and resolves exceptions.",
  status: "Current status; changing it is recorded in the audit log.",
  install: "Install status of this cable.",
  verify: "Verification result to record.",
  type: "Filter by type.",
  scope: "What this token or rule may access\u2014grant the minimum needed.",
  project: "Project this applies to.",
  projectid: "Project this applies to.",
  workspaceid: "Workspace this applies to.",
  enabled: "Turn this on or off without deleting it.",
  maxevidenceagedays: "Evidence older than this many days is flagged stale (and blocks verification while stale).",
  notifyemails: "Comma-separated emails that receive compliance alerts.",
  recomputefindings: "Recompute verification findings before each compliance check.",
  rack: "Rack name, e.g. R14.",
  rackunit: "Lowest rack unit occupied (1 = bottom).",
  portcount: "Number of ports on the panel (ports are created 1..N).",
  mediatype: "Circuit media, e.g. OM4 duplex LC.",
  panelportaid: "Panel port for the circuit's A end.",
  panelportzid: "Panel port for the circuit's Z end (optional).",
  plannedlinkid: "Cable this applies to.",
  portid: "Panel port.",
  side: "Which end of the cable (A or Z) lands on this panel port.",
};

const RULES: Array<[RegExp, string]> = [
  [/source.?device|device name|^device$/, "Device the output came from (its hostname as in the plan)."],
  [/format|parser/, "Output format. Auto-detect works for supported vendors; pick explicitly if detection fails."],
  [/evidence|lldp|cdp|paste|output|raw/, "Paste the full CLI output, e.g. 'show lldp neighbors detail'. Nothing is sent to the device."],
  [/capture/, "When the output was captured on the device (used for staleness)."],
  [/snapshot|playback/, "Synthetic demo snapshot to replay. Demo projects only; never a live collection."],
  [/assignee|assign/, "Person responsible for fixing this."],
  [/due/, "Date by which this should be resolved."],
  [/waiver|waive/, "Why this exception is accepted without a fix (min 10 characters). Only leads may waive."],
  [/serial|asset/, "Serial number printed on the cable or optic."],
  [/length/, "Measured length in metres."],
  [/sku/, "Stock keeping unit code for the spare."],
  [/quantity|qty|delta/, "Number of units (negative to issue stock)."],
  [/description/, "Short description."],
  [/title/, "Short title shown in lists."],
  [/code/, "Short unique code, e.g. WO-FE-001."],
  [/host|address/, "Management hostname or IP of the device."],
  [/user/, "Login username."],
  [/secret|key|token/, "Secret value; stored encrypted and never shown again."],
  [/url|endpoint|webhook/, "HTTPS URL that will receive events."],
  [/event/, "Which events trigger this."],
  [/profile/, "Command profile for the device OS."],
  [/time.?zone/, "Time zone for timestamps on reports."],
  [/template/, "Label template to use."],
  [/file|upload|csv/, "Choose a file from your computer."],
  [/filter|search/, "Narrow the list."],
  [/port/, "Interface name, e.g. Ethernet1/1."],
  [/cable/, "Cable ID, e.g. CBL-FE-0001."],
  [/confirm/, "Tick only after checking this end yourself."],
  [/message|question|ask/, "Ask in plain language; answers come only from this project's records."],
];

export function normalizeFieldKey(s: string): string {
  return s.toLowerCase().replace(/\*/g, "").trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** Resolve a hint from any of the field's identifying strings; falls back by control type. */
export function hintForField(keys: Array<string | null | undefined>, controlType: string): string {
  const norm = keys.filter(Boolean).map((k) => normalizeFieldKey(k!));
  for (const k of norm) {
    if (FIELD_HINTS[k]) return FIELD_HINTS[k];
    const compact = k.replace(/_/g, "");
    if (FIELD_HINTS[compact]) return FIELD_HINTS[compact];
  }
  for (const k of norm) {
    const spaced = k.replace(/_/g, " ");
    for (const [re, hint] of RULES) if (re.test(spaced)) return hint;
  }
  switch (controlType) {
    case "select":
    case "select-one":
      return "Choose one option from the list.";
    case "checkbox":
      return "Tick to enable.";
    case "radio":
      return "Choose one option.";
    case "date":
    case "datetime-local":
      return "Pick a date.";
    case "number":
      return "Enter a number.";
    case "email":
      return "Enter an email address.";
    case "file":
      return "Choose a file from your computer.";
    case "textarea":
      return "Enter text; it is saved with the record.";
    default:
      return "Enter a value. Changes are saved to the audit log when you submit.";
  }
}
