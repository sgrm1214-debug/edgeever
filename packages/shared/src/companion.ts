import { z } from "zod";

export const CompanionIdSchema = z.string().uuid();
export const CompanionMemoryInputSchema = z.object({
  content: z.string().trim().min(1).max(500),
  sourceTurnId: CompanionIdSchema.optional(),
}).strict();
export const CompanionMemoryUpdateSchema = z.object({
  content: z.string().trim().min(1).max(500),
  version: z.number().int().positive(),
}).strict();
export const CompanionTurnInputSchema = z.object({
  id: CompanionIdSchema,
  threadId: CompanionIdSchema,
  message: z.string().trim().min(1).max(4000),
  useMemory: z.boolean().default(true),
  allowNotes: z.boolean().default(false),
  locale: z.enum(["zh-CN", "en-US"]).default("en-US"),
}).strict();
export type CompanionTurnInput = z.infer<typeof CompanionTurnInputSchema>;
export type CompanionMemory = {
  id: string;
  content: string;
  sourceTurnId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type CompanionSource = { id: string; title: string; revision: number };
export type CompanionTurn = {
  id: string;
  threadId: string;
  message: string;
  response: string;
  status: "running" | "completed" | "failed" | "cancelled" | "interrupted";
  sources: CompanionSource[];
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
};
export type CompanionEvent =
  | { type: "start"; id: string }
  | { type: "text-delta"; text: string }
  | { type: "done"; turn: CompanionTurn }
  | { type: "error"; code: string };

export const CompanionMemoryImportSchema = z.object({
  version: z.literal(1),
  memories: z.array(z.object({ content: z.string().trim().min(1).max(500) })).max(50),
}).strict();
