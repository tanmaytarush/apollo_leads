#!/usr/bin/env node
/**
 * Fetch a specific person by name from a company via Apollo people/match.
 * Writes the contact to data/contacts.csv and prints the email preview.
 *
 * Usage:
 *   node scripts/fetch-person.mjs --company CoinDCX --domain coindcx.com --first Virat --last Tomer
 */

import fs from "fs";
import path from "path";

const APOLLO_BASE = "https://api.apollo.io/api/v1";

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}

function parseArgs(argv) {
  const args = { company: "CoinDCX", domain: "coindcx.com", first: "Virat", last: "Tomer" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--company" && argv[i + 1]) args.company = argv[++i];
    if (argv[i] === "--domain"  && argv[i + 1]) args.domain  = argv[++i];
    if (argv[i] === "--first"   && argv[i + 1]) args.first   = argv[++i];
    if (argv[i] === "--last"    && argv[i + 1]) args.last    = argv[++i];
  }
  return args;
}

async function apolloFetch(apiKey, endpoint, options = {}) {
  const resp = await fetch(`${APOLLO_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      accept: "application/json",
      "X-Api-Key": apiKey,
      ...options.headers,
    },
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

function inferContactType(title = "") {
  const t = title.toLowerCase();
  if (/talent acquisition|recruiter/.test(t)) return "Recruiter";
  if (/director.*eng/.test(t)) return "Director";
  if (/engineering manager|hiring manager|team lead/.test(t)) return "Manager";
  return "Manager";
}

function assessEmailQuality(email = "", name = "") {
  if (!email) return "missing";
  const local = email.split("@")[0].toLowerCase();
  const nameParts = name.toLowerCase().split(/\s+/);
  const looksPersonal = nameParts.some((p) => p.length > 2 && local.includes(p));
  if (looksPersonal) return "good";
  if (/^(info|hello|contact|hr|careers|recruit)/.test(local)) return "generic";
  return "ok";
}

const CONTACTS_PATH = path.join(process.cwd(), "data", "contacts.csv");
const COMPANIES_PATH = path.join(process.cwd(), "data", "companies.csv");

const CONTACT_COLUMNS = [
  "company_name","person_name","designation","email","linkedin_url",
  "contact_type","source","contact_score","matching_role_found",
  "matched_job_title","email_quality","send_email","special_mail","status","notes",
];

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8").trim();
  if (!content) return [];
  const lines = content.split("\n");
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? "").trim()]));
  });
}

function writeCsv(filePath, rows, columns) {
  const header = columns.join(",");
  const body = rows.map(row => columns.map(col => (row[col] ?? "").replace(/,/g, ";")).join(",")).join("\n");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, header + "\n" + body, "utf-8");
}

function upsertContact(newContact) {
  const existing = readCsv(CONTACTS_PATH);
  const key = (c) => {
    if (c.email) return `${c.company_name.toLowerCase()}|${c.email.toLowerCase()}`;
    return `${c.company_name.toLowerCase()}|${c.person_name.toLowerCase()}`;
  };
  const map = new Map(existing.map(c => [key(c), c]));
  map.set(key(newContact), newContact);
  writeCsv(CONTACTS_PATH, Array.from(map.values()), CONTACT_COLUMNS);
  return Array.from(map.values()).length;
}

function ensureCompany(companyName, domain) {
  const existing = readCsv(COMPANIES_PATH);
  const found = existing.find(c => c.company_name.toLowerCase() === companyName.toLowerCase());
  if (!found) {
    existing.push({ company_name: companyName, domain });
    fs.mkdirSync(path.dirname(COMPANIES_PATH), { recursive: true });
    fs.writeFileSync(
      COMPANIES_PATH,
      "company_name,domain\n" + existing.map(c => `${c.company_name},${c.domain}`).join("\n"),
      "utf-8"
    );
    console.log(`✓ Added ${companyName} (${domain}) to companies.csv`);
  } else {
    console.log(`  ${companyName} already in companies.csv`);
  }
}

function renderEmail(contact, linkedin, github) {
  const name = contact.person_name.split(" ")[0] || contact.person_name;
  const template = fs.readFileSync(path.join(process.cwd(), "templates", "default-email.txt"), "utf-8");
  const lines = template.split("\n");
  const subjectLine = lines.find(l => l.startsWith("Subject:"));
  const subjectTmpl = subjectLine ? subjectLine.replace(/^Subject:\s*/, "").trim() : "Opportunity at {{company}}";
  const bodyStart = subjectLine ? lines.indexOf(subjectLine) + 1 : 0;
  const bodyTmpl = lines.slice(bodyStart).join("\n").trim();

  const ctx = {
    name,
    company: contact.company_name,
    designation: contact.designation || "",
    matched_role: contact.matched_job_title || "Software Engineer",
    linkedin,
    github,
  };
  const render = (t) =>
    t.replace(/\{\{name\}\}/g, ctx.name)
     .replace(/\{\{company\}\}/g, ctx.company)
     .replace(/\{\{designation\}\}/g, ctx.designation)
     .replace(/\{\{matched_role\}\}/g, ctx.matched_role)
     .replace(/\{\{linkedin\}\}/g, ctx.linkedin)
     .replace(/\{\{github\}\}/g, ctx.github);

  return { subject: render(subjectTmpl), body: render(bodyTmpl) };
}

async function main() {
  loadEnvFile();

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) { console.error("Missing APOLLO_API_KEY in .env"); process.exit(1); }

  const { company, domain, first, last } = parseArgs(process.argv.slice(2));

  console.log(`\nFetching ${first} ${last} @ ${company} (${domain}) via Apollo\n`);

  // Step 1: Ensure CoinDCX is in companies.csv
  ensureCompany(company, domain);

  // Step 2: Org enrich to get Apollo org_id
  let orgId = "";
  try {
    const data = await apolloFetch(apiKey, `/organizations/enrich?domain=${encodeURIComponent(domain)}`, { method: "GET" });
    orgId = data.organization?.id ?? "";
    const orgName = data.organization?.name ?? company;
    console.log(`✓ Org enrich — id: ${orgId} | name: ${orgName}`);
  } catch (err) {
    console.log(`✗ Org enrich failed: ${err.message}`);
  }

  // Step 3: People/match by first+last name + org
  let person = null;
  const matchPayload = {
    first_name: first,
    last_name: last,
    reveal_personal_emails: false,
    reveal_phone_number: false,
  };
  if (orgId) matchPayload.organization_id = orgId;
  else {
    matchPayload.organization_name = company;
    matchPayload.domain = domain;
  }

  try {
    const data = await apolloFetch(apiKey, "/people/match", {
      method: "POST",
      body: JSON.stringify(matchPayload),
    });
    person = data.person ?? null;
    if (person) {
      console.log(`✓ people/match found: ${person.first_name} ${person.last_name}`);
      console.log(`  title    : ${person.title ?? "—"}`);
      console.log(`  email    : ${person.email ?? "(not returned — no credit charged)"}`);
      console.log(`  linkedin : ${person.linkedin_url ?? "—"}`);
    } else {
      console.log("✗ people/match returned no person for this name");
    }
  } catch (err) {
    console.log(`✗ people/match failed: ${err.message}`);
  }

  // Step 4: Build contact row (use found data or fallback to known info)
  const personName = person
    ? `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim()
    : `${first} ${last}`;
  const designation = person?.title ?? "";
  const email = person?.email ?? "";
  const linkedin = person?.linkedin_url ?? "";
  const emailQuality = assessEmailQuality(email, personName);
  const contactType = inferContactType(designation);

  const contact = {
    company_name: company,
    person_name: personName,
    designation,
    email,
    linkedin_url: linkedin,
    contact_type: contactType,
    source: person ? "apollo_match" : "manual",
    contact_score: email ? "10" : "5",
    matching_role_found: "YES",
    matched_job_title: "Backend Engineer",
    email_quality: emailQuality,
    send_email: email ? "YES" : "NO",
    special_mail: "NO",
    status: "PENDING",
    notes: email ? "" : "Add email on Review page to enable sending",
  };

  const total = upsertContact(contact);
  console.log(`\n✓ Contact saved to contacts.csv (${total} total)`);
  console.log(`  send_email: ${contact.send_email} | email_quality: ${emailQuality}`);

  // Step 5: Render and print email preview
  const linkedin_url = process.env.LINKEDIN_URL ?? "";
  const github_url = process.env.GITHUB_URL ?? "";
  const preview = renderEmail(contact, linkedin_url, github_url);

  console.log("\n" + "=".repeat(60));
  console.log("EMAIL PREVIEW");
  console.log("=".repeat(60));
  console.log(`To      : ${email || "(no email — add on Review page)"}`);
  console.log(`Subject : ${preview.subject}`);
  console.log("Body    :");
  console.log(preview.body);

  if (!email) {
    console.log("\n⚠ No email found. Open http://localhost:3000/review to add it, then send from /send.");
  } else {
    console.log("\n✓ Ready to send. Open http://localhost:3000/send and hit Send.");
  }
}

main().catch(err => { console.error("\nFatal:", err.message); process.exit(1); });
