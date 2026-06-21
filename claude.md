# cold-email-tool — Claude Code reference

Drop this file in the repo root. Claude Code reads it automatically every session.

---

## What this repo does

CSV of companies → Apollo API (enrich + job postings + people match) → Hunter.io (verify email) → Claude API (personalise email) → Gmail API (send).

**Single purpose:** find a recruiter or engineer at each company and send a personalised cold email referencing any open SDE/MLE role.

---

## File map

```
cold-email-tool/
├── main.py          # CLI entrypoint, orchestrates full pipeline per company
├── apollo.py        # Apollo API calls — THIS IS THE PRIMARY FILE TO CHANGE
├── hunter.py        # Hunter.io fallback for email verification
├── composer.py      # Claude API — generates personalised email text
├── gmail_sender.py  # Gmail API — send or draft
├── config.py        # Config loader + validator
├── config.example.json   # Copy to config.json and fill in keys
├── companies.example.csv # Input format example
└── requirements.txt
```

---

## Apollo API — full reference

**Base URL:** `https://api.apollo.io/v1`  
**Auth:** pass `api_key` in every JSON request body (not headers).  
**Free plan:** 75 credits/month. Credits consumed only by enrichment calls (see costs below).

### Endpoints available on free plan

#### 1. Org enrich — `POST /organizations/enrich`
Cost: 0 credits. Returns company metadata.

```python
import requests

resp = requests.post(
    "https://api.apollo.io/v1/organizations/enrich",
    json={
        "api_key": "YOUR_KEY",
        "domain": "razorpay.com",      # use domain if available
        "name": "Razorpay",            # fallback if no domain
    },
    headers={"Content-Type": "application/json", "Cache-Control": "no-cache"},
    timeout=15,
)

org = resp.json()["organization"]
# Key fields:
# org["id"]                  → Apollo org ID — needed for all other calls
# org["name"]                → "Razorpay"
# org["primary_domain"]      → "razorpay.com"
# org["industry"]            → "Financial Services"
# org["estimated_num_employees"] → 5000
# org["short_description"]   → company blurb (use in email personalisation)
# org["linkedin_url"]        → "https://linkedin.com/company/razorpay"
```

#### 2. Job postings — `POST /v1/organizations/{org_id}/job_postings`
Cost: 1 credit per call. Returns open roles.

```python
resp = requests.get(
    f"https://api.apollo.io/v1/organizations/{org['id']}/job_postings",
    params={"api_key": "YOUR_KEY"},
    headers={"Cache-Control": "no-cache"},
    timeout=15,
)

data = resp.json()
jobs = data.get("job_postings", [])

# Each job dict:
# job["title"]          → "Senior Backend Engineer"
# job["url"]            → direct job posting URL
# job["location"]       → "Bengaluru, India"
# job["posted_at"]      → "2025-06-01"
# job["employment_type"]→ "full_time"
```

**Note:** endpoint path changed from `/v1/jobs/search` (old, broken) to `/v1/organizations/{id}/job_postings` (current). The current `apollo.py` uses the old path — fix this first.

#### 3. People match — `POST /v1/people/match`
Cost: 1 credit per matched person with verified email. **This is the key unlock — replaces Hunter.io as primary.**

```python
resp = requests.post(
    "https://api.apollo.io/v1/people/match",
    json={
        "api_key": "YOUR_KEY",
        "organization_id": org["id"],     # from org enrich
        "title": "recruiter",             # optional — improves targeting
        "reveal_personal_emails": False,  # True costs extra credits
        "reveal_phone_number": False,
    },
    headers={"Content-Type": "application/json", "Cache-Control": "no-cache"},
    timeout=15,
)

data = resp.json()
person = data.get("person")

# person["id"]              → Apollo person ID
# person["first_name"]      → "Priya"
# person["last_name"]       → "Sharma"
# person["name"]            → "Priya Sharma"
# person["email"]           → "priya.sharma@razorpay.com" (if revealed)
# person["title"]           → "Senior Talent Acquisition"
# person["linkedin_url"]    → "https://linkedin.com/in/priyasharma"
# person["organization"]["name"] → "Razorpay"
```

**Targeting strategy — pass `title` in priority order:**
```python
TITLE_PRIORITY = [
    "talent acquisition",
    "recruiter",
    "technical recruiter",
    "hr",
    "engineering manager",
    "tech lead",
    "senior software engineer",  # last resort
]

# Loop through until a person with email is returned
for title in TITLE_PRIORITY:
    resp = requests.post(..., json={..., "title": title})
    person = resp.json().get("person")
    if person and person.get("email"):
        break
```

**Credit cost control:** only spend a credit when email is returned. If `person["email"]` is `None`, Apollo did not charge a credit. Check before assuming credit was spent.

#### 4. Bulk people match — `POST /v1/people/bulk_match`
Cost: 1 credit per matched person. Batch up to 10 at once. Use this to process multiple companies in one call.

```python
resp = requests.post(
    "https://api.apollo.io/v1/people/bulk_match",
    json={
        "api_key": "YOUR_KEY",
        "details": [
            {"organization_id": org_id_1, "title": "recruiter"},
            {"organization_id": org_id_2, "title": "talent acquisition"},
        ],
        "reveal_personal_emails": False,
    },
    headers={"Content-Type": "application/json"},
    timeout=30,
)

matches = resp.json().get("matches", [])
# List of person dicts, same shape as people/match above
```

#### 5. Org search — `POST /v1/mixed_companies/search`
Cost: 1 credit per result. **Avoid on free plan** — burns credits fast. Only use if you don't have company names/domains already.

```python
# Only use if CSV has no domain/name and you need discovery
resp = requests.post(
    "https://api.apollo.io/v1/mixed_companies/search",
    json={
        "api_key": "YOUR_KEY",
        "q_organization_keyword_tags": ["fintech", "b2b saas"],
        "organization_locations": ["India"],
        "organization_num_employees_ranges": ["1001,5000"],
        "page": 1,
        "per_page": 10,
    },
    ...
)
```

---

## What needs to change in `apollo.py`

Current state of `apollo.py` has two problems:

**Problem 1:** `get_job_postings` uses the wrong endpoint `/v1/jobs/search`.  
**Fix:** Change to `GET /v1/organizations/{org_id}/job_postings`.

**Problem 2:** `apollo.py` has no `match_person` function.  
**Fix:** Add it. This replaces `hunter.py` as the primary contact finder.

### Exact changes Claude Code should make

```
In apollo.py:

1. Fix get_job_postings:
   - Change method from POST to GET
   - Change URL from /v1/jobs/search to /v1/organizations/{org_id}/job_postings
   - Change payload to query params: {"api_key": api_key}
   - Change response key from "jobs" to "job_postings"

2. Add match_person(org_id, api_key, title_priority=None) -> dict | None:
   - POST to /v1/people/match
   - Loop through title_priority list until a person with email is returned
   - Return dict: {name, email, title, linkedin_url, apollo_id}
   - Return None if no email found after all titles tried
   - Log credits consumed (count calls where email was returned)

3. Add bulk_match_people(org_ids, api_key, title="recruiter") -> list[dict]:
   - POST to /v1/people/bulk_match
   - Batch org_ids in groups of 10
   - Return list of person dicts
```

### Changes Claude Code should make in `main.py`

```
In process_company():

Current flow:
  Apollo enrich → Apollo job postings → Hunter find_contact → compose → send

New flow:
  Apollo enrich → Apollo job postings → Apollo match_person (primary)
               → if no email: Hunter find_contact (fallback, uses Hunter credits)
               → compose → send

Update result dict to include: apollo_credits_used (int), contact_source ("apollo"|"hunter"|"none")
```

### Changes Claude Code should make in `config.py`

```
Add optional "hunter_api_key" — hunter is now fallback only, not required.
If hunter_api_key is missing, skip Hunter fallback silently and log "no fallback configured".
```

---

## Credit budget logic to implement

```python
# Target: stay within 75 free credits/month
# job_postings = 1 credit per company
# people/match = 1 credit per successful email match
# worst case per company = 2 credits (1 job posting + 1 match)
# budget = 75 credits → ~37 companies/month fully automated

# Add to main.py:
credits_used = 0
CREDIT_LIMIT = int(cfg.get("apollo_credit_limit", 75))

# Before each Apollo credit-consuming call:
if credits_used >= CREDIT_LIMIT:
    console.print("[yellow]Apollo credit limit reached — stopping.[/yellow]")
    break

# After each successful people/match that returns email:
credits_used += 1
```

---

## Response error handling reference

| Status | Meaning | What to do |
|--------|---------|------------|
| `200` | Success | Parse normally |
| `400` | Bad request | Log payload and skip company |
| `401` | Invalid API key | Raise RuntimeError immediately |
| `403` | Plan-gated or key scope missing | Log warning, skip endpoint gracefully |
| `422` | Unprocessable (bad domain/name) | Return None, skip company |
| `429` | Rate limited | `time.sleep(60)` then retry once |

---

## Run commands

```bash
# Install deps
pip install -r requirements.txt

# Dry run — prints emails, sends nothing
python main.py companies.csv --dry-run

# Draft mode — saves to Gmail drafts  
python main.py companies.csv --draft

# Live send
python main.py companies.csv

# Limit Apollo credits this run
python main.py companies.csv --credit-limit 20
```

---

## Claude Code tasks — copy-paste ready

Open your terminal in this repo, run `claude`, then paste any of these:

**Fix the broken job postings endpoint:**
```
In apollo.py, fix get_job_postings — change it from POST /v1/jobs/search 
to GET /v1/organizations/{org_id}/job_postings with api_key as a query param, 
and change the response key from "jobs" to "job_postings".
```

**Add people match as primary contact finder:**
```
In apollo.py, add a match_person(org_id, api_key, title_priority=None) function 
that POSTs to /v1/people/match, loops through title_priority titles until it gets 
a person with a non-null email, and returns {name, email, title, linkedin_url}. 
Use TITLE_PRIORITY = ["talent acquisition", "recruiter", "technical recruiter", 
"hr", "engineering manager", "tech lead"].
```

**Wire Apollo people match into the pipeline:**
```
In main.py, update process_company() so it calls apollo.match_person() as the 
primary contact source after org enrich and job postings. Only fall back to 
hunter.find_contact() if match_person returns None. Add contact_source field 
to the result dict ("apollo", "hunter", or "none").
```

**Add credit tracking:**
```
In main.py, add a credits_used counter that increments each time apollo.match_person 
returns a non-None result, and each time get_job_postings succeeds. Add a 
--credit-limit CLI flag (default 75) that stops the pipeline when the limit is hit 
and prints remaining companies to a skipped.csv.
```

**Full integration in one shot:**
```
Update this cold-email-tool to use Apollo people/match as the primary contact finder:
1. Fix apollo.py get_job_postings to use GET /v1/organizations/{org_id}/job_postings
2. Add apollo.py match_person() using POST /v1/people/match with title priority loop
3. Update main.py process_company() to call match_person first, hunter second
4. Add credit_used tracking and --credit-limit flag to main.py
5. Make hunter_api_key optional in config.py
Run the existing tests after each change.
```

---

## Environment

- Python 3.11+
- All secrets in `config.json` (gitignored) — never hardcode keys
- `config.example.json` is the template — keep it in sync when adding new config keys
- No virtual env needed — install globally or use `pip install -r requirements.txt`