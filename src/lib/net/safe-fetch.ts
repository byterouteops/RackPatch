import { request as httpsRequest } from "https";
import { lookup as dnsLookup } from "dns";
import type { LookupAddress } from "dns";
import {
  allowPrivateIntegrationNetworks,
  checkOutboundUrl,
  isBlockedIp,
} from "@/lib/net/ssrf";

export type SafeHttpsInput = {
  url: string;
  method?: "GET" | "POST" | "PATCH";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
};

export type SafeHttpsResult = { status: number; body: string };

/**
 * HTTPS request with SSRF controls:
 * - static URL check, then every resolved address is re-validated at connect time (no DNS rebinding gap)
 * - redirects are never followed
 * - hard timeout and response size cap
 */
export function safeHttpsRequest(input: SafeHttpsInput): Promise<SafeHttpsResult> {
  const allowPrivate = allowPrivateIntegrationNetworks();
  const check = checkOutboundUrl(input.url, { allowPrivate });
  if (!check.ok) return Promise.reject(new Error(check.reason));

  const timeoutMs = input.timeoutMs ?? 10_000;
  const maxBytes = input.maxBytes ?? 5 * 1024 * 1024;
  const url = check.url;

  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const req = httpsRequest(
      {
        protocol: "https:",
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: input.method ?? "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "RackPatch-CE",
          ...(input.body ? { "Content-Length": Buffer.byteLength(input.body) } : {}),
          ...input.headers,
        },
        lookup: (hostname, options, callback) => {
          dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
            if (err) return (callback as (e: Error | null) => void)(err);
            const list = addresses as LookupAddress[];
            const bad = list.find((a) => isBlockedIp(a.address, { allowPrivate }));
            if (bad || list.length === 0) {
              return (callback as (e: Error | null) => void)(
                new Error("Host resolves to a blocked address range"),
              );
            }
            const first = list[0];
            if ((options as { all?: boolean }).all) {
              return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
            }
            return (callback as unknown as (e: null, a: string, f: number) => void)(
              null,
              first.address,
              first.family,
            );
          });
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return done(() => reject(new Error(`Redirect (${status}) refused`)));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy();
            return done(() => reject(new Error("Response too large")));
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          done(() => resolve({ status, body: Buffer.concat(chunks).toString("utf8") })),
        );
        res.on("error", (e) => done(() => reject(e)));
      },
    );

    const timer = setTimeout(() => {
      req.destroy();
      done(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    req.on("error", (e) => done(() => reject(e)));
    if (input.body) req.write(input.body);
    req.end();
  });
}
