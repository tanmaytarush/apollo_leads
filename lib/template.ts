import fs from "fs/promises";
import path from "path";
import type { Contact } from "./csv";
import { isValidEmail } from "./validation";

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "default-email.txt");

export interface EmailTemplate {
  subject: string;
  body: string;
}

export interface TemplateContext {
  name: string;
  company: string;
  designation: string;
  linkedin: string;
  github: string;
}

export async function readEmailTemplate(): Promise<EmailTemplate> {
  const content = await fs.readFile(TEMPLATE_PATH, "utf-8");
  const lines = content.split("\n");
  const subjectLine = lines.find((l) => l.startsWith("Subject:"));
  const subject = subjectLine
    ? subjectLine.replace(/^Subject:\s*/, "").trim()
    : "Opportunity at {{company}}";

  const bodyStart = subjectLine
    ? lines.indexOf(subjectLine) + 1
    : 0;
  const body = lines.slice(bodyStart).join("\n").trim();

  return { subject, body };
}

export function renderTemplate(
  template: string,
  context: TemplateContext
): string {
  return template
    .replace(/\{\{name\}\}/g, context.name || "there")
    .replace(/\{\{company\}\}/g, context.company || "your company")
    .replace(/\{\{designation\}\}/g, context.designation || "")
    .replace(/\{\{linkedin\}\}/g, context.linkedin || "")
    .replace(/\{\{github\}\}/g, context.github || "");
}

export function buildEmailFromContact(
  contact: Contact,
  template: EmailTemplate,
  profileLinks: { linkedin: string; github: string }
): { subject: string; body: string; to: string } {
  const context: TemplateContext = {
    name: contact.person_name.split(" ")[0] || contact.person_name,
    company: contact.company_name,
    designation: contact.designation,
    linkedin: profileLinks.linkedin,
    github: profileLinks.github,
  };

  return {
    to: contact.email,
    subject: renderTemplate(template.subject, context),
    body: renderTemplate(template.body, context),
  };
}

export function getProfileLinks(): { linkedin: string; github: string } {
  return {
    linkedin: process.env.LINKEDIN_URL ?? "",
    github: process.env.GITHUB_URL ?? "",
  };
}

export function isEligibleForSending(contact: Contact): boolean {
  return (
    contact.send_email.toUpperCase() === "YES" &&
    contact.special_mail.toUpperCase() === "NO" &&
    contact.status.toUpperCase() === "PENDING" &&
    isValidEmail(contact.email)
  );
}
