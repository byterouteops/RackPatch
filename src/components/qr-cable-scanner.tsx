"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { parseCableQr } from "@/lib/qr/parse-cable-qr";
import { queueOfflineScan } from "@/components/offline-field-sync";
import { AlertBanner, Button, ErrorBanner, Input } from "@/components/ui";

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorCtor = new (options?: { formats: string[] }) => BarcodeDetectorLike;

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

export function QrCableScanner({ projectId }: { projectId: string }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRawRef = useRef<string>("");

  const [cameraSupported, setCameraSupported] = useState(false);
  const [detectorSupported, setDetectorSupported] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  useEffect(() => {
    setCameraSupported(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
    setDetectorSupported(!!getBarcodeDetector());
    return () => stopCamera();
  }, [stopCamera]);

  const handleDecoded = useCallback(
    async (raw: string) => {
      if (!raw || raw === lastRawRef.current) return;
      lastRawRef.current = raw;
      const parsed = parseCableQr(raw, projectId);
      if (!parsed.ok) {
        setError(parsed.error);
        setHint(null);
        return;
      }
      setError(null);
      stopCamera();

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        try {
          await queueOfflineScan({
            projectId,
            qrRaw: raw,
            action: parsed.action,
          });
          setHint(`Offline — queued ${parsed.linkId}. Sync when back online.`);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not queue offline scan");
        }
        return;
      }

      setHint(`Opening ${parsed.linkId}…`);
      router.push(parsed.path);
    },
    [projectId, router, stopCamera],
  );

  async function startCamera() {
    setError(null);
    setHint(null);
    lastRawRef.current = "";
    const Detector = getBarcodeDetector();
    if (!Detector) {
      setError("This browser cannot decode QR from the camera. Paste the link below, or use Chrome/Edge on Android.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is not available in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      setScanning(true);

      const detector = new Detector({ formats: ["qr_code"] });

      const tick = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          rafRef.current = requestAnimationFrame(() => void tick());
          return;
        }
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) {
            void handleDecoded(codes[0].rawValue);
            return;
          }
        } catch {
          // keep scanning
        }
        rafRef.current = requestAnimationFrame(() => void tick());
      };
      rafRef.current = requestAnimationFrame(() => void tick());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not open the camera. Check permissions and try again.",
      );
      stopCamera();
    }
  }

  function submitManual(e: FormEvent) {
    e.preventDefault();
    void handleDecoded(manual);
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}
      {hint && (
        <AlertBanner tone="info" title="Scan accepted">
          {hint}
        </AlertBanner>
      )}

      {!detectorSupported && (
        <AlertBanner tone="warning" title="Camera decode limited">
          BarcodeDetector is not available here. Use the paste field, or open this page in a
          Chromium browser on a phone.
        </AlertBanner>
      )}

      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-black">
        <video
          ref={videoRef}
          className="aspect-[3/4] w-full object-cover sm:aspect-video"
          playsInline
          muted
          aria-label="Camera preview for QR scanning"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {!scanning ? (
          <Button
            type="button"
            size="lg"
            disabled={!cameraSupported || !detectorSupported}
            onClick={() => void startCamera()}
          >
            Start camera scan
          </Button>
        ) : (
          <Button type="button" size="lg" variant="secondary" onClick={stopCamera}>
            Stop camera
          </Button>
        )}
      </div>

      <form onSubmit={submitManual} className="space-y-2 border-t border-[var(--border)] pt-4">
        <p className="text-sm font-medium text-[var(--foreground)]">Or paste a cable QR link</p>
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder={`/app/projects/${projectId}/cables/…`}
          aria-label="Cable QR URL"
        />
        <Button type="submit" variant="secondary">
          Open cable
        </Button>
      </form>
    </div>
  );
}
