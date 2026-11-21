"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

export function PrintButton({ label = "Print report" }: { label?: string }) {
  return (
    <Button type="button" size="sm" className="no-print" onClick={() => window.print()}>
      <Printer className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Button>
  );
}
