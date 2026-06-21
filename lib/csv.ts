import fs from "fs/promises";
import path from "path";
import Papa from "papaparse";
import { isValidEmail } from "./validation";

export interface Contact {
  company_name: string;
  person_name: string;
  designation: string;
  linkedin_url: string;
  email: string;
  contact_type: string;
  source: string;
  contact_score: string;
  matching_role_found: string;
  matched_job_title: string;
  email_quality: string;
  send_email: string;
  special_mail: string;
  status: string;
  notes: string;
}

export interface Company {
  company_name: string;
  domain: string;
}

export const CONTACT_COLUMNS: (keyof Contact)[] = [
  "company_name",
  "person_name",
  "designation",
  "email",
  "linkedin_url",
  "contact_type",
  "source",
  "contact_score",
  "matching_role_found",
  "matched_job_title",
  "email_quality",
  "send_email",
  "special_mail",
  "status",
  "notes",
];

export const COMPANY_COLUMNS: (keyof Company)[] = ["company_name", "domain"];

// DATA_DIR is configurable for Docker/VPS deploys (e.g. DATA_DIR=/var/data/apollo-leads)
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const COMPANIES_PATH = path.join(DATA_DIR, "companies.csv");
const CONTACTS_PATH = path.join(DATA_DIR, "contacts.csv");

let writeLock: Promise<void> = Promise.resolve();

async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeLock.then(fn, fn);
  writeLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function contactKey(contact: Contact): string {
  const company = contact.company_name.toLowerCase().trim();
  const email = contact.email.toLowerCase().trim();
  const name = contact.person_name.toLowerCase().trim();
  const linkedin = contact.linkedin_url.toLowerCase().trim();

  if (email) return `${company}|${email}`;
  if (linkedin) return `${company}|${name}|${linkedin}`;
  return `${company}|${name}`;
}

function mergeSources(a: string, b: string): string {
  const parts = new Set(
    `${a}+${b}`
      .split("+")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return Array.from(parts).join("+");
}

function mergeContact(existing: Contact, incoming: Contact): Contact {
  const email = incoming.email || existing.email;
  const emailQuality =
    incoming.email && incoming.email !== existing.email
      ? incoming.email_quality
      : existing.email_quality || incoming.email_quality;

  return {
    company_name: incoming.company_name || existing.company_name,
    person_name: incoming.person_name || existing.person_name,
    designation: incoming.designation || existing.designation,
    linkedin_url: incoming.linkedin_url || existing.linkedin_url,
    email,
    contact_type: incoming.contact_type || existing.contact_type,
    source: mergeSources(existing.source, incoming.source),
    contact_score: String(
      Math.max(Number(existing.contact_score || 0), Number(incoming.contact_score || 0))
    ),
    matching_role_found:
      existing.matching_role_found === "YES" || incoming.matching_role_found === "YES"
        ? "YES"
        : "NO",
    matched_job_title: incoming.matched_job_title || existing.matched_job_title,
    email_quality: emailQuality,
    send_email: existing.send_email,
    special_mail: existing.special_mail,
    status: existing.status,
    notes: existing.notes || incoming.notes,
  };
}

export function mergeContactLists(
  existing: Contact[],
  incoming: Contact[]
): Contact[] {
  const map = new Map<string, Contact>();

  for (const contact of existing.map(normalizeContact)) {
    if (!contact.email && !contact.person_name && !contact.company_name) continue;
    map.set(contactKey(contact), contact);
  }

  for (const contact of incoming.map(normalizeContact)) {
    if (!contact.email && !contact.person_name && !contact.company_name) continue;
    const prev = map.get(contactKey(contact));
    map.set(contactKey(contact), prev ? mergeContact(prev, contact) : contact);
  }

  return Array.from(map.values());
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function normalizeYesNo(value: string | undefined, defaultValue = "NO"): string {
  const v = (value ?? defaultValue).trim().toUpperCase();
  return v === "YES" ? "YES" : "NO";
}

function normalizeStatus(value: string | undefined): string {
  const v = (value ?? "PENDING").trim().toUpperCase();
  if (v === "SENT" || v === "FAILED" || v === "SKIPPED") return v;
  return "PENDING";
}

function normalizeContact(row: Partial<Contact>): Contact {
  return {
    company_name: (row.company_name ?? "").trim(),
    person_name: (row.person_name ?? "").trim(),
    designation: (row.designation ?? "").trim(),
    linkedin_url: (row.linkedin_url ?? "").trim(),
    email: (row.email ?? "").trim(),
    contact_type: (row.contact_type ?? "").trim(),
    source: (row.source ?? "").trim(),
    contact_score: (row.contact_score ?? "0").trim(),
    matching_role_found: normalizeYesNo(row.matching_role_found, "NO"),
    matched_job_title: (row.matched_job_title ?? "").trim(),
    email_quality: (row.email_quality ?? "missing").trim(),
    send_email: normalizeYesNo(row.send_email, "NO"),
    special_mail: normalizeYesNo(row.special_mail, "NO"),
    status: normalizeStatus(row.status),
    notes: (row.notes ?? "").trim(),
  };
}

function contactsToCsv(contacts: Contact[]): string {
  return Papa.unparse(contacts, { columns: CONTACT_COLUMNS });
}

function companiesToCsv(companies: Company[]): string {
  return Papa.unparse(companies, { columns: COMPANY_COLUMNS });
}

function parseCsv<T>(content: string): T[] {
  const result = Papa.parse<T>(content, {
    header: true,
    skipEmptyLines: true,
    delimiter: ",",
    transformHeader: (h) => h.trim(),
  });

  const fatalErrors = result.errors.filter(
    (e) => e.type !== "Delimiter" && e.code !== "UndetectableDelimiter"
  );
  if (fatalErrors.length > 0) {
    throw new Error(fatalErrors.map((e) => e.message).join("; "));
  }

  return result.data;
}

function parseSimpleCompanyList(content: string): Company[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const startIndex =
    lines[0].toLowerCase().replace(/[^a-z_]/g, "") === "companyname" ? 1 : 0;

  return lines.slice(startIndex).map((line) => {
    const value = line.split(",")[0]?.trim() ?? line.trim();
    const domain = line.split(",")[1]?.trim() ?? "";
    return { company_name: value, domain };
  });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function getCompaniesPath() {
  return COMPANIES_PATH;
}

export async function getContactsPath() {
  return CONTACTS_PATH;
}

export async function readCompanies(): Promise<Company[]> {
  await ensureDataDir();
  if (!(await fileExists(COMPANIES_PATH))) return [];
  const content = await fs.readFile(COMPANIES_PATH, "utf-8");

  let rows: { company_name?: string; domain?: string }[];
  try {
    rows = parseCsv<{ company_name?: string; domain?: string }>(content);
  } catch {
    rows = parseSimpleCompanyList(content);
  }

  const companies = rows
    .map((r) => ({
      company_name: (r.company_name ?? "").trim(),
      domain: (r.domain ?? "").trim(),
    }))
    .filter((r) => r.company_name.length > 0);

  if (companies.length === 0) {
    return parseSimpleCompanyList(content).filter((r) => r.company_name.length > 0);
  }

  return companies;
}

export async function writeCompanies(companies: Company[]): Promise<void> {
  await withWriteLock(async () => {
    await ensureDataDir();
    const unique = Array.from(
      new Map(
        companies
          .map((c) => ({
            company_name: c.company_name.trim(),
            domain: (c.domain ?? "").trim(),
          }))
          .filter((c) => c.company_name.length > 0)
          .map((c) => [c.company_name.toLowerCase(), c])
      ).values()
    );
    await fs.writeFile(COMPANIES_PATH, companiesToCsv(unique), "utf-8");
  });
}

export async function readContacts(): Promise<Contact[]> {
  await ensureDataDir();
  if (!(await fileExists(CONTACTS_PATH))) return [];
  const content = await fs.readFile(CONTACTS_PATH, "utf-8");
  if (!content.trim()) return [];

  const rows = parseCsv<Partial<Contact>>(content);
  return rows
    .map(normalizeContact)
    .filter((c) => c.person_name || c.email || c.company_name);
}

export async function writeContacts(contacts: Contact[]): Promise<void> {
  await withWriteLock(async () => {
    await ensureDataDir();
    const normalized = contacts.map(normalizeContact);
    await fs.writeFile(CONTACTS_PATH, contactsToCsv(normalized), "utf-8");
  });
}

export async function appendContacts(newContacts: Contact[]): Promise<Contact[]> {
  const existing = await readContacts();
  const merged = mergeContactLists(existing, newContacts);
  await writeContacts(merged);
  return merged;
}

export function dedupeContacts(contacts: Contact[]): Contact[] {
  const seen = new Map<string, Contact>();
  for (const contact of contacts.map(normalizeContact)) {
    if (!contact.email && !contact.person_name && !contact.company_name) continue;
    seen.set(contactKey(contact), contact);
  }
  return Array.from(seen.values());
}

export async function getFileStats() {
  await ensureDataDir();
  const companiesExists = await fileExists(COMPANIES_PATH);
  const contactsExists = await fileExists(CONTACTS_PATH);

  let companiesCount = 0;
  let contactsCount = 0;
  let companiesModified: string | null = null;
  let contactsModified: string | null = null;

  if (companiesExists) {
    const companies = await readCompanies();
    companiesCount = companies.length;
    const stat = await fs.stat(COMPANIES_PATH);
    companiesModified = stat.mtime.toISOString();
  }

  if (contactsExists) {
    const contacts = await readContacts();
    contactsCount = contacts.length;
    const stat = await fs.stat(CONTACTS_PATH);
    contactsModified = stat.mtime.toISOString();
  }

  const contacts = contactsExists ? await readContacts() : [];
  const emailsPending = contacts.filter(
    (c) =>
      c.send_email === "YES" &&
      c.special_mail === "NO" &&
      c.status === "PENDING" &&
      isValidEmail(c.email)
  ).length;
  const emailsSent = contacts.filter((c) => c.status === "SENT").length;

  return {
    companies: {
      exists: companiesExists,
      count: companiesCount,
      modified: companiesModified,
      source: "upload" as const,
    },
    contacts: {
      exists: contactsExists,
      count: contactsCount,
      modified: contactsModified,
      source: "upload" as const,
    },
    outreach: {
      emailsPending,
      emailsSent,
    },
  };
}

export function parseCompaniesCsv(content: string): Company[] {
  try {
    const rows = parseCsv<{ company_name?: string; domain?: string }>(content);
    const companies = rows
      .map((r) => ({
        company_name: (r.company_name ?? "").trim(),
        domain: (r.domain ?? "").trim(),
      }))
      .filter((r) => r.company_name.length > 0);
    if (companies.length > 0) return companies;
  } catch {
    // fall through to line-based parser
  }
  return parseSimpleCompanyList(content).filter((r) => r.company_name.length > 0);
}

export function parseContactsCsv(content: string): Contact[] {
  if (!content.trim()) return [];
  const rows = parseCsv<Partial<Contact>>(content);
  return rows.map(normalizeContact);
}

export function contactsToDownloadCsv(contacts: Contact[]): string {
  return contactsToCsv(contacts.map(normalizeContact));
}
