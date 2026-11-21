"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadFieldPhoto } from "@/app/actions/field-evidence";
import { Button, ErrorBanner, Input } from "@/components/ui";
import { actionErrorMessage } from "@/lib/action-error";

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      resolve({ base64, mimeType: file.type || "image/jpeg" });
    };
    reader.onerror = () => reject(new Error("Could not read photo"));
    reader.readAsDataURL(file);
  });
}

export function FieldPhotoCapture({
  projectId,
  linkId,
  canUpload,
}: {
  projectId: string;
  linkId: string;
  canUpload: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function onFile(file: File | null) {
    if (!file || !canUpload) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const res = await uploadFieldPhoto({
        projectId,
        linkId,
        photoBase64: base64,
        mimeType,
        note: note || null,
      });
      setDone(res.deduped ? "Already uploaded" : "Photo saved");
      setNote("");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (e) {
      setError(actionErrorMessage(e, "Upload failed"));
    } finally {
      setBusy(false);
    }
  }

  if (!canUpload) {
    return <p className="text-sm text-[var(--muted-fg)]">Photo upload requires install permission.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <ErrorBanner message={error} />}
      {done && <p className="text-sm text-[var(--success-ink)]">{done}</p>}
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Photo note (optional)"
        disabled={busy}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,capture=camera"
        capture="environment"
        aria-label="Field photo"
        disabled={busy}
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm"
      />
      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Uploading…" : "Take / choose photo"}
      </Button>
    </div>
  );
}
