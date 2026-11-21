import { describe, expect, it } from "vitest";
import { checkOutboundUrl, isBlockedIp } from "@/lib/net/ssrf";

const ok = (u: string, allowPrivate = false) => checkOutboundUrl(u, { allowPrivate }).ok;

describe("checkOutboundUrl", () => {
  it("allows public https hosts", () => {
    expect(ok("https://netbox.example.com")).toBe(true);
    expect(ok("https://netbox.example.com:8443/sub/path")).toBe(true);
    expect(ok("https://8.8.8.8/")).toBe(true);
    expect(ok("https://[2606:4700:4700::1111]/")).toBe(true);
  });

  it("rejects non-https and malformed input", () => {
    expect(ok("http://netbox.example.com")).toBe(false);
    expect(ok("ftp://netbox.example.com")).toBe(false);
    expect(ok("file:///etc/passwd")).toBe(false);
    expect(ok("netbox.example.com")).toBe(false);
    expect(ok("")).toBe(false);
    expect(ok("https://")).toBe(false);
  });

  it("rejects embedded credentials and fragments", () => {
    expect(ok("https://user:pass@netbox.example.com")).toBe(false);
    expect(ok("https://user@netbox.example.com")).toBe(false);
    expect(ok("https://netbox.example.com/#x")).toBe(false);
  });

  it("blocks localhost and internal hostnames", () => {
    for (const u of [
      "https://localhost",
      "https://LOCALHOST:8443",
      "https://foo.localhost",
      "https://printer.local",
      "https://metadata.google.internal",
      "https://db.internal",
      "https://intranet",
      "https://kubernetes.default.svc",
      "https://localhost.",
    ]) {
      expect(ok(u), u).toBe(false);
    }
  });

  it("blocks loopback, RFC1918, link-local and metadata IPs", () => {
    for (const u of [
      "https://127.0.0.1",
      "https://127.1.2.3",
      "https://0.0.0.0",
      "https://10.0.0.5",
      "https://172.16.0.1",
      "https://172.31.255.255",
      "https://192.168.1.1",
      "https://169.254.169.254/latest/meta-data",
      "https://100.100.100.200",
      "https://[::1]",
      "https://[::]",
      "https://[fd00:ec2::254]",
      "https://[fe80::1]",
      "https://[::ffff:127.0.0.1]",
      "https://[::ffff:10.0.0.1]",
      "https://[::ffff:a9fe:a9fe]",
    ]) {
      expect(ok(u), u).toBe(false);
    }
  });

  it("canonicalises obfuscated IPv4 forms before checking", () => {
    for (const u of [
      "https://2130706433", // decimal 127.0.0.1
      "https://0x7f.0.0.1",
      "https://0177.0.0.1",
      "https://127.1",
      "https://2852039166", // 169.254.169.254
    ]) {
      expect(ok(u), u).toBe(false);
    }
  });

  it("does not over-block neighbouring public ranges", () => {
    expect(ok("https://172.15.0.1")).toBe(true);
    expect(ok("https://172.32.0.1")).toBe(true);
    expect(ok("https://100.63.0.1")).toBe(true);
    expect(ok("https://100.128.0.1")).toBe(true);
    expect(ok("https://11.0.0.1")).toBe(true);
  });

  it("allowPrivate permits RFC1918/CGNAT but never loopback, link-local or metadata", () => {
    expect(ok("https://10.0.0.5", true)).toBe(true);
    expect(ok("https://172.20.1.1", true)).toBe(true);
    expect(ok("https://192.168.1.1", true)).toBe(true);
    expect(ok("https://[fd12:3456::1]", true)).toBe(true);
    expect(ok("https://127.0.0.1", true)).toBe(false);
    expect(ok("https://169.254.169.254", true)).toBe(false);
    expect(ok("https://[fe80::1]", true)).toBe(false);
    expect(ok("https://localhost", true)).toBe(false);
    expect(ok("https://metadata.google.internal", true)).toBe(false);
  });
});

describe("isBlockedIp", () => {
  it("blocks multicast, reserved and unparseable values", () => {
    expect(isBlockedIp("224.0.0.1")).toBe(true);
    expect(isBlockedIp("255.255.255.255")).toBe(true);
    expect(isBlockedIp("240.0.0.1")).toBe(true);
    expect(isBlockedIp("ff02::1")).toBe(true);
    expect(isBlockedIp("not-an-ip")).toBe(true);
  });

  it("checks addresses embedded in NAT64 and 6to4", () => {
    expect(isBlockedIp("64:ff9b::7f00:1")).toBe(true);
    expect(isBlockedIp("2002:7f00:0001::1")).toBe(true);
    expect(isBlockedIp("2002:0808:0808::1")).toBe(false);
  });

  it("allows ordinary public addresses", () => {
    expect(isBlockedIp("1.1.1.1")).toBe(false);
    expect(isBlockedIp("93.184.216.34")).toBe(false);
    expect(isBlockedIp("2606:4700:4700::1111")).toBe(false);
  });
});
