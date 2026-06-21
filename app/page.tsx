"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";

interface FileStats {
  companies: { exists: boolean; count: number; modified: string | null; path: string };
  contacts: { exists: boolean; count: number; modified: string | null; path: string };
  outreach: { emailsPending: number; emailsSent: number };
}

const workflowSteps = [
  {
    step: 1,
    title: "Upload Companies",
    description: "Import target companies via companies.csv. One company per row: name, domain.",
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
  const companiesInputRef = useRef<HTMLInputElement>(null);
  const contactsInputRef = useRef<HTMLInputElement>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/files");
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to load file stats" });
        return;
      }
      setStats(data);
    } catch {
      setMessage({ type: "error", text: "Failed to load file stats" });
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

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString();
  }

  const pipelineStages = [
    {
      label: "Companies",
      sub: "in scope",
      value: stats?.companies.count ?? 0,
      valueClass: "text-white",
      bgClass: "bg-surface-overlay/50",
    },
    {
      label: "Contacts",
      sub: "found",
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
        description="Find the right people, review manually, send high-quality outreach. Thoughtful job search automation — not mass emailing."
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

      {/* Pipeline funnel */}
      <Card className="mb-8">
        <div className="p-5 pb-1 border-b border-surface-border/50 flex items-center justify-between">
          <h2 className="font-semibold text-white text-sm">Outreach Pipeline</h2>
          <span className="text-[11px] text-gray-600 font-mono">Companies → Contacts → Ready → Sent</span>
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

      {/* CSV file cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-surface-overlay flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h3 className="font-medium text-white text-sm">companies.csv</h3>
              </div>
              <p className="text-xs text-gray-500 font-mono">{stats?.companies.path}</p>
            </div>
            <Badge variant={stats?.companies.count ? "success" : "neutral"}>
              {loading ? "…" : `${stats?.companies.count ?? 0} rows`}
            </Badge>
          </div>
          <p className="text-xs text-gray-600 mb-4">
            Modified: {formatDate(stats?.companies.modified ?? null)}
          </p>
          <input
            ref={companiesInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload("companies", file);
              e.target.value = "";
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            loading={uploading === "companies"}
            onClick={() => companiesInputRef.current?.click()}
          >
            Upload companies.csv
          </Button>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-surface-overlay flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="font-medium text-white text-sm">contacts.csv</h3>
              </div>
              <p className="text-xs text-gray-500 font-mono">{stats?.contacts.path}</p>
            </div>
            <Badge variant={stats?.contacts.count ? "success" : "neutral"}>
              {loading ? "…" : `${stats?.contacts.count ?? 0} rows`}
            </Badge>
          </div>
          <p className="text-xs text-gray-600 mb-4">
            Modified: {formatDate(stats?.contacts.modified ?? null)}
          </p>
          <input
            ref={contactsInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload("contacts", file);
              e.target.value = "";
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            loading={uploading === "contacts"}
            onClick={() => contactsInputRef.current?.click()}
          >
            Upload contacts.csv
          </Button>
        </Card>
      </div>

      {/* Workflow steps */}
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
GMAIL_APP_PASSWORD=your_app_password   # myaccount.google.com/apppasswords
LINKEDIN_URL=https://linkedin.com/in/you
GITHUB_URL=https://github.com/you

npm install && npm run dev`}
          </pre>
        </div>
      </Card>
    </div>
  );
}
