Recruiter Outreach Automation Tool

Overview

Build a local-first Next.js application that automates recruiter discovery and job outreach.

The application is intended for personal use only.

The goal is to:

1. Upload a list of target companies.
2. Discover recruiters and hiring managers using Apollo.
3. Store discovered contacts in a CSV file.
4. Review contacts manually.
5. Mark which contacts should receive emails.
6. Send emails using a predefined template.
7. Send emails from my existing Gmail account.
8. Track email status through CSV files.

No database is required.

No authentication is required.

No AI generation is required.

No cloud deployment is required.

The application will run locally.

⸻

Tech Stack

Frontend:

* Next.js 15
* TypeScript
* TailwindCSS

Integrations:

* Apollo API
* Gmail SMTP (via Nodemailer)

Storage:

* CSV Files

⸻

Core Workflow

Step 1 - Upload Companies

Input file:

companies.csv

Example:

company_name

Groww

Razorpay

PhonePe

Juspay

⸻

Step 2 - Recruiter Discovery

For every company:

Search Apollo.

Retrieve:

* Technical Recruiters
* Recruiters
* Talent Acquisition Specialists
* Hiring Managers
* Engineering Managers
* Team Leads

Store results into contacts.csv.

⸻

Step 3 - Manual Review

User reviews all contacts.

User may:

* Remove incorrect contacts
* Remove duplicate contacts
* Add contacts manually
* Edit contact information

No emails are sent automatically.

⸻

Step 4 - Mark Contacts

User marks contacts inside contacts.csv.

Columns:

send_email

special_mail

Examples:

YES

NO

⸻

send_email

Purpose:

Determines whether an email should be sent.

Values:

YES

NO

⸻

special_mail

Purpose:

Indicates that this contact will be handled manually.

Values:

YES

NO

If special_mail = YES, the system must skip the contact.

⸻

Step 5 - Send Emails

Read contacts.csv.

Only process rows where:

send_email = YES

special_mail = NO

status = PENDING

Send email using Gmail SMTP.

⸻

Step 6 - Update Status

After sending:

status = SENT

If sending fails:

status = FAILED

⸻

CSV Structure

contacts.csv

Columns:

company_name

person_name

designation

email

linkedin_url

contact_type

send_email

special_mail

status

Example:

Groww,
John Doe,
Technical Recruiter,
john@groww.in,
https://linkedin.com/in/johndoe,
Recruiter,
YES,
NO,
PENDING

⸻

Email Template

The application must use a single reusable email template.

Template file:

templates/default-email.txt

The template supports variables.

Supported variables:

{{name}}

{{company}}

{{designation}}

{{linkedin}}

{{github}}

Example:

Subject: Software Engineer Opportunities at {{company}}

Hi {{name}},

I hope you’re doing well.

I am reaching out regarding Software Engineer opportunities at {{company}}.

I have experience building backend systems, AI-powered applications, and scalable software using Python, FastAPI, AWS, and modern AI frameworks.

Some recent work includes:

* Building production-grade RAG systems
* Developing backend APIs
* Working on AI and machine learning solutions

I would love to explore whether my background aligns with any current or upcoming opportunities at {{company}}.

Thank you for your time and consideration.

Best Regards,

Tanmay Dikshit

LinkedIn: {{linkedin}}

GitHub: {{github}}

⸻

Gmail Integration

Use Nodemailer.

Use Gmail SMTP.

Emails must be sent from my existing Gmail account.

Configuration:

GMAIL_EMAIL

GMAIL_APP_PASSWORD

Use Gmail App Password authentication.

Do not use Resend.

Do not use SendGrid.

Do not use Mailgun.

Do not use AWS SES.

⸻

Application Pages

Home Page

Features:

* Upload companies.csv
* Upload contacts.csv
* View current files
* Navigation links

⸻

Recruiter Discovery Page

Features:

* Load companies.csv
* Call Apollo API
* Discover recruiters and managers
* Display results in table
* Export contacts.csv

Table Columns:

* Company
* Name
* Designation
* Email
* LinkedIn
* Contact Type

⸻

Contact Review Page

Features:

* Load contacts.csv
* Display editable table
* Edit fields
* Update send_email
* Update special_mail
* Save CSV

Columns:

* Company
* Name
* Designation
* Email
* Contact Type
* Send Email
* Special Mail
* Status

⸻

Send Emails Page

Features:

* Load contacts.csv
* Preview generated email
* Send selected emails
* Update status

Display:

* Company
* Name
* Email
* Status

Buttons:

* Preview Email
* Send Selected
* Refresh

⸻

Project Structure

/app

/page.tsx

/recruiters/page.tsx

/review/page.tsx

/send/page.tsx

/app/api

/apollo/search/route.ts

/email/send/route.ts

/lib

/apollo.ts

/gmail.ts

/csv.ts

/data

/companies.csv

/contacts.csv

/templates

/default-email.txt

⸻

Environment Variables

APOLLO_API_KEY=

GMAIL_EMAIL=

GMAIL_APP_PASSWORD=

LINKEDIN_URL=

GITHUB_URL=

⸻

Non Goals

Do not build:

* Authentication
* User accounts
* Databases
* AI personalization
* OpenAI integration
* CRM functionality
* Campaign management
* Follow-up automation
* Multi-user support
* Analytics

These are out of scope.

⸻

Success Criteria

The application is successful if it can:

1. Import a list of companies.
2. Discover recruiters through Apollo.
3. Export contacts into CSV.
4. Allow manual review.
5. Allow contact selection.
6. Send emails from my Gmail account.
7. Update contact status after sending.

The entire application must run locally through:

npm install

npm run dev