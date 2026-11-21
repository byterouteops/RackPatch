"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acknowledgeException } from "@/app/actions/verify";
import { Button, Input } from "@/components/ui";

export function ExceptionAckForm({
  projectId,
  findingId,
}: {
  projectId: string;
  findingId: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <form
      className="mt-3 flex flex-col gap-2 sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        try {
          await acknowledgeException({ projectId, findingId, note });
          setNote("");
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
    >
      <Input
        required
        placeholder="Acknowledgement note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="flex-1"
      />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        Acknowledge
      </Button>
    </form>
  );
}