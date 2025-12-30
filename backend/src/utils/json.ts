import { z, ZodSchema } from 'zod';

/**
 * Extracts JSON from an LLM response that may contain markdown code blocks or extra text
 */
export function extractJson(text: string): string {
  // Try to find JSON in markdown code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find raw JSON object or array
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  return text.trim();
}

/**
 * Parses JSON from LLM response with robust error handling
 */
export function parseJsonSafe<T>(text: string): { data: T | null; error: string | null } {
  try {
    const jsonStr = extractJson(text);
    const parsed = JSON.parse(jsonStr) as T;
    return { data: parsed, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown parsing error';
    return { data: null, error: message };
  }
}

/**
 * Parses and validates JSON against a Zod schema
 */
export function parseAndValidate<T>(
  text: string,
  schema: ZodSchema<T>
): { data: T | null; error: string | null } {
  const { data, error } = parseJsonSafe<unknown>(text);

  if (error) {
    return { data: null, error };
  }

  const result = schema.safeParse(data);

  if (!result.success) {
    return {
      data: null,
      error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  }

  return { data: result.data, error: null };
}

// Schemas for LLM responses
export const ClassificationSchema = z.object({
  classification: z.enum(['inquiry', 'complaint', 'support', 'billing', 'spam', 'other']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export const ExtractionSchema = z.object({
  entities: z.array(
    z.object({
      type: z.string(),
      value: z.string(),
      confidence: z.number().min(0).max(1),
    })
  ),
  summary: z.string(),
  key_points: z.array(z.string()),
});

export const DraftReplySchema = z.object({
  subject: z.string(),
  body: z.string(),
  tone: z.enum(['formal', 'friendly', 'neutral']),
  suggested_actions: z.array(z.string()).optional(),
});

export const RankingSchema = z.object({
  ranked_ids: z.array(z.string()),
  rankings: z.array(
    z.object({
      id: z.string(),
      priority_score: z.number().min(1).max(10),
      reason: z.string(),
    })
  ),
});

export type ClassificationResult = z.infer<typeof ClassificationSchema>;
export type ExtractionResult = z.infer<typeof ExtractionSchema>;
export type DraftReplyResult = z.infer<typeof DraftReplySchema>;
export type RankingResult = z.infer<typeof RankingSchema>;
