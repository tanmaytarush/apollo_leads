import type { Contact } from "./csv";
import { isValidEmail } from "./validation";

export interface DiscoverySummary {
  companiesProcessed: number;
  contactsFound: number;
  recruiters: number;
  managers: number;
  leads: number;
  directors: number;
  emailsAvailable: number;
  companiesHiringBackend: number;
  companiesHiringSde: number;
  genericEmails: number;
}

export interface CompanyRollup {
  company_name: string;
  recruiters: number;
  managers: number;
  directors: number;
  emailsAvailable: number;
  matchingRoleFound: boolean;
  matchedJobTitle: string;
  contactCount: number;
}

function isRecruiter(contact: Contact): boolean {
  const text = `${contact.contact_type} ${contact.designation}`.toLowerCase();
  return /recruiter|talent acquisition/.test(text);
}

function isDirector(contact: Contact): boolean {
  const text = `${contact.contact_type} ${contact.designation}`.toLowerCase();
  return /director/.test(text);
}

function isTeamLead(contact: Contact): boolean {
  return /team lead/i.test(contact.designation);
}

function isManager(contact: Contact): boolean {
  if (isRecruiter(contact) || isDirector(contact) || isTeamLead(contact)) return false;
  const text = `${contact.contact_type} ${contact.designation}`.toLowerCase();
  return /manager|engineering manager|hiring manager/.test(text);
}

export function buildDiscoverySummary(
  contacts: Contact[],
  companiesProcessed: number
): DiscoverySummary {
  const companiesWithBackend = new Set<string>();
  const companiesWithSde = new Set<string>();

  for (const contact of contacts) {
    if (contact.matching_role_found !== "YES") continue;
    const title = contact.matched_job_title.toLowerCase();
    if (/backend|platform engineer|infra engineer|systems engineer/.test(title)) {
      companiesWithBackend.add(contact.company_name.toLowerCase());
    }
    if (/software engineer|sde|backend|platform engineer|full stack|staff engineer|senior engineer/.test(title)) {
      companiesWithSde.add(contact.company_name.toLowerCase());
    }
  }

  return {
    companiesProcessed,
    contactsFound: contacts.length,
    recruiters: contacts.filter(isRecruiter).length,
    managers: contacts.filter(isManager).length,
    leads: contacts.filter(isTeamLead).length,
    directors: contacts.filter(isDirector).length,
    emailsAvailable: contacts.filter((c) => isValidEmail(c.email)).length,
    companiesHiringBackend: companiesWithBackend.size,
    companiesHiringSde: companiesWithSde.size,
    genericEmails: contacts.filter((c) => c.email_quality === "generic").length,
  };
}

export function buildCompanyRollups(contacts: Contact[]): CompanyRollup[] {
  const map = new Map<string, CompanyRollup>();

  for (const contact of contacts) {
    const key = contact.company_name.trim();
    if (!key) continue;

    const existing = map.get(key.toLowerCase()) ?? {
      company_name: key,
      recruiters: 0,
      managers: 0,
      directors: 0,
      emailsAvailable: 0,
      matchingRoleFound: false,
      matchedJobTitle: "",
      contactCount: 0,
    };

    existing.contactCount += 1;
    if (isRecruiter(contact)) existing.recruiters += 1;
    if (isManager(contact)) existing.managers += 1;
    if (isDirector(contact)) existing.directors += 1;
    if (isValidEmail(contact.email)) existing.emailsAvailable += 1;
    if (contact.matching_role_found === "YES") {
      existing.matchingRoleFound = true;
      if (contact.matched_job_title) {
        existing.matchedJobTitle = contact.matched_job_title;
      }
    }

    map.set(key.toLowerCase(), existing);
  }

  return Array.from(map.values()).sort((a, b) =>
    b.contactCount - a.contactCount
  );
}
