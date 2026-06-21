interface HunterEmail {
  value: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  linkedin?: string;
  type?: string;
  confidence?: number;
  seniority?: string;
  department?: string;
}

interface HunterResponse {
  data?: {
    emails?: HunterEmail[];
    domain?: string;
    organization?: string;
  };
  errors?: Array<{ id: string; details: string }>;
}

// Titles that indicate a recruiter or hiring decision-maker
const RECRUITER_KEYWORDS = [
  "recruiter",
  "talent acquisition",
  "talent",
  "hiring",
  "hr",
  "people",
  "engineering manager",
  "team lead",
];

function isRecruiterTitle(position?: string): boolean {
  if (!position) return false;
  const p = position.toLowerCase();
  return RECRUITER_KEYWORDS.some((kw) => p.includes(kw));
}

export async function hunterDomainSearch(domain: string): Promise<
  Array<{
    email: string;
    name: string;
    firstName: string;
    lastName: string;
    title: string;
    linkedin: string;
    confidence: number;
  }>
> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return [];

  try {
    const url =
      `https://api.hunter.io/v2/domain-search` +
      `?domain=${encodeURIComponent(domain)}` +
      `&api_key=${encodeURIComponent(apiKey)}` +
      `&limit=20`;

    const res = await fetch(url, {
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return [];

    const data: HunterResponse = await res.json();
    const emails = data.data?.emails ?? [];

    // Prefer recruiter titles; fall back to first result with an email
    const sorted = [
      ...emails.filter((e) => isRecruiterTitle(e.position)),
      ...emails.filter((e) => !isRecruiterTitle(e.position)),
    ];

    return sorted.slice(0, 5).map((e) => ({
      email: e.value,
      name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(),
      firstName: e.first_name ?? "",
      lastName: e.last_name ?? "",
      title: e.position ?? "",
      linkedin: e.linkedin ?? "",
      confidence: e.confidence ?? 0,
    }));
  } catch {
    return [];
  }
}
