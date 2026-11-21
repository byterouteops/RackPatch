import { z } from "zod";

export const labelConfigSchema = z.object({
  showQr: z.boolean().default(true),
  showCableId: z.boolean().default(true),
  showEnds: z.boolean().default(true),
  showRack: z.boolean().default(false),
  qrSize: z.number().int().min(64).max(240).default(160),
  columns: z.number().int().min(1).max(4).default(2),
  fontScale: z.number().min(0.8).max(1.4).default(1),
});

export type LabelConfig = z.infer<typeof labelConfigSchema>;

export const DEFAULT_LABEL_CONFIG: LabelConfig = labelConfigSchema.parse({});

export function parseLabelConfig(json: string | null | undefined): LabelConfig {
  if (!json) return { ...DEFAULT_LABEL_CONFIG };
  try {
    return labelConfigSchema.parse(JSON.parse(json));
  } catch {
    return { ...DEFAULT_LABEL_CONFIG };
  }
}

export function serializeLabelConfig(config: LabelConfig): string {
  return JSON.stringify(labelConfigSchema.parse(config));
}
