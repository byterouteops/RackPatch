import { createHash } from "crypto";
import { Client, type ConnectConfig } from "ssh2";
import { decryptSecret } from "@/lib/crypto/secrets";
import { getCollectionProfile } from "@/lib/collection/commands";

export type SshCollectInput = {
  host: string;
  port: number;
  username: string;
  secretCiphertext: string;
  authKind: string;
  profileId: string;
  /** Expected host key SHA-256 hex; if null, return fingerprint for pinning */
  hostKeyFingerprint: string | null;
  acceptHostKey?: boolean;
  timeoutMs?: number;
};

export type SshCollectResult =
  | {
      ok: true;
      output: string;
      command: string;
      format: string;
      hostKeyFingerprint: string;
    }
  | {
      ok: false;
      error: string;
      hostKeyFingerprint?: string;
      needsHostKeyAccept?: boolean;
    };

function fingerprintFromKey(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Run a single allowlisted show command over SSH.
 * Host key must match stored fingerprint unless acceptHostKey is set on first connect.
 */
export function runAllowlistedSshCollect(input: SshCollectInput): Promise<SshCollectResult> {
  const profile = getCollectionProfile(input.profileId);
  if (!profile) {
    return Promise.resolve({ ok: false, error: "Unknown collection profile" });
  }

  let secret: string;
  try {
    secret = decryptSecret(input.secretCiphertext);
  } catch (e) {
    return Promise.resolve({
      ok: false,
      error: e instanceof Error ? e.message : "Could not decrypt credential",
    });
  }

  const timeoutMs = input.timeoutMs ?? 45_000;

  return new Promise((resolve) => {
    const conn = new Client();
    let settled = false;
    let seenFingerprint: string | null = null;

    const finish = (result: SshCollectResult) => {
      if (settled) return;
      settled = true;
      try {
        conn.end();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, error: "SSH collection timed out" });
    }, timeoutMs);

    conn.on("ready", () => {
      conn.exec(profile.command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          finish({ ok: false, error: err.message });
          return;
        }
        let stdout = "";
        let stderr = "";
        stream.on("data", (d: Buffer) => {
          stdout += d.toString("utf8");
        });
        stream.stderr.on("data", (d: Buffer) => {
          stderr += d.toString("utf8");
        });
        stream.on("close", () => {
          clearTimeout(timer);
          const output = stdout.trim() || stderr.trim();
          if (!output) {
            finish({ ok: false, error: "Empty command output" });
            return;
          }
          finish({
            ok: true,
            output,
            command: profile.command,
            format: profile.format,
            hostKeyFingerprint: seenFingerprint || input.hostKeyFingerprint || "",
          });
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timer);
      finish({ ok: false, error: err.message });
    });

    const config: ConnectConfig = {
      host: input.host,
      port: input.port,
      username: input.username,
      readyTimeout: timeoutMs,
      // Host key verification via handshake hook below
      hostVerifier: (key: Buffer) => {
        const fp = fingerprintFromKey(key);
        seenFingerprint = fp;
        if (input.hostKeyFingerprint) {
          return fp === input.hostKeyFingerprint;
        }
        if (input.acceptHostKey) {
          return true;
        }
        // Reject until operator accepts fingerprint
        setImmediate(() => {
          clearTimeout(timer);
          finish({
            ok: false,
            error: "Host key not pinned. Re-run with acceptHostKey after verifying fingerprint.",
            hostKeyFingerprint: fp,
            needsHostKeyAccept: true,
          });
        });
        return false;
      },
    };

    if (input.authKind === "privateKey") {
      config.privateKey = secret;
    } else {
      config.password = secret;
    }

    try {
      conn.connect(config);
    } catch (e) {
      clearTimeout(timer);
      finish({
        ok: false,
        error: e instanceof Error ? e.message : "SSH connect failed",
      });
    }
  });
}
