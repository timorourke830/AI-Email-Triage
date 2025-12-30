# AI Email Triage - Project Context

> Production-grade `claude.md` for AI-powered email classification and draft reply generation.

## Project Overview

AI Email Triage is a B2B SaaS application that automatically classifies incoming emails and generates draft replies using Claude AI. The system supports multiple email providers (Gmail via IMAP, Outlook via Microsoft Graph API OAuth) and is designed for multi-tenant deployment with per-client instances.

**Business Model:** $149-499/month subscriptions with setup fees
**Target Users:** Businesses wanting to automate email response workflows
**Current Status:** Beta development, targeting production launch

---

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Frontend** | Next.js 14 (Pages Router) | Dashboard UI, auth flows |
| **Backend** | Express.js | API endpoints, worker processes |
| **Database** | Supabase (PostgreSQL) | RLS enabled, service role for backend |
| **Auth** | Supabase Auth | Email/password, linked to `clients` table |
| **AI** | Claude API (Anthropic) | Classification + draft generation |
| **Email (Gmail)** | IMAP + App Passwords | `imap.gmail.com:993` |
| **Email (Outlook)** | Microsoft Graph API + OAuth2 | Azure AD app registration required |
| **Styling** | Tailwind CSS | Utility-first |
| **Package Manager** | pnpm | Required for all installs |
| **Runtime** | Node.js 18+ | tsx for TypeScript execution |

---

## Project Structure

```
C:\Dev\ai-email-triage\
├── dashboard/                 # Next.js frontend (port 3000)
│   ├── pages/
│   │   ├── api/
│   │   │   ├── emails/
│   │   │   │   ├── fetch.ts       # Fetches emails from provider
│   │   │   │   └── process.ts     # AI classification + drafts
│   │   │   ├── auth/
│   │   │   │   ├── microsoft/
│   │   │   │   │   ├── authorize.ts
│   │   │   │   │   └── callback.ts
│   │   │   │   └── init-client.ts
│   │   │   └── email/
│   │   │       └── test-connection.ts
│   │   ├── auth/
│   │   │   ├── signin.tsx
│   │   │   └── signup.tsx
│   │   ├── setup.tsx              # Onboarding wizard
│   │   └── index.tsx              # Main dashboard
│   ├── lib/
│   │   ├── auth.ts                # Auth helpers
│   │   ├── email-fetcher.ts       # Unified email fetch service
│   │   ├── gmail-imap.ts          # Gmail IMAP implementation
│   │   ├── microsoft-graph.ts     # Outlook Graph API implementation
│   │   ├── encryption.ts          # Credential encryption (AES-256-GCM)
│   │   └── llm.ts                 # Claude API client
│   ├── components/
│   └── .env.local                 # Dashboard env vars
│
├── backend/                   # Express API (port 3001)
│   ├── src/
│   │   ├── server.ts              # Express app entry
│   │   ├── worker.ts              # Email processing worker
│   │   ├── ingest.ts              # Legacy IMAP ingestion (deprecated)
│   │   └── llm/
│   │       └── client.ts          # Claude API wrapper
│   └── .env                       # Backend env vars
│
└── infra/
    └── supabase/
        ├── schema.sql             # Full database schema
        └── migrations/
            ├── 002_add_auth_and_credentials.sql
            └── 003_fix_user_signup_trigger.sql
```

---

## Database Schema

### Core Tables

```sql
-- Users/accounts
clients (
    id UUID PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE NOT NULL,
    auth_user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)

-- Settings + credentials (encrypted)
client_settings (
    id UUID PRIMARY KEY,
    client_id UUID REFERENCES clients(id),
    
    -- Provider config
    email_provider TEXT CHECK (email_provider IN ('gmail', 'outlook')),
    email_address TEXT,
    
    -- Gmail: IMAP credentials
    gmail_app_password_encrypted TEXT,
    
    -- Outlook: OAuth tokens
    outlook_access_token_encrypted TEXT,
    outlook_refresh_token_encrypted TEXT,
    outlook_token_expires_at TIMESTAMPTZ,
    
    -- Onboarding settings
    setup_completed BOOLEAN DEFAULT FALSE,
    ingest_since_days INTEGER DEFAULT 7,
    auto_approve_threshold DECIMAL(3,2) DEFAULT 0.95,
    reply_tone TEXT DEFAULT 'neutral',
    signature TEXT,
    
    UNIQUE(client_id)
)

-- Email metadata
emails (
    id UUID PRIMARY KEY,
    client_id UUID REFERENCES clients(id),
    external_id TEXT NOT NULL,           -- Provider message ID
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    subject TEXT,
    body TEXT,
    
    -- Processing state
    status email_status DEFAULT 'pending',
    classification email_classification,
    classification_confidence DECIMAL(3,2),
    draft_reply TEXT,
    final_reply TEXT,
    
    -- Timestamps
    received_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    
    UNIQUE(client_id, external_id)       -- Deduplication
)

-- Audit trail
audit_logs (
    id UUID PRIMARY KEY,
    client_id UUID,
    email_id UUID REFERENCES emails(id),
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ
)
```

### Enums

```sql
CREATE TYPE email_status AS ENUM (
    'pending',       -- New, awaiting processing
    'processing',    -- Currently being classified
    'awaiting_approval', -- AI drafted reply, human review needed
    'sent',          -- Approved and sent
    'rejected'       -- Human rejected the draft
);

CREATE TYPE email_classification AS ENUM (
    'inquiry',
    'complaint',
    'support',
    'billing',
    'spam',
    'other'
);
```

---

## Email Provider Integration

### Gmail (IMAP + App Passwords)

```typescript
// Settings
const GMAIL_CONFIG = {
    host: 'imap.gmail.com',
    port: 993,
    tls: true
};

// User provides:
// 1. Gmail address
// 2. App password (16-char from https://myaccount.google.com/apppasswords)
```

### Outlook (Microsoft Graph API + OAuth2)

```typescript
// Azure App Registration required
// Permissions: Mail.Read, Mail.ReadWrite, Mail.Send, User.Read, offline_access

// OAuth flow:
// 1. User clicks "Connect with Microsoft"
// 2. Redirects to Microsoft login
// 3. Callback exchanges code for tokens
// 4. Tokens stored encrypted in client_settings

// Graph API endpoints:
// GET /me/messages - Fetch emails
// POST /me/sendMail - Send replies
```

**Important:** Microsoft deprecated IMAP Basic Auth for personal accounts (September 2024). Outlook MUST use OAuth + Graph API.

---

## Processing Architecture

### Two-Job System

| Job | Trigger | What It Does |
|-----|---------|--------------|
| **Email Fetcher** | User clicks "Refresh" | Connects to provider, pulls new emails, stores in DB |
| **Email Processor** | After fetch or scheduled | Classifies emails, generates draft replies via Claude |

### User Flow

```
1. User signs in → clients record found/created
2. User selects provider (Gmail/Outlook)
3. Gmail: Enter email + app password → stored encrypted
   Outlook: OAuth flow → tokens stored encrypted
4. User clicks Refresh → fetch.ts pulls emails
5. process.ts classifies + drafts replies
6. User reviews drafts → approves/rejects
7. Approved emails sent via provider
```

### Processing Status Flow

```
pending → processing → awaiting_approval → sent
                   └─→ rejected
```

---

## AI Classification

### Model Configuration

```typescript
// Default model (set in .env)
LLM_MODEL=claude-sonnet-4-20250514

// Fallback
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
```

### Classification Categories

- `inquiry` - Questions about products/services
- `complaint` - Issues or dissatisfaction
- `support` - Technical help requests
- `billing` - Payment/invoice related
- `spam` - Unwanted/promotional
- `other` - Doesn't fit other categories

### Draft Reply Generation

The system generates contextual replies based on:
- Email classification
- Client's configured `reply_tone` (formal/friendly/neutral)
- Client's `signature`
- Original email content

---

## Environment Variables

### Dashboard (.env.local)

```env
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_SERVICE_KEY=[service-role-key]
NEXT_PUBLIC_API_URL=http://localhost:3001

# Microsoft OAuth (for Outlook)
MICROSOFT_CLIENT_ID=[azure-app-client-id]
MICROSOFT_CLIENT_SECRET=[azure-app-secret]
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/auth/microsoft/callback

# Encryption
ENCRYPTION_KEY=[32-byte-hex-key]
```

### Backend (.env)

```env
# Supabase
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_SERVICE_KEY=[service-role-key]

# AI
ANTHROPIC_API_KEY=sk-ant-api03-[key]
LLM_MODEL=claude-sonnet-4-20250514

# Server
PORT=3001

# Encryption (same as dashboard)
ENCRYPTION_KEY=[32-byte-hex-key]
```

---

## Development Commands

```bash
# Start dashboard (Terminal 1)
cd C:\Dev\ai-email-triage\dashboard
pnpm dev

# Start backend (Terminal 2)
cd C:\Dev\ai-email-triage\backend
pnpm dev

# Run email processor manually
cd C:\Dev\ai-email-triage\backend
pnpm worker
```

---

## Known Issues & Gotchas

### Authentication

1. **Client creation on signup:** The `clients` table record must be created after Supabase Auth signup. There's a database trigger, but the signup.tsx also has a fallback API call to `/api/auth/init-client`.

2. **RLS policies:** All tables have Row Level Security. Backend uses service role key to bypass RLS.

### Email Providers

1. **Outlook IMAP is dead:** Microsoft killed Basic Auth for personal accounts. DO NOT try IMAP for Outlook/Hotmail - use Graph API OAuth only.

2. **Gmail app passwords:** Users must have 2FA enabled to generate app passwords.

3. **Token refresh:** Outlook OAuth tokens expire. The `microsoft-graph.ts` handles refresh automatically using the stored refresh token.

### Worker

1. **Batch size:** Worker processes 5 emails per run (serverless-safe design). Run multiple times or schedule cron for bulk processing.

2. **Deprecated models:** The codebase previously used `claude-3-sonnet-20240229` which is deprecated. Always use `LLM_MODEL` env var with current models.

---

## Multi-Tenant Architecture (Planned)

The production system will provision dedicated infrastructure per client:

| Component | Per Client |
|-----------|------------|
| Supabase Project | Yes |
| Vercel Deployment | Yes |
| Subdomain | Yes (client.emailtriage.app) |
| Stripe Subscription | Yes |

Provisioning is triggered by Stripe webhook on successful payment.

---

## File Naming Conventions

- React components: `PascalCase.tsx`
- Utilities/libs: `kebab-case.ts`
- API routes: `kebab-case.ts`
- Types: `types.ts` in relevant directory

---

## API Endpoints

### Dashboard API Routes

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/emails/fetch` | POST | Pull emails from provider |
| `/api/emails/process` | POST | Run AI classification |
| `/api/emails` | GET | List emails for client |
| `/api/emails/[id]/approve` | POST | Approve and send draft |
| `/api/emails/[id]/reject` | POST | Reject draft |
| `/api/auth/microsoft/authorize` | GET | Start Outlook OAuth |
| `/api/auth/microsoft/callback` | GET | Handle OAuth callback |
| `/api/email/test-connection` | POST | Verify credentials work |

### Backend API Routes

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Health check |
| `/api/emails` | GET | List emails (legacy) |

---

## Testing Checklist

Before deploying:

- [ ] Sign up creates client record
- [ ] Gmail connection + test works
- [ ] Outlook OAuth flow completes
- [ ] Refresh fetches new emails
- [ ] Emails appear in dashboard
- [ ] Classification runs correctly
- [ ] Draft replies generate
- [ ] Approve sends email
- [ ] Reject updates status
- [ ] Audit logs capture actions

---

## References

- [Anthropic API Docs](https://docs.anthropic.com/)
- [Microsoft Graph API](https://learn.microsoft.com/en-us/graph/api/overview)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Gmail IMAP Settings](https://support.google.com/mail/answer/7126229)
