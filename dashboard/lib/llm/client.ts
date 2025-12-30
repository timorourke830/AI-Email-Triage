import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import {
  CLASSIFICATION_PROMPT,
  EXTRACTION_PROMPT,
  DRAFT_REPLY_PROMPT,
  fillTemplate,
} from './prompts';
import {
  parseAndValidate,
  ClassificationSchema,
  ExtractionSchema,
  DraftReplySchema,
  type ClassificationResult,
  type ExtractionResult,
  type DraftReplyResult,
} from './json';

type LLMProvider = 'openai' | 'anthropic';

interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
}

export class LLMClient {
  private provider: LLMProvider;
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;
  private model: string;

  constructor(config: LLMConfig) {
    this.provider = config.provider;

    if (config.provider === 'openai') {
      this.openai = new OpenAI({ apiKey: config.apiKey });
      this.model = config.model || 'gpt-4-turbo-preview';
    } else {
      this.anthropic = new Anthropic({ apiKey: config.apiKey });
      this.model = config.model || process.env.LLM_MODEL || 'claude-sonnet-4-20250514';
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
      const parsed = parseAndValidate(response, ClassificationSchema);
      return { result: parsed.data, error: parsed.error };
    } catch (err) {
      return {
        result: null,
        error: err instanceof Error ? err.message : 'Classification failed',
      };
    }
  }

  async extractData(
    content: string,
    attachments?: string
  ): Promise<{ result: ExtractionResult | null; error: string | null }> {
    const prompt = fillTemplate(EXTRACTION_PROMPT, {
      content,
      attachments: attachments || '',
    });

    try {
      const response = await this.complete(prompt);
      const parsed = parseAndValidate(response, ExtractionSchema);
      return { result: parsed.data, error: parsed.error };
    } catch (err) {
      return {
        result: null,
        error: err instanceof Error ? err.message : 'Extraction failed',
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
      const parsed = parseAndValidate(response, DraftReplySchema);
      return { result: parsed.data, error: parsed.error };
    } catch (err) {
      return {
        result: null,
        error: err instanceof Error ? err.message : 'Draft reply failed',
      };
    }
  }
}

// Get LLM client instance
export function getLLMClient(): LLMClient {
  const provider = (process.env.LLM_PROVIDER as LLMProvider) || 'openai';
  const apiKey =
    provider === 'openai'
      ? process.env.OPENAI_API_KEY!
      : process.env.ANTHROPIC_API_KEY!;

  return new LLMClient({
    provider,
    apiKey,
    model: process.env.LLM_MODEL,
  });
}
