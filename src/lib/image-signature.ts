const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

function startsWith(buf: Uint8Array, bytes: number[], offset = 0) {
  return buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** True when the file's leading bytes match its declared image type (the declared MIME alone is client-controlled). */
export function matchesImageSignature(buf: Uint8Array, mimeType: string): boolean {
  switch (mimeType) {
    case "image/png":
      return startsWith(buf, PNG);
    case "image/jpeg":
      return startsWith(buf, JPEG);
    case "image/webp":
      return startsWith(buf, ascii("RIFF")) && startsWith(buf, ascii("WEBP"), 8);
    default:
      return false;
  }
}
