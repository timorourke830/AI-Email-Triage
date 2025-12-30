# AI Email + Document Triage System

An AI-powered email triage system that automatically classifies incoming emails, extracts key information from attachments, and drafts intelligent replies for human approval.

## Features

- **Email Classification**: Automatically categorizes emails (inquiry, complaint, support, billing, spam, other)
- **Data Extraction**: Extracts entities, summaries, and key points from emails and attachments
- **Smart Reply Drafting**: Generates contextual reply drafts based on email content and classification
- **Human-in-the-Loop**: All replies require approval before sending
- **Audit Trail**: Complete activity logging for compliance and debugging
- **Multi-LLM Support**: Works with OpenAI or Anthropic

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Email      │────>│   Supabase   │<────│  Dashboard   │
│   Ingestion  │     │   Database   │     │   (Next.js)  │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            v
                     ┌──────────────┐
                     │   Worker     │
                     │  (Cron Job)  │
                     └──────────────┘
                            │
                            v
                     ┌──────────────┐
                     │   LLM API    │
                     │ (OpenAI/    │
                     │  Anthropic)  │
                     └──────────────┘
```

## Project Structure

```
ai-email-triage/
├── backend/                    # Standalone Express server (optional)
│   ├── src/
│   │   ├── server.ts          # Express API server
│   │   ├── worker.ts          # Email processing worker
│   │   ├── email_ingestion.ts # Email ingestion stub
│   │   ├── llm/
│   │   │   ├── client.ts      # LLM client (OpenAI/Anthropic)
│   │   │   └── prompts.ts     # LLM prompts
│   │   ├── types/
│   │   │   └── db.ts          # TypeScript types
│   │   └── utils/
│   │       └── json.ts        # JSON parsing utilities
│   ├── package.json
│   └── tsconfig.json
├── dashboard/                  # Next.js dashboard + Vercel API
│   ├── components/
│   │   ├── EmailList.tsx
│   │   └── EmailDetail.tsx
│   ├── lib/
│   │   ├── api.ts             # Frontend API client
│   │   ├── supabase.ts        # Supabase client
│   │   ├── types.ts           # TypeScript types
│   │   └── llm/               # LLM client for worker
│   ├── pages/
│   │   ├── _app.tsx
│   │   ├── index.tsx          # Email list page
│   │   ├── emails/[id].tsx    # Email detail page
│   │   └── api/               # Vercel API routes
│   │       ├── health.ts
│   │       ├── worker.ts      # Cron job endpoint
│   │       └── emails/
│   │           ├── index.ts
│   │           └── [id]/
│   │               ├── index.ts
│   │               ├── approve.ts
│   │               └── reject.ts
│   ├── vercel.json            # Cron configuration
│   ├── package.json
│   └── tsconfig.json
└── infra/
    └── supabase/
        └── schema.sql         # Database schema
```

## Prerequisites

- Node.js 18+
- Supabase account
- OpenAI or Anthropic API key
- Vercel account (for deployment)

## Setup

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Navigate to the SQL Editor
3. Run the schema from `infra/supabase/schema.sql`
4. Go to Settings > API and copy your URL and service role key

### 2. Configure Environment Variables

**Dashboard (.env.local)**:
```bash
cd dashboard
cp .env.example .env.local
# Edit .env.local with your values
```

**Backend (.env)** (if running standalone):
```bash
cd backend
cp .env.example .env
# Edit .env with your values
```

### 3. Install Dependencies

```bash
# Dashboard
cd dashboard
npm install

# Backend (optional)
cd ../backend
npm install
```

## Running Locally

### Dashboard + API (Recommended)

```bash
cd dashboard
npm run dev
```

This starts the Next.js dev server at `http://localhost:3000` with API routes.

### Standalone Backend (Alternative)

```bash
cd backend
npm run dev
```

This runs the Express server at `http://localhost:3001`.

### Running the Worker Locally

**Option 1**: Direct execution
```bash
cd backend
npm run worker
```

**Option 2**: Call the API endpoint
```bash
curl -X POST http://localhost:3000/api/worker \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Testing the System

### 1. Create a Test Client

```sql
INSERT INTO clients (name, email)
VALUES ('Test Company', 'test@example.com');

INSERT INTO client_settings (client_id, reply_tone, signature)
VALUES (
  (SELECT id FROM clients WHERE email = 'test@example.com'),
  'friendly',
  'Best regards,\nThe Support Team'
);
```

### 2. Ingest a Test Email

```sql
INSERT INTO emails (client_id, from_address, to_address, subject, body, status)
VALUES (
  (SELECT id FROM clients WHERE email = 'test@example.com'),
  'customer@gmail.com',
  'support@example.com',
  'Question about my order',
  'Hi, I placed an order #12345 last week but haven''t received any tracking information yet. Could you please check the status?',
  'pending'
);
```

### 3. Run the Worker

```bash
npm run worker
# or
curl -X POST http://localhost:3000/api/worker \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### 4. View in Dashboard

Open `http://localhost:3000` to see the processed email and approve/reject the draft reply.

## Deploying to Vercel

### 1. Deploy Dashboard

```bash
cd dashboard
vercel
```

### 2. Set Environment Variables

In Vercel dashboard:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `LLM_PROVIDER`
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
- `CRON_SECRET` (generate a random string)

### 3. Verify Cron Job

The cron job is configured in `vercel.json` to run every 5 minutes:
```json
{
  "crons": [
    {
      "path": "/api/worker",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Vercel will automatically authenticate cron requests. For manual calls, use the `CRON_SECRET`.

## Email Lifecycle

```
pending → processing → awaiting_approval → sent
                   ↓                    ↓
                   └────────────────→ rejected
```

1. **Pending**: New email waiting to be processed
2. **Processing**: Worker is analyzing with LLM
3. **Awaiting Approval**: Draft ready for human review
4. **Sent**: Reply approved and sent
5. **Rejected**: Reply rejected by human reviewer

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/emails` | List emails with pagination |
| GET | `/api/emails/:id` | Get email details |
| POST | `/api/emails/:id/approve` | Approve reply |
| POST | `/api/emails/:id/reject` | Reject reply |
| POST | `/api/worker` | Process pending emails |

### Query Parameters for GET /api/emails

- `status`: Filter by status (pending, processing, awaiting_approval, sent, rejected)
- `client_id`: Filter by client
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)

## Extending the System

### Adding Email Ingestion

The `email_ingestion.ts` provides a stub. Implement integrations:

1. **Gmail API**: Use OAuth2 to fetch emails
2. **Microsoft Graph**: For Outlook/Exchange
3. **SendGrid Inbound Parse**: For webhook-based ingestion
4. **IMAP**: For traditional email servers

### Adding Email Sending

In the approve endpoint, add SMTP or API-based email sending:

```typescript
// Example with SendGrid
import sgMail from '@sendgrid/mail';
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

await sgMail.send({
  to: email.from_address,
  from: email.to_address,
  subject: draftSubject,
  text: draftBody,
});
```

### Custom LLM Prompts

Edit `lib/llm/prompts.ts` to customize:
- Classification categories
- Extraction patterns
- Reply tone and structure

## License

MIT
