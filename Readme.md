# SDE Job Outreach Automation

A lightweight, local-first tool for **Software Engineering job search outreach**. Discover recruiters and hiring managers at target companies, review contacts manually, and send thoughtful emails from your personal Gmail account.

> **Personal use only.** Not built for mass emailing, CRM, or multi-user workflows.

---

## Philosophy

The goal is **not** to blast hundreds of emails.

The goal is to:

- Find the **right people** at target companies
- **Review every contact** before anything is sent
- Send **high-quality, template-based** outreach
- **Track progress** in simple CSV files

Simplicity over automation.

---

## Features

| Feature | Description |
| -------- | ----------- |
| **Company list** | Upload `companies.csv` with your target employers |
| **Apollo discovery** | Find recruiters, EMs, hiring managers, and team leads per company |
| **Contact export** | Save results to `contacts.csv` (email when Apollo provides it, blank otherwise) |
| **Manual review** | Edit contacts, add emails, remove duplicates, add notes |
| **Send selection** | Mark `send_email` / `special_mail` per contact |
| **Email preview** | Review subject and body before sending |
| **Gmail sending** | Send via Nodemailer + Gmail App Password |
| **Status tracking** | `PENDING` · `SENT` · `FAILED` · `SKIPPED` |

---

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Integrations | Apollo API, Gmail SMTP (Nodemailer) |
| Storage | CSV files (`data/`) |
| Runtime | Local machine only |

**Intentionally excluded:** database, authentication, cloud deployment, AI personalization.

---

## Quick Start

### Prerequisites

- Node.js 18+
- [Apollo](https://www.apollo.io/) account with API access (master API key recommended)
- Gmail account with [App Password](https://myaccount.google.com/apppasswords) enabled

### Install & run

```bash
git clone <your-repo-url>
cd apollo_leads

npm install

cp .env.example .env
# Edit .env with your keys (see below)

npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build for production

```bash
npm run build
npm start
```

---

## Environment Variables

Copy `.env.example` to `.env`:

```env
APOLLO_API_KEY=your_apollo_master_api_key
GMAIL_EMAIL=your@gmail.com
GMAIL_APP_PASSWORD=your_16_char_app_password
LINKEDIN_URL=https://linkedin.com/in/yourprofile
GITHUB_URL=https://github.com/yourusername
```

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `APOLLO_API_KEY` | Yes | People search + optional email enrichment |
| `GMAIL_EMAIL` | Yes | Sender address for outreach |
| `GMAIL_APP_PASSWORD` | Yes | Gmail SMTP auth (not your regular password) |
| `LINKEDIN_URL` | Yes | Injected into email template |
| `GITHUB_URL` | Yes | Injected into email template |

Never commit `.env`. CSV data in `data/` is gitignored by default.

---

## Workflow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Upload          │     │ Discover         │     │ Review          │
│ companies.csv   │ ──► │ Contacts (Apollo)│ ──► │ contacts.csv    │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                        ┌──────────────────┐              │
                        │ Send Emails      │ ◄────────────┘
                        │ (Gmail SMTP)     │
                        └──────────────────┘
```

### Phase 1 — Company input

Upload `companies.csv` on the **Dashboard**:

```csv
company_name
Groww
Razorpay
PhonePe
```

Discovery reads this file **fresh on every run**.

### Phase 2 — Contact discovery

On **Discover Contacts**, Apollo searches each company for:

- Technical Recruiter · Recruiter · Talent Acquisition
- Engineering Manager · Software Engineering Manager · Backend Engineering Manager
- Hiring Manager · Team Lead · Director Engineering

**Retrieved:** name, designation, LinkedIn, company, email (if Apollo provides it).

Contacts **without email** are still saved — add emails manually in Review.

### Phase 3 — Manual review (required)

On **Review Contacts**:

- Remove incorrect or duplicate entries
- Add missing email addresses
- Add notes (e.g. *"Strong backend hiring manager"*)
- Set `send_email` and `special_mail`

No emails are sent automatically.

### Phase 4 — Contact selection

| Column | Values | Meaning |
| ------ | ------ | ------- |
| `send_email` | `YES` / `NO` | Eligible for automated send |
| `special_mail` | `YES` / `NO` | `YES` = handle manually, skip automation |

**Example — recruiter (automate):**

```csv
send_email,special_mail
YES,NO
```

**Example — director (manual):**

```csv
send_email,special_mail
YES,YES
```

### Phase 5 — Preview & send

On **Send Emails**:

1. Preview generated email (subject + body)
2. Confirm and send eligible contacts
3. Status updates in `contacts.csv`

**Send criteria:**

```
send_email = YES
special_mail = NO
status = PENDING
valid email address
```

---

## CSV Schemas

### `companies.csv`

```csv
company_name
Groww
Razorpay
```

### `contacts.csv`

```csv
company_name,person_name,designation,linkedin_url,email,contact_type,send_email,special_mail,status,notes
Groww,John Doe,Engineering Manager,https://linkedin.com/in/johndoe,john.doe@groww.in,Manager,YES,NO,PENDING,Strong backend hiring manager
```

| Column | Description |
| ------ | ----------- |
| `company_name` | Target company |
| `person_name` | Full name |
| `designation` | Job title from Apollo or manual entry |
| `linkedin_url` | LinkedIn profile URL |
| `email` | Work email (blank if unknown — fill in Review) |
| `contact_type` | e.g. Recruiter, Manager, Director |
| `send_email` | `YES` or `NO` |
| `special_mail` | `YES` or `NO` |
| `status` | `PENDING` · `SENT` · `FAILED` · `SKIPPED` |
| `notes` | Free-text review notes |

---

## Email Template

Single reusable template at `templates/default-email.txt`.

**Variables:**

| Variable | Source |
| -------- | ------ |
| `{{name}}` | Contact first name |
| `{{company}}` | Company name |
| `{{designation}}` | Job title |
| `{{linkedin}}` | Your LinkedIn URL (`.env`) |
| `{{github}}` | Your GitHub URL (`.env`) |

Edit the template file directly — no AI generation.

---

## Application Pages

| Page | Route | Purpose |
| ---- | ----- | ------- |
| Dashboard | `/` | Upload CSVs, view stats (companies, contacts, pending, sent) |
| Discover Contacts | `/recruiters` | Load `companies.csv`, run Apollo search, export `contacts.csv` |
| Review Contacts | `/review` | Edit table, notes, send flags; save CSV |
| Send Emails | `/send` | Preview, send via Gmail, update status |

---

## Project Structure

```
apollo_leads/
├── app/
│   ├── page.tsx                 # Dashboard
│   ├── recruiters/page.tsx      # Discover Contacts
│   ├── review/page.tsx          # Review Contacts
│   ├── send/page.tsx            # Send Emails
│   └── api/
│       ├── apollo/search/       # Apollo discovery
│       ├── companies/           # companies.csv CRUD
│       ├── contacts/            # contacts.csv CRUD
│       ├── contacts/export/     # Download contacts.csv
│       ├── email/preview/       # Template preview
│       ├── email/send/          # Gmail send
│       └── files/               # Upload + stats
├── components/
├── data/                        # CSV storage (gitignored)
├── lib/
│   ├── apollo.ts
│   ├── csv.ts
│   ├── gmail.ts
│   ├── template.ts
│   └── validation.ts
├── templates/
│   └── default-email.txt
├── .env.example
└── package.json
```

---

## Apollo API Setup

1. Log in to [Apollo](https://app.apollo.io) → **Settings** → **Integrations** → **API Keys**
2. Create a key with **Set as master key** enabled
3. Add to `.env` as `APOLLO_API_KEY`

**Note:** Apollo People Search finds contacts but may not return emails on all plans. Email enrichment requires `people/match` access. Contacts without email can be completed manually in Review.

---

## Gmail Setup

1. Enable **2-Step Verification** on your Google account
2. Create an [App Password](https://myaccount.google.com/apppasswords)
3. Add credentials to `.env`:

```env
GMAIL_EMAIL=you@gmail.com
GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
```

Verify connection on the **Send Emails** page (Gmail status badge).

---

## Out of Scope (V1)

The following are **not** included by design:

- Hunter.io / email verification
- LinkedIn enrichment
- Multiple templates
- AI personalization
- Follow-up automation
- Analytics / CRM
- Multi-user support
- Cloud deployment

---

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Run production server |
| `npm run lint` | ESLint |

---

## License

Private personal project. Not licensed for commercial redistribution.
