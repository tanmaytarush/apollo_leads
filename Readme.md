# SDE Job Outreach Automation

A **browser-first** web app for Software Engineering job search outreach. Upload target companies as CSV, discover a hiring manager or technical recruiter per company via **Apollo API** (with **Hunter.io** fallback), review every contact manually, and send personalised template emails from your **Gmail** account.

> **Personal use only.** Single user, no auth, no database. Human review is mandatory before any email is sent.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Complete Flow](#complete-flow)
3. [Tech Stack](#tech-stack)
4. [Prerequisites](#prerequisites)
5. [Installation](#installation)
6. [Environment Variables](#environment-variables)
7. [Quick Start](#quick-start)
8. [Pages & API Routes](#pages--api-routes)
9. [CSV Schemas](#csv-schemas)
10. [Discovery Pipeline](#discovery-pipeline)
11. [Contact Scoring](#contact-scoring)
12. [Apollo API Reference](#apollo-api-reference)
13. [Hunter.io API Reference](#hunterio-api-reference)
14. [Apollo Free Plan — Reality](#apollo-free-plan--reality)
15. [Email Template](#email-template)
16. [Gmail Setup](#gmail-setup)
17. [Project Structure](#project-structure)
18. [Troubleshooting](#troubleshooting)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BROWSER (Next.js App Router)                       │
│                                                                             │
│  Dashboard /      Discover /recruiters    Review /review     Send /send     │
│  ──────────       ────────────────────    ─────────────      ─────────      │
│  Upload CSVs      Company Intel           Edit contacts      Preview email  │
│  Pipeline stats   Run Discovery           Set send flags     Gmail send     │
│  Download CSVs    Progress + credits      Save to CSV        Status track   │
└───────────────────────────┬─────────────────────────────────────────────────┘
                            │ API Routes (Next.js App Router)
            ┌───────────────┼───────────────────────────────┐
            │               │                               │
     /api/apollo/     /api/email/            /api/files, /api/companies
     search           send                   /api/contacts
     company-intel    preview
            │               │
            ▼               ▼
   ┌─────────────────┐  ┌──────────────────────────────────┐
   │   Discovery     │  │  Gmail SMTP (Nodemailer)          │
   │   Pipeline      │  │  tanmay.dikshit2112@gmail.com     │
   │   lib/apollo.ts │  │  App Password auth                │
   └────────┬────────┘  └──────────────────────────────────┘
            │
     ┌──────┴──────────────────────────────────┐
     │                                         │
     ▼                                         ▼
┌──────────────────────────────┐   ┌───────────────────────────────┐
│  Apollo.io API               │   │  Hunter.io API                │
│  api.apollo.io/api/v1        │   │  api.hunter.io/v2             │
│                              │   │                               │
│  PRIMARY (when credits avail)│   │  FALLBACK (when Apollo fails) │
│  • organizations/enrich      │   │  • domain-search              │
│  • organizations/{id}/       │   │    GET /?domain=phonepe.com   │
│    job_postings              │   │    Returns emails + titles    │
│  • people/match (paid plan)  │   │    sorted by recruiter role   │
│  • mixed_people/api_search   │   │  50 free searches/month       │
│    (paid plan)               │   └───────────────────────────────┘
│  • contacts/search (CRM)     │
└──────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────┐
│  data/ (server-side CSV storage)                             │
│  companies.csv · contacts.csv · company_intel.csv            │
└──────────────────────────────────────────────────────────────┘
```

---

## Complete Flow

```
1. Upload Companies CSV          (Dashboard — drag & drop)
         │
         ▼
2. Run Company Intel             (Discover page)
   └─ Apollo: org enrich → job postings → hiring score per company
         │
         ▼
3. Select Companies + Run Discovery   (Discover page)
   └─ Per company:
      ├─ Apollo organizations/enrich  → get org ID
      ├─ Apollo job_postings          → find open SDE/backend roles
      ├─ Apollo people/match          → find recruiter/EM with email
      │   (requires paid Apollo plan or available credits)
      ├─ Apollo contacts/search       → search your Apollo CRM
      └─ Hunter.io domain-search      → fallback if Apollo returns nothing
           (free, 50 searches/month)
         │
         ▼
4. Review contacts               (Review page)
   └─ Edit emails, names, notes
   └─ Set send_email = YES
   └─ Save Changes
         │
         ▼
5. Send emails                   (Send page)
   └─ Gmail SMTP via Nodemailer
   └─ 1.5s delay between sends
   └─ Status → SENT / FAILED
         │
         ▼
6. Download backup CSV           (Dashboard)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15, React 19, TypeScript |
| Styling | Tailwind CSS v3 |
| Email sending | Nodemailer + Gmail SMTP (App Password) |
| Contact discovery | Apollo.io API (primary) + Hunter.io API (fallback) |
| Storage | Server-side CSV files (`data/` directory) |
| Runtime | Node.js 18+ — local dev or self-hosted |

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Node.js 18+** | Required for Next.js 15 |
| **Apollo account** | [apollo.io](https://apollo.io) — free plan has limited discovery (see [Apollo Free Plan Reality](#apollo-free-plan--reality)) |
| **Hunter.io account** | [hunter.io](https://hunter.io) — **requires a work/company email to sign up** (e.g. `you@yourstartup.com`, not Gmail). Free plan: 50 searches/month |
| **Gmail account** | With 2-Step Verification enabled + an App Password |

---

## Installation

```bash
# 1. Clone
git clone <repo-url>
cd apollo_leads

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Fill in values — see Environment Variables below

# 4. Start
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

```env
# Apollo API — get from apollo.io → Settings → Integrations → API Keys
APOLLO_API_KEY=your_apollo_api_key

# Hunter.io API — get from hunter.io → Settings → API (requires work email signup)
HUNTER_API_KEY=your_hunter_api_key

# Gmail SMTP — NOT your regular Google password
GMAIL_EMAIL=you@gmail.com
GMAIL_APP_PASSWORD=your_16_char_app_password

# Your profile links — injected into email template
LINKEDIN_URL=https://linkedin.com/in/yourprofile
GITHUB_URL=https://github.com/yourusername

# Optional: app-side credit cap per discovery run (default 75)
APOLLO_CREDIT_LIMIT=75

# Optional: max contacts to find per company (default 1)
APOLLO_MAX_PER_COMPANY=1
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `APOLLO_API_KEY` | Yes | Passed as `X-Api-Key` header on all Apollo calls |
| `HUNTER_API_KEY` | Yes (recommended) | Hunter.io fallback when Apollo returns nothing. Without this, companies where Apollo fails get 0 contacts |
| `GMAIL_EMAIL` | Yes | From address for outreach |
| `GMAIL_APP_PASSWORD` | Yes | Gmail SMTP authentication |
| `LINKEDIN_URL` | Yes | Template variable `{{linkedin}}` |
| `GITHUB_URL` | Yes | Template variable `{{github}}` |
| `APOLLO_CREDIT_LIMIT` | No | Stops a single run before burning through all credits. Default: 75 |
| `APOLLO_MAX_PER_COMPANY` | No | Max contacts to save per company. Default: 1 (one hiring manager) |

---

## Quick Start

| Step | Page | Action |
|------|------|--------|
| 1 | Terminal | `npm run dev` |
| 2 | Dashboard `/` | Upload `companies.csv` (left card) |
| 3 | Discover `/recruiters` | Run **Company Intel**, then **Run Discovery** |
| 4 | Review `/review` | Set `send_email = YES`, save |
| 5 | Send `/send` | Preview → Send Selected |
| 6 | Dashboard `/` | Download CSV backup |

---

## Pages & API Routes

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Dashboard — upload companies/contacts, pipeline funnel stats, download CSV |
| `/recruiters` | Discover — company selection table, intel scores, run discovery, credit tracker |
| `/review` | Review — edit contacts table, send flags, save changes |
| `/send` | Send — Gmail status, email preview, bulk send, status tracking |

### API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/files` | Upload stats (row counts, timestamps) |
| `POST` | `/api/files` | Upload CSV (`type=companies` or `type=contacts`) |
| `GET` | `/api/companies` | Read companies |
| `PUT` | `/api/companies` | Write companies |
| `GET` | `/api/companies/export` | Download companies.csv |
| `GET` | `/api/contacts` | Read contacts |
| `POST` | `/api/contacts` | Write contacts |
| `GET` | `/api/contacts/export` | Download contacts.csv |
| `GET` | `/api/apollo/search` | Probe Apollo connection + capabilities |
| `POST` | `/api/apollo/search` | Run discovery `{ replace, selectedCompanies, maxPerCompany }` |
| `GET` | `/api/apollo/company-intel` | Read company intel |
| `POST` | `/api/apollo/company-intel` | Run company intel `{ replace, selectedCompanies }` |
| `POST` | `/api/email/preview` | Render email template for a contact |
| `GET` | `/api/email/send` | Verify Gmail SMTP |
| `POST` | `/api/email/send` | Send emails `{ indices: [0, 2, 5] }` |

---

## CSV Schemas

### companies.csv

```csv
company_name,domain
CoinDCX,coindcx.com
PhonePe,phonepe.com
Pidilite,pidilite.com
```

| Column | Required | Notes |
|--------|----------|-------|
| `company_name` | Yes | Display name |
| `domain` | Yes | Without `https://` — required for Apollo org enrich and Hunter.io domain search |

### contacts.csv

```csv
company_name,person_name,designation,email,linkedin_url,contact_type,source,contact_score,matching_role_found,matched_job_title,email_quality,send_email,special_mail,status,notes
CoinDCX,Virat Tomer,SDET,virat.tomer@coindcx.com,https://linkedin.com/in/tomervirat,Manager,apollo_match,12,YES,Backend Engineer,good,YES,NO,PENDING,
```

| Column | Values | Description |
|--------|--------|-------------|
| `contact_type` | Recruiter · Manager · Director | Inferred from title |
| `source` | `apollo_match` · `api_search` · `hunter` · `contacts_search` | How contact was found |
| `contact_score` | number | Higher = contact first (see Scoring) |
| `matching_role_found` | YES / NO | Company has open SDE/backend/MLE role |
| `email_quality` | good · generic · missing | Assessed from email pattern |
| `send_email` | YES / NO | Include in automated send |
| `special_mail` | YES / NO | YES = manual only, skip automation |
| `status` | PENDING · SENT · FAILED · SKIPPED | Outreach tracking |

---

## Discovery Pipeline

Runs in `lib/apollo.ts → discoverRecruiters()` for each selected company:

```
Company (name + domain)
        │
        ▼
┌───────────────────────────────────────────────────────┐
│  STEP 1: Resolve Organization                         │
│  GET /organizations/enrich?domain={domain}            │
│  → Apollo org ID, industry, employee count            │
│  Fallback: POST /mixed_companies/search               │
└───────────────────────┬───────────────────────────────┘
                        │ org ID
                        ▼
┌───────────────────────────────────────────────────────┐
│  STEP 2: Fetch Job Postings                           │
│  GET /organizations/{id}/job_postings                 │
│  → match SDE / backend / MLE titles                  │
│  → sets matching_role_found + matched_job_title       │
│  Cost: 1 enrichment credit                           │
└───────────────────────┬───────────────────────────────┘
                        │ job context
                        ▼
┌───────────────────────────────────────────────────────┐
│  STEP 3: Find Contact — 3 fallback layers             │
│                                                       │
│  3a. Apollo people/match (PAID PLAN REQUIRED)         │
│      POST /people/match                               │
│      Title priority loop:                            │
│        1. technical recruiter                        │
│        2. engineering recruiter                      │
│        3. talent acquisition                         │
│        4. engineering manager                        │
│        5. software engineering manager               │
│        6. hiring manager                             │
│      → stops at first person with email              │
│      → if person found without email: save + enrich  │
│      Cost: 1 email credit if email returned          │
│                                                       │
│  3b. Apollo contacts/search (FREE — CRM only)         │
│      POST /contacts/search                            │
│      → searches contacts already in your Apollo CRM  │
│      → returns 0 for companies not in your CRM       │
│      Cost: 0 credits                                  │
│                                                       │
│  3c. Hunter.io domain-search (FREE — 50/month)        │
│      GET api.hunter.io/v2/domain-search?domain=...   │
│      → scans publicly indexed emails at the domain   │
│      → sorts recruiter/EM titles first               │
│      → runs when 3a + 3b return nothing              │
└───────────────────────┬───────────────────────────────┘
                        │ candidates
                        ▼
┌───────────────────────────────────────────────────────┐
│  STEP 4: Score + Dedupe + Save                       │
│  → applyScoring() — role relevance + job match        │
│  → deduped by Apollo person ID or name+linkedin       │
│  → appended to data/contacts.csv                     │
└───────────────────────────────────────────────────────┘
```

**maxPerCompany**: Controlled from the UI selector (1 / 2 / 3 / 5). Default: 1. Caps how many contacts are saved per company. Directly controls credit spend.

---

## Contact Scoring

Implemented in `lib/scoring.ts`. Higher score = shown first in Review and Send.

| Factor | Points |
|--------|--------|
| Engineering Manager / Hiring Manager | +10 |
| Director Engineering | +8 |
| Team Lead | +7 |
| Technical Recruiter / Recruiter | +5 |
| Talent Acquisition | +4 |
| Company has open backend role | +10 |
| Company has open SDE role | +10 |
| Company has open MLE role | +10 |
| Good email (personal work address) | +5 |
| LinkedIn URL present | +2 |
| Generic inbox (careers@, hr@) | −3 |
| Missing email | −2 |

---

## Apollo API Reference

**Base URL:** `https://api.apollo.io/api/v1`  
**Auth:** `X-Api-Key: <APOLLO_API_KEY>` header on every request  
**Content-Type:** `application/json`  
**Rate limit:** Auto-retry once after 60s on HTTP 429

---

### 1. Organization Enrich

```
GET /organizations/enrich?domain={domain}
```

Resolves a domain to an Apollo org ID and company metadata.

```bash
curl "https://api.apollo.io/api/v1/organizations/enrich?domain=phonepe.com" \
  -H "X-Api-Key: YOUR_KEY"
```

**Response fields used:**

```json
{
  "organization": {
    "id": "5f8abc...",
    "name": "PhonePe",
    "primary_domain": "phonepe.com",
    "industry": "Financial Services",
    "estimated_num_employees": 20000,
    "short_description": "...",
    "linkedin_url": "https://linkedin.com/company/phonepe"
  }
}
```

| | |
|-|-|
| **Cost** | 1 enrichment credit |
| **Free plan** | ✅ Yes (uses enrichment credits from monthly quota) |
| **Used for** | Get org ID required for all subsequent calls |

---

### 2. Job Postings

```
GET /organizations/{org_id}/job_postings
```

Returns open roles at the company.

```bash
curl "https://api.apollo.io/api/v1/organizations/5f8abc.../job_postings" \
  -H "X-Api-Key: YOUR_KEY"
```

**Response fields used:**

```json
{
  "job_postings": [
    { "title": "Senior Backend Engineer", "location": "Bengaluru", "posted_at": "2025-06-01" }
  ]
}
```

| | |
|-|-|
| **Cost** | 1 enrichment credit |
| **Free plan** | ✅ Yes |
| **Used for** | Detect SDE/backend/MLE roles → `matching_role_found`, `matched_job_title` |

---

### 3. People Match

```
POST /people/match
```

Finds the best matching person at a company by title. Costs 1 credit **only** when email is returned.

```bash
curl -X POST "https://api.apollo.io/api/v1/people/match" \
  -H "X-Api-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "5f8abc...",
    "title": "engineering manager",
    "reveal_personal_emails": false,
    "reveal_phone_number": false,
    "run_waterfall_phone": false
  }'
```

**Response fields used:**

```json
{
  "person": {
    "id": "63519a...",
    "first_name": "Priya",
    "last_name": "Sharma",
    "title": "Senior Engineering Manager",
    "email": "priya.sharma@phonepe.com",
    "linkedin_url": "https://linkedin.com/in/priyasharma",
    "has_email": true
  }
}
```

| | |
|-|-|
| **Cost** | 1 email credit (only when `person.email` is returned) |
| **Free plan** | ❌ **Requires paid plan** — returns 403 on free plan |
| **Used for** | Primary contact finder — looped over title priority |

> **Note:** `reveal_phone_number: false` and `run_waterfall_phone: false` are always set explicitly to prevent mobile credit usage.

---

### 4. People API Search

```
POST /mixed_people/api_search?person_titles[]=...&organization_names[]=...&organization_domains[]=...&per_page=10&page=1
```

Searches Apollo's 200M+ contact database. No body — all params in query string.

```bash
curl -X POST "https://api.apollo.io/api/v1/mixed_people/api_search?\
person_titles[]=technical%20recruiter&\
person_titles[]=engineering%20manager&\
organization_names[]=PhonePe&\
organization_domains[]=phonepe.com&\
per_page=10&page=1" \
  -H "X-Api-Key: YOUR_KEY" \
  -H "Content-Type: application/json"
```

**Response fields used:**

```json
{
  "people": [
    {
      "id": "67da57...",
      "first_name": "Carrie",
      "last_name_obfuscated": "Ki***r",
      "title": "Technical Recruiter",
      "has_email": true,
      "organization": { "name": "PhonePe" }
    }
  ]
}
```

| | |
|-|-|
| **Cost** | 0 credits for search. 1 email credit per reveal via `people/match?id=...` |
| **Free plan** | ❌ **Requires paid plan** — returns 403 on free plan |
| **Used for** | Fallback people discovery if `people/match` finds nothing |
| **Note** | Returns obfuscated last names. Full profile + email fetched separately via enrichment |

---

### 5. People Enrichment (Email Reveal by ID)

```
POST /people/match?id={person_id}&reveal_personal_emails=false&run_waterfall_email=true&run_waterfall_phone=false&reveal_phone_number=false&domain={domain}
```

Reveals the email for a person found via search (who has `has_email: true` but no email in search results).

| | |
|-|-|
| **Cost** | 1 email credit when email returned |
| **Free plan** | ❌ Requires paid plan |
| **Used for** | Reveal email after api_search finds a person without one |

---

### 6. Contacts Search (CRM)

```
POST /contacts/search
Body: { "q_keywords": "PhonePe", "per_page": 25, "page": 1 }
```

| | |
|-|-|
| **Cost** | 0 credits |
| **Free plan** | ✅ Yes — but only returns contacts **already saved in your Apollo CRM** |
| **Used for** | Fallback — finds people you've previously added to Apollo manually |
| **Limitation** | Returns nothing for companies you haven't interacted with in Apollo |

---

### Apollo Error Handling

| Status | Meaning | App behavior |
|--------|---------|-------------|
| `200` | Success | Parse normally |
| `401` | Invalid API key | Throws immediately |
| `403` | Plan-gated or insufficient scope | Silently skipped — fallback to Hunter.io |
| `422` | Bad param (title/domain not found) | Tries next title in priority loop |
| `429` | Rate limited | Waits 60s, retries once |
| `"insufficient credits"` in 200 response | Monthly credits exhausted | Treated as failure, falls back to Hunter.io |

---

## Hunter.io API Reference

**Base URL:** `https://api.hunter.io/v2`  
**Auth:** `api_key` query parameter on every request  
**Free plan:** 50 searches/month  
**Signup:** Requires a work/company email (not Gmail/Hotmail)

---

### Domain Search

```
GET /domain-search?domain={domain}&api_key={key}&limit=20
```

Returns all emails Hunter.io has found publicly indexed at a domain, with names and job titles.

```bash
curl "https://api.hunter.io/v2/domain-search?domain=phonepe.com&api_key=YOUR_KEY&limit=20"
```

**Response:**

```json
{
  "data": {
    "domain": "phonepe.com",
    "organization": "PhonePe",
    "emails": [
      {
        "value": "priya.sharma@phonepe.com",
        "first_name": "Priya",
        "last_name": "Sharma",
        "position": "Technical Recruiter",
        "linkedin": "https://linkedin.com/in/priyasharma",
        "confidence": 92,
        "type": "personal"
      }
    ]
  }
}
```

| | |
|-|-|
| **Cost** | 1 search credit per domain |
| **Free plan** | ✅ 50 searches/month |
| **Used for** | Contact discovery fallback when Apollo returns no contacts |
| **Sorting** | App sorts recruiter/hiring manager titles first, then all others |

**Title keywords sorted first** (defined in `lib/hunter.ts`):  
`recruiter`, `talent acquisition`, `talent`, `hiring`, `hr`, `people`, `engineering manager`, `team lead`

---

### Email Finder (available, not currently wired)

```
GET /email-finder?domain={domain}&first_name={first}&last_name={last}&api_key={key}
```

Finds the email for a specific person by name at a domain. Can be used when you already know who you want to contact (e.g. from LinkedIn).

```bash
curl "https://api.hunter.io/v2/email-finder?domain=phonepe.com&first_name=Priya&last_name=Sharma&api_key=YOUR_KEY"
```

---

### Email Verification (available, not currently wired)

```
GET /email-verifier?email={email}&api_key={key}
```

Verifies if an email address is deliverable. Returns `status: valid | invalid | accept_all | unknown`.

---

## Apollo Free Plan — Reality

Based on direct API testing, here is what actually works on Apollo's free plan (120 credits/month):

| Endpoint | Free plan | Cost | Notes |
|----------|-----------|------|-------|
| `organizations/enrich` | ✅ | 1 enrichment credit | Exhausted after ~107 calls in testing |
| `organizations/{id}/job_postings` | ✅ | 1 enrichment credit | Works while enrichment credits available |
| `contacts/search` | ✅ | 0 credits | CRM only — your own saved contacts |
| `mixed_companies/search` | ✅ | Credits vary | Org search fallback |
| **`people/match`** | ❌ | — | **Plan-gated** — 403 on free plan |
| **`mixed_people/api_search`** | ❌ | — | **Plan-gated** — 403 on free plan |

**Credit types on free plan (120/mo total):**

| Type | Monthly limit | Used by this app |
|------|--------------|-----------------|
| Email reveals | 50 | ✅ via people/match (paid only) |
| Enrichment | varies | ✅ org enrich + job postings |
| Mobile/phone | 8 | ❌ explicitly disabled — `reveal_phone_number: false` |
| AI | 0 | ❌ not used |

**Bottom line:** On the free plan, Apollo can only enrich company metadata and read your own CRM. **Contact discovery requires Hunter.io** (or an Apollo paid plan starting at $49/month).

---

## Email Template

Single template at `templates/default-email.txt`. Edit directly — no AI, no dynamic generation.

**Format:**

```
Subject: {{matched_role}} role at {{company}}

Hi {{name}},

I came across an opening for {{matched_role}} at {{company}} and wanted to reach out...

LinkedIn: {{linkedin}}
GitHub: {{github}}
```

**Variables:**

| Variable | Source |
|----------|--------|
| `{{name}}` | Contact's first name |
| `{{company}}` | Company name |
| `{{designation}}` | Contact's job title |
| `{{matched_role}}` | Best matching open role from job postings |
| `{{linkedin}}` | Your LinkedIn URL from `.env` |
| `{{github}}` | Your GitHub URL from `.env` |

---

## Gmail Setup

1. Enable **2-Step Verification**: [myaccount.google.com/security](https://myaccount.google.com/security)
2. Create an **App Password**: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   - App: Mail · Device: Other → name it "SDE Outreach"
   - Copy the 16-character password (no spaces)
3. Add to `.env`:
   ```env
   GMAIL_EMAIL=you@gmail.com
   GMAIL_APP_PASSWORD=abcdabcdabcdabcd
   ```
4. Verify: **Send page** → Gmail status badge → Connected

---

## Project Structure

```
apollo_leads/
├── app/
│   ├── page.tsx                       # Dashboard — upload, pipeline stats
│   ├── recruiters/page.tsx            # Discover — company selection, intel, discovery
│   ├── review/page.tsx                # Review — edit contacts, send flags
│   ├── send/page.tsx                  # Send — Gmail preview + bulk send
│   ├── layout.tsx                     # App shell + sidebar
│   └── api/
│       ├── apollo/
│       │   ├── search/route.ts        # GET: probe | POST: run discovery
│       │   └── company-intel/route.ts # GET: read intel | POST: run intel
│       ├── companies/
│       │   ├── route.ts               # GET/PUT companies
│       │   └── export/route.ts        # Download companies.csv
│       ├── contacts/
│       │   ├── route.ts               # GET/POST contacts
│       │   └── export/route.ts        # Download contacts.csv
│       ├── email/
│       │   ├── preview/route.ts       # Render email for a contact
│       │   └── send/route.ts          # Gmail send + verify
│       └── files/route.ts             # CSV upload + stats
├── components/
│   ├── StatCard.tsx                   # Icon + stat + label card
│   ├── Sidebar.tsx                    # 4-step navigation
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Badge.tsx
│   ├── PageHeader.tsx
│   └── CsvUploadCard.tsx              # Drag-and-drop upload zone
├── lib/
│   ├── apollo.ts                      # Discovery pipeline — main logic
│   ├── apollo-client.ts               # HTTP fetch wrapper + X-Api-Key auth
│   ├── apollo-capabilities.ts         # Endpoint probe + 5-min cache
│   ├── hunter.ts                      # Hunter.io domain-search fallback
│   ├── company-intel.ts               # Company intel pipeline
│   ├── csv.ts                         # CSV read / write / merge / dedupe
│   ├── discovery-summary.ts           # Rollup stats from discovery results
│   ├── email-quality.ts               # Email quality assessment
│   ├── gmail.ts                       # Nodemailer Gmail transport
│   ├── scoring.ts                     # Contact score + job matching
│   ├── template.ts                    # Email template rendering
│   └── validation.ts                  # Email address validation
├── data/                              # Server-side CSV storage (gitignored)
│   ├── companies.csv
│   ├── contacts.csv
│   └── company_intel.csv
├── scripts/
│   ├── test-apollo-email.mjs          # CLI: probe Apollo endpoints
│   └── fetch-person.mjs               # CLI: fetch one person by name
├── templates/
│   └── default-email.txt             # Email subject + body
├── .env                               # Secrets (gitignored)
├── .env.example                       # Template — copy to .env
├── package.json
└── Readme.md
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Apollo returns no contacts | Free plan — `people/match` + `api_search` both require paid plan | Add `HUNTER_API_KEY` to `.env` |
| "insufficient credits" from Apollo | Monthly enrichment credits exhausted (120/mo) | Wait for monthly reset, or upgrade Apollo |
| Hunter.io returns only Sales roles | No recruiter/EM indexed at that domain | Add contacts manually on Review page |
| 403 on all Apollo people endpoints | Free plan restriction | Expected — Hunter.io handles this |
| 401 Invalid API key | Wrong key in `.env` | Regenerate at apollo.io → Settings → API Keys |
| Upload fails | CSV missing `company_name` column | Check header row format |
| Gmail not connected | Wrong App Password or 2FA not enabled | Follow [Gmail Setup](#gmail-setup) |
| Send button disabled | `send_email ≠ YES` or `status ≠ PENDING` or missing email | Fix on Review page |
| Mobile credits used unexpectedly | Old code without phone disable flags | All calls now have `reveal_phone_number: false` + `run_waterfall_phone: false` |
| Next.js cache stale | After many code changes | `rm -rf .next && npm run dev` |

---

## Out of Scope

- Multi-user support or authentication
- AI email personalisation
- LinkedIn scraping
- Follow-up automation
- Open/click tracking
- Cloud deployment without persistent volume
- CRM integrations
