/**
 * LLM client for email classification and reply drafting
 * Server-side only - do not import in client components
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { z, ZodSchema } from 'zod';

type LLMProvider = 'openai' | 'anthropic';

// Prompts
const CLASSIFICATION_PROMPT = `You are an email classification assistant. Analyze the following email and classify it into one of these categories:
- inquiry: General questions or requests for information
- complaint: Customer complaints or negative feedback
- support: Technical support or help requests
- billing: Payment, invoice, or account-related issues
- spam: Unsolicited or irrelevant emails
- other: Emails that don't fit other categories

Respond with a JSON object containing:
- classification: one of the categories above
- confidence: a number between 0 and 1 indicating your confidence
- reasoning: a brief explanation of why you chose this classification

Email:
From: {{from}}
Subject: {{subject}}
Body:
{{body}}

Respond ONLY with valid JSON, no additional text.`;

const DRAFT_REPLY_PROMPT = `You are an email reply assistant. Draft a professional reply to the following email.

Context:
- Email classification: {{classification}}
- Extracted information: {{extracted_data}}
- Reply tone: {{tone}}
- Company signature: {{signature}}

Original Email:
From: {{from}}
Subject: {{subject}}
Body:
{{body}}

Respond with a JSON object containing:
- subject: the reply subject line (typically "Re: original subject")
- body: the full reply body including greeting and closing (but NOT the signature, it will be appended)
- tone: the tone used (formal/friendly/neutral)
- suggested_actions: optional array of suggested follow-up actions

Respond ONLY with valid JSON, no additional text.`;

// Schemas
export const ClassificationSchema = z.object({
  classification: z.enum(['inquiry', 'complaint', 'support', 'billing', 'spam', 'other']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export const DraftReplySchema = z.object({
  subject: z.string(),
  body: z.string(),
  tone: z.enum(['formal', 'friendly', 'neutral']),
  suggested_actions: z.array(z.string()).optional(),
});

export type ClassificationResult = z.infer<typeof ClassificationSchema>;
export type DraftReplyResult = z.infer<typeof DraftReplySchema>;

// Template filling
function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

// JSON extraction and parsing
function extractJson(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  return text.trim();
}

function parseAndValidate<T>(
  text: string,
  schema: ZodSchema<T>
): { data: T | null; error: string | null } {
  try {
    const jsonStr = extractJson(text);
    const parsed = JSON.parse(jsonStr);
    const result = schema.safeParse(parsed);

    if (!result.success) {
      return {
        data: null,
        error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      };
    }

    return { data: result.data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'JSON parsing failed',
    };
  }
}

class LLMClient {
  private provider: LLMProvider;
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;
  private model: string;

  constructor() {
    this.provider = (process.env.LLM_PROVIDER as LLMProvider) || 'openai';

    if (this.provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
      this.openai = new OpenAI({ apiKey });
      this.model = process.env.LLM_MODEL || 'gpt-4-turbo-preview';
    } else {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
      this.anthropic = new Anthropic({ apiKey });
      this.model = process.env.LLM_MODEL || 'claude-3-sonnet-20240229';
    }
  }

  private async complete(prompt: string): Promise<string> {
    if (this.provider === 'openai' && this.openai) {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2000,
      });
      return response.choices[0]?.message?.content || '';
    }

    if (this.provider === 'anthropic' && this.anthropic) {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });
      const block = response.content[0];
      return block.type === 'text' ? block.text : '';
    }

    throw new Error('LLM client not configured');
  }

  async classifyEmail(
    from: string,
    subject: string,
    body: string
  ): Promise<{ result: ClassificationResult | null; error: string | null }> {
    const prompt = fillTemplate(CLASSIFICATION_PROMPT, { from, subject, body });

    try {
      const response = await this.complete(prompt);
      const { data, error } = parseAndValidate(response, ClassificationSchema);
      return { result: data, error };
    } catch (err) {
      return {
        result: null,
        error: err instanceof Error ? err.message : 'Classification failed',
      };
    }
  }

  async draftReply(params: {
    from: string;
    subject: string;
    body: string;
    classification: string;
    extractedData: string;
    tone: string;
    signature: string;
  }): Promise<{ result: DraftReplyResult | null; error: string | null }> {
    const prompt = fillTemplate(DRAFT_REPLY_PROMPT, {
      from: params.from,
      subject: params.subject,
      body: params.body,
      classification: params.classification,
      extracted_data: params.extractedData,
      tone: params.tone,
      signature: params.signature,
    });

    try {
      const response = await this.complete(prompt);
      const { data, error } = parseAndValidate(response, DraftReplySchema);
      return { result: data, error };
    } catch (err) {
      return {
        result: null,
        error: err instanceof Error ? err.message : 'Draft reply failed',
      };
    }
  }
}

// Singleton
let llmClient: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (!llmClient) {
    llmClient = new LLMClient();
  }
  return llmClient;
}
