export const CLASSIFICATION_PROMPT = `You are an email classification assistant. Analyze the following email and classify it into one of these categories:
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

export const EXTRACTION_PROMPT = `You are a document analysis assistant. Extract key information from the following content (email body and any attachment text).

Respond with a JSON object containing:
- entities: array of objects with {type, value, confidence} for each extracted entity (e.g., dates, amounts, names, account numbers, order IDs)
- summary: a concise summary of the content (2-3 sentences)
- key_points: array of important points or action items

Content to analyze:
{{content}}

{{#if attachments}}
Attachments:
{{attachments}}
{{/if}}

Respond ONLY with valid JSON, no additional text.`;

export const RANKING_PROMPT = `You are an email priority assistant. Analyze the following emails and rank them by priority/urgency.

Consider these factors when ranking:
- Urgency indicators (words like "urgent", "ASAP", "immediately", deadlines)
- Sender importance (complaints tend to be higher priority)
- Business impact (billing issues, support requests)
- Time sensitivity (mentions of dates, deadlines)
- Emotional tone (frustrated customers need faster response)

Emails to rank:
{{emails}}

Respond with a JSON object containing:
- ranked_ids: array of email IDs sorted from highest to lowest priority
- rankings: array of objects with {id, priority_score, reason} where priority_score is 1-10 (10 being most urgent)

Respond ONLY with valid JSON, no additional text.`;

export const DRAFT_REPLY_PROMPT = `You are an email reply assistant. Draft a professional reply to the following email.

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

export function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template;

  // Handle conditional blocks {{#if var}}...{{/if}}
  const conditionalRegex = /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(conditionalRegex, (_, varName, content) => {
    return vars[varName] ? content : '';
  });

  // Replace simple variables {{var}}
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  return result;
}
