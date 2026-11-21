/**
 * Static SIT inventory: every page route, API handler and exported server action,
 * with the authorization guard each one calls. Output: docs/qa/sit-inventory.json
 *   npx tsx scripts/sit-inventory.ts
 */
import fs from "node:fs";
import path from "node:path";

const APP = path.join(process.cwd(), "src", "app");
const GUARDS = [
  "requireProjectAccess",
  "getProjectAccess",
  "requireSessionUser",
  "requirePlatformAdmin",
  "requireWorkspaceRole",
  "requireWorkspaceMember",
  "assertProjectCapability",
  "authenticateApiToken",
  "requireApiToken",
  "can(",
  "listVisibleProjects",
  "getSessionUser",
  "authenticateProjectRead",
  "verifyComplianceSecret",
];

function walk(dir: string, name: string, out: string[] = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, name, out);
    else if (e.name === name) out.push(p);
  }
  return out;
}

function routeOf(file: string) {
  const rel = path.relative(APP, path.dirname(file)).split(path.sep).filter((s) => !/^\(.*\)$/.test(s));
  return "/" + rel.join("/");
}

function guardsIn(src: string) {
  return GUARDS.filter((g) => src.includes(g)).map((g) => g.replace("(", ""));
}

export function inventory() {
  const pages = walk(APP, "page.tsx")
    .map((f) => {
      const src = fs.readFileSync(f, "utf8");
      const route = routeOf(f);
      return {
        route,
        file: path.relative(process.cwd(), f).replace(/\\/g, "/"),
        params: [...route.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]),
        authenticated: route.startsWith("/app"),
        guards: guardsIn(src),
        forms: (src.match(/<form\b/g) ?? []).length,
        links: (src.match(/<Link\b|href=/g) ?? []).length,
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route));

  const apis = walk(APP, "route.ts")
    .map((f) => {
      const src = fs.readFileSync(f, "utf8");
      return {
        route: routeOf(f),
        file: path.relative(process.cwd(), f).replace(/\\/g, "/"),
        methods: [...src.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]),
        guards: guardsIn(src),
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route));

  const actionsDir = path.join(APP, "actions");
  const actions = fs
    .readdirSync(actionsDir)
    .filter((f) => f.endsWith(".ts"))
    .flatMap((f) => {
      const src = fs.readFileSync(path.join(actionsDir, f), "utf8");
      const names = [...src.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]);
      return names.map((name) => {
        const start = src.indexOf(`function ${name}`);
        const next = src.indexOf("export async function", start + 10);
        const body = src.slice(start, next === -1 ? undefined : next);
        return { file: `src/app/actions/${f}`, name, guards: guardsIn(body) };
      });
    });

  return { generatedAt: new Date().toISOString(), pages, apis, actions };
}

if (process.argv[1]?.endsWith("sit-inventory.ts")) {
  const inv = inventory();
  fs.mkdirSync("docs/qa", { recursive: true });
  fs.writeFileSync("docs/qa/sit-inventory.json", JSON.stringify(inv, null, 2) + "\n");
  const unguarded = inv.actions.filter((a) => a.guards.length === 0);
  console.log(`pages=${inv.pages.length} apis=${inv.apis.length} actions=${inv.actions.length} actionsWithoutDirectGuard=${unguarded.length}`);
  for (const a of unguarded) console.log(`  no direct guard: ${a.file} ${a.name}`);
}
