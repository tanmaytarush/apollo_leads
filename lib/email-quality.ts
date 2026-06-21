const GENERIC_PREFIXES = [
  "careers@",
  "jobs@",
  "support@",
  "hr@",
  "hello@",
  "info@",
  "contact@",
  "recruiting@",
  "talent@",
];

export type EmailQuality = "good" | "missing" | "missing_name" | "generic";

export function assessEmailQuality(
  email: string,
  personName: string
): EmailQuality {
  if (!personName.trim()) return "missing_name";
  if (!email.trim()) return "missing";

  const lower = email.toLowerCase();
  if (GENERIC_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return "generic";
  }

  return "good";
}

export function emailQualityLabel(quality: EmailQuality): string {
  switch (quality) {
    case "good":
      return "Good";
    case "generic":
      return "Generic inbox";
    case "missing":
      return "Missing email";
    case "missing_name":
      return "Missing name";
  }
}
