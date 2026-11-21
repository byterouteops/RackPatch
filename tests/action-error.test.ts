import { describe, expect, it } from "vitest";
import { actionErrorMessage } from "@/lib/action-error";

describe("actionErrorMessage", () => {
  it("passes through ordinary error messages", () => {
    expect(actionErrorMessage(new Error("Permission denied"), "Save failed")).toBe("Permission denied");
  });

  it("replaces the production-redacted server action message with the contextual fallback", () => {
    const redacted = new Error(
      "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.",
    );
    const msg = actionErrorMessage(redacted, "Update failed");
    expect(msg.startsWith("Update failed.")).toBe(true);
    expect(msg).not.toMatch(/Server Components/);
  });

  it("uses the fallback for non-Error values and empty messages", () => {
    expect(actionErrorMessage("nope", "Upload failed")).toBe("Upload failed");
    expect(actionErrorMessage(new Error(""), "Upload failed")).toBe("Upload failed");
  });
});
