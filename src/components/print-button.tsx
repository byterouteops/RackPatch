"use client";

import { Button } from "@/components/ui";

export function PrintButton() {
  return (
    <Button type="button" className="no-print" onClick={() => window.print()}>
      Print report
    </Button>
  );
}