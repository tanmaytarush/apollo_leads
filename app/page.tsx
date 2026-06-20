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
    description: "Import target companies via companies.csv",
    href: "/",
    done: (s: FileStats | null) => (s?.companies.count ?? 0) > 0,
  },
  {
    step: 2,
    title: "Discover Contacts",
    description: "Find recruiters and hiring managers via Apollo",
    href: "/recruiters",
    done: (s: FileStats | null) => (s?.contacts.count ?? 0) > 0,
  },
  {
    step: 3,
    title: "Review Contacts",
    description: "Mandatory manual review — edit, add emails, add notes",
    href: "/review",
    done: () => false,
  },
  {
    step: 4,
    title: "Send Emails",
    description: "Preview and send outreach from your Gmail account",
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

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Find the right people, review manually, send high-quality outreach, and track progress. Not mass emailing — thoughtful job search automation."
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Companies</p>
          <p className="text-3xl font-semibold text-white mt-1">
            {loading ? "…" : stats?.companies.count ?? 0}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Contacts</p>
          <p className="text-3xl font-semibold text-white mt-1">
            {loading ? "…" : stats?.contacts.count ?? 0}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Emails Pending</p>
          <p className="text-3xl font-semibold text-amber-400 mt-1">
            {loading ? "…" : stats?.outreach.emailsPending ?? 0}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Emails Sent</p>
          <p className="text-3xl font-semibold text-emerald-400 mt-1">
            {loading ? "…" : stats?.outreach.emailsSent ?? 0}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-medium text-white">companies.csv</h3>
              <p className="text-sm text-gray-500 mt-1">{stats?.companies.path}</p>
            </div>
            <Badge variant={stats?.companies.count ? "success" : "neutral"}>
              {loading ? "…" : `${stats?.companies.count ?? 0} rows`}
            </Badge>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Last modified: {formatDate(stats?.companies.modified ?? null)}
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
              <h3 className="font-medium text-white">contacts.csv</h3>
              <p className="text-sm text-gray-500 mt-1">{stats?.contacts.path}</p>
            </div>
            <Badge variant={stats?.contacts.count ? "success" : "neutral"}>
              {loading ? "…" : `${stats?.contacts.count ?? 0} rows`}
            </Badge>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Last modified: {formatDate(stats?.contacts.modified ?? null)}
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

      <Card title="Workflow" className="mb-8">
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {workflowSteps.map((step) => {
            const done = step.done(stats);
            return (
              <Link
                key={step.step}
                href={step.href}
                className="group p-5 rounded-xl border border-surface-border hover:border-accent/40
                  bg-surface-overlay/30 hover:bg-surface-overlay/60 transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold ${
                      done
                        ? "bg-accent/20 text-accent border border-accent/30"
                        : "bg-surface-border/50 text-gray-400"
                    }`}
                  >
                    {done ? "✓" : step.step}
                  </span>
                  <h4 className="font-medium text-white group-hover:text-accent transition-colors">
                    {step.title}
                  </h4>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{step.description}</p>
              </Link>
            );
          })}
        </div>
      </Card>

      <Card title="Setup" description="Copy .env.example to .env and add your credentials">
        <div className="p-6">
          <pre className="bg-surface text-sm font-mono p-4 rounded-xl border border-surface-border overflow-x-auto text-gray-300">
{`cp .env.example .env

APOLLO_API_KEY=your_apollo_key
GMAIL_EMAIL=your@gmail.com
GMAIL_APP_PASSWORD=your_app_password
LINKEDIN_URL=https://linkedin.com/in/you
GITHUB_URL=https://github.com/you

npm install
npm run dev`}
          </pre>
        </div>
      </Card>
    </div>
  );
}
