import type { Contact } from "./csv";
import { assessEmailQuality } from "./email-quality";

const ROLE_SCORES: [RegExp, number][] = [
  [/engineering manager|software engineering manager|backend engineering manager/i, 10],
  [/hiring manager/i, 10],
  [/director.*eng|director engineering/i, 8],
  [/team lead/i, 7],
  [/technical recruiter|recruiter/i, 5],
  [/talent acquisition/i, 4],
];

const SDE_ROLE_PATTERN =
  /software engineer|sde|backend engineer|platform engineer|full stack|fullstack|staff engineer|senior engineer/i;
const BACKEND_ROLE_PATTERN =
  /backend engineer|platform engineer|infra engineer|systems engineer/i;
const MLE_ROLE_PATTERN =
  /machine learning engineer|ml engineer|mle|ai engineer|research engineer|applied scientist/i;

export interface JobMatchContext {
  matchingRoleFound: boolean;
  matchedJobTitle: string;
  matchedJobTitles: string[];
  backendRoleOpen: boolean;
  sdeRoleOpen: boolean;
  mleRoleOpen: boolean;
}

export function matchJobPostings(titles: string[]): JobMatchContext {
  const matchedJobTitles: string[] = [];
  let matchedJobTitle = "";
  let backendRoleOpen = false;
  let sdeRoleOpen = false;
  let mleRoleOpen = false;

  for (const title of titles) {
    const t = title.trim();
    if (!t) continue;

    const relevant =
      BACKEND_ROLE_PATTERN.test(t) ||
      SDE_ROLE_PATTERN.test(t) ||
      MLE_ROLE_PATTERN.test(t);

    if (!relevant) continue;

    matchedJobTitles.push(t);
    if (!matchedJobTitle) matchedJobTitle = t;
    if (BACKEND_ROLE_PATTERN.test(t)) backendRoleOpen = true;
    if (SDE_ROLE_PATTERN.test(t)) sdeRoleOpen = true;
    if (MLE_ROLE_PATTERN.test(t)) mleRoleOpen = true;
  }

  return {
    matchingRoleFound: matchedJobTitles.length > 0,
    matchedJobTitle,
    matchedJobTitles,
    backendRoleOpen,
    sdeRoleOpen,
    mleRoleOpen,
  };
}

export function computeHiringScore(context: JobMatchContext): number {
  if (!context.matchingRoleFound) return 0;
  let score = 5;
  if (context.sdeRoleOpen) score += 10;
  if (context.backendRoleOpen) score += 10;
  if (context.mleRoleOpen) score += 10;
  score += Math.min(context.matchedJobTitles.length * 2, 10);
  return score;
}

export function scoreRole(designation: string, contactType: string): number {
  const text = `${designation} ${contactType}`.trim();
  for (const [pattern, score] of ROLE_SCORES) {
    if (pattern.test(text)) return score;
  }
  return 3;
}

export function computeContactScore(
  contact: Pick<
    Contact,
    "person_name" | "designation" | "email" | "linkedin_url" | "contact_type"
  >,
  jobContext?: JobMatchContext
): number {
  let score = scoreRole(contact.designation, contact.contact_type);

  const emailQuality = assessEmailQuality(contact.email, contact.person_name);
  if (emailQuality === "good") score += 5;
  if (contact.linkedin_url.trim()) score += 2;
  if (emailQuality === "generic") score -= 3;
  if (emailQuality === "missing") score -= 2;

  if (jobContext?.backendRoleOpen) score += 10;
  if (jobContext?.sdeRoleOpen) score += 10;
  if (jobContext?.mleRoleOpen) score += 10;

  return Math.max(0, score);
}

export function applyScoring(
  contact: Contact,
  jobContext?: JobMatchContext
): Contact {
  const emailQuality = assessEmailQuality(contact.email, contact.person_name);
  const score = computeContactScore(contact, jobContext);

  return {
    ...contact,
    contact_score: String(score),
    email_quality: emailQuality,
    matching_role_found: jobContext?.matchingRoleFound ? "YES" : "NO",
    matched_job_title: jobContext?.matchedJobTitle ?? contact.matched_job_title,
  };
}

export function sortContactsByScore(contacts: Contact[]): Contact[] {
  return [...contacts].sort(
    (a, b) => Number(b.contact_score || 0) - Number(a.contact_score || 0)
  );
}
