"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CsvUploadCard } from "@/components/CsvUploadCard";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";

interface FileStats {
  companies: { exists: boolean; count: number; modified: string | null; source: string };
  contacts: { exists: boolean; count: number; modified: string | null; source: string };
  outreach: { emailsPending: number; emailsSent: number };
}

const workflowSteps = [
  {
    step: 1,
    title: "Upload Companies",
    description: "Drop or select a CSV with company name and domain.",
    href: "/",
    done: (s: FileStats | null) => (s?.companies.count ?? 0) > 0,
  },
  {
    step: 2,
    title: "Discover Contacts",
    description: "Enrich via Apollo API — job postings, org intel, and recruiter matching.",
    href: "/recruiters",
    done: (s: FileStats | null) => (s?.contacts.count ?? 0) > 0,
  },
  {
    step: 3,
    title: "Review & Edit",
    description: "Mandatory manual pass — add emails, fix roles, approve contacts for outreach.",
    href: "/review",
    done: () => false,
  },
  {
    step: 4,
    title: "Send Emails",
    description: "Preview and send personalized outreach via your Gmail account.",
    href: "/send",
    done: (s: FileStats | null) => (s?.outreach.emailsSent ?? 0) > 0,
  },
];

export default function HomePage() {
  const [stats, setStats] = useState<FileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/files");
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to load stats" });
        return;
      }
      setStats(data);
    } catch {
      setMessage({ type: "error", text: "Failed to load stats" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  async function handleUpload(type: "companies" | "contacts", file: File) {
    setUploading(type);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);

    try {
      const res = await fetch("/api/files", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Upload failed" });
        return;
      }

      setMessage({ type: "success", text: data.message });
      await fetchStats();
    } catch {
      setMessage({ type: "error", text: "Upload failed" });
    } finally {
      setUploading(null);
    }
  }

  const pipelineStages = [
    {
      label: "Companies",
      sub: "uploaded",
      value: stats?.companies.count ?? 0,
      valueClass: "text-white",
      bgClass: "bg-surface-overlay/50",
    },
    {
      label: "Contacts",
      sub: "in pipeline",
      value: stats?.contacts.count ?? 0,
      valueClass: "text-sky-400",
      bgClass: "bg-sky-500/10",
    },
    {
      label: "Ready",
      sub: "to send",
      value: stats?.outreach.emailsPending ?? 0,
      valueClass: "text-amber-400",
      bgClass: "bg-amber-500/10",
    },
    {
      label: "Sent",
      sub: "delivered",
      value: stats?.outreach.emailsSent ?? 0,
      valueClass: "text-accent",
      bgClass: "bg-accent/10",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Upload your target companies and contacts as CSV — no local folders required. Review manually, then send outreach from your Gmail."
        actions={
          <Button variant="secondary" size="sm" onClick={fetchStats} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-xl border text-sm ${
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      <Card className="mb-8">
        <div className="p-5 pb-1 border-b border-surface-border/50 flex items-center justify-between">
          <h2 className="font-semibold text-white text-sm">Outreach Pipeline</h2>
          <span className="text-[11px] text-gray-600 font-mono">Upload → Discover → Review → Send</span>
        </div>
        <div className="p-5 flex items-stretch gap-3">
          {pipelineStages.flatMap((stage, i) => [
            ...(i > 0
              ? [
                  <div
                    key={`arrow-${i}`}
                    className="flex items-center shrink-0 text-gray-700"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>,
                ]
              : []),
            <div
              key={stage.label}
              className={`flex-1 rounded-xl p-4 border border-surface-border/60 text-center ${stage.bgClass}`}
            >
              <p className={`text-[2.25rem] font-bold tabular-nums leading-none ${stage.valueClass}`}>
                {loading ? "…" : stage.value}
              </p>
              <p className="text-sm font-medium text-gray-300 mt-2">{stage.label}</p>
              <p className="text-[11px] text-gray-600 mt-0.5">{stage.sub}</p>
            </div>,
          ])}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
        <CsvUploadCard
          title="Companies"
          description="Target employers for outreach. Include domain for best Apollo results."
          sampleHint="company_name,domain — e.g. Groww,groww.in"
          rowCount={stats?.companies.count ?? 0}
          lastModified={stats?.companies.modified ?? null}
          loading={loading}
          uploading={uploading === "companies"}
          onUpload={(file) => handleUpload("companies", file)}
          downloadHref="/api/companies/export"
          downloadFilename="companies.csv"
        />
        <CsvUploadCard
          title="Contacts"
          description="Recruiters and hiring managers. Upload from Apollo export or add via Discover."
          sampleHint="person_name,email,company_name,designation,linkedin_url,…"
          rowCount={stats?.contacts.count ?? 0}
          lastModified={stats?.contacts.modified ?? null}
          loading={loading}
          uploading={uploading === "contacts"}
          onUpload={(file) => handleUpload("contacts", file)}
          downloadHref="/api/contacts/export"
          downloadFilename="contacts.csv"
        />
      </div>

      <Card className="mb-8">
        <div className="p-5 border-b border-surface-border/50">
          <h2 className="font-semibold text-white text-sm">Workflow</h2>
          <p className="text-xs text-gray-500 mt-0.5">Complete each step in order</p>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {workflowSteps.map((step) => {
            const done = step.done(stats);
            return (
              <Link
                key={step.step}
                href={step.href}
                className="group p-4 rounded-xl border border-surface-border hover:border-accent/40
                  bg-surface-overlay/20 hover:bg-surface-overlay/50 transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      done
                        ? "bg-accent/20 text-accent border border-accent/30"
                        : "bg-surface-border/50 text-gray-500 border border-surface-border"
                    }`}
                  >
                    {done ? (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-[11px] font-mono">0{step.step}</span>
                    )}
                  </span>
                  <h4 className="font-medium text-white text-sm group-hover:text-accent transition-colors">
                    {step.title}
                  </h4>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{step.description}</p>
              </Link>
            );
          })}
        </div>
      </Card>

      <Card title="Quick Setup" description="Copy .env.example and add your credentials">
        <div className="p-5">
          <pre className="bg-surface text-xs font-mono p-4 rounded-xl border border-surface-border overflow-x-auto text-gray-400 leading-relaxed scrollbar-thin">
{`cp .env.example .env

APOLLO_API_KEY=your_apollo_key
GMAIL_EMAIL=your@gmail.com
GMAIL_APP_PASSWORD=your_app_password
LINKEDIN_URL=https://linkedin.com/in/you
GITHUB_URL=https://github.com/you

npm install && npm run dev`}
          </pre>
        </div>
      </Card>
    </div>
  );
}
