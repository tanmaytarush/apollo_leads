"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";

interface CsvUploadCardProps {
  title: string;
  description: string;
  sampleHint: string;
  rowCount: number;
  lastModified: string | null;
  loading?: boolean;
  uploading?: boolean;
  onUpload: (file: File) => void;
  downloadHref?: string;
  downloadFilename?: string;
}

function UploadIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>
  );
}

function CsvFileIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

export function CsvUploadCard({
  title,
  description,
  sampleHint,
  rowCount,
  lastModified,
  loading = false,
  uploading = false,
  onUpload,
  downloadHref,
  downloadFilename,
}: CsvUploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".csv")) return;
      onUpload(file);
    },
    [onUpload]
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFile(e.dataTransfer.files[0]);
    },
    [handleFile]
  );

  function formatDate(iso: string | null) {
    if (!iso) return "Not uploaded yet";
    return `Last updated ${new Date(iso).toLocaleString()}`;
  }

  return (
    <Card className="p-6 flex flex-col h-full">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
            <CsvFileIcon className="w-5 h-5 text-accent" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-white text-sm">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
          </div>
        </div>
        <Badge variant={rowCount > 0 ? "success" : "neutral"}>
          {loading ? "…" : `${rowCount} rows`}
        </Badge>
      </div>

      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={onDrop}
        className={`relative flex-1 min-h-[140px] rounded-xl border-2 border-dashed transition-all
          flex flex-col items-center justify-center gap-2 px-4 py-6 text-center
          disabled:opacity-60 disabled:cursor-not-allowed
          ${
            dragOver
              ? "border-accent bg-accent/10 text-accent"
              : "border-surface-border bg-surface-overlay/30 hover:border-accent/40 hover:bg-surface-overlay/50 text-gray-400"
          }`}
      >
        {uploading ? (
          <>
            <svg className="animate-spin w-8 h-8 text-accent" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm font-medium text-gray-300">Uploading…</span>
          </>
        ) : (
          <>
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                dragOver ? "bg-accent/20 text-accent" : "bg-surface-border/50 text-gray-500"
              }`}
            >
              <UploadIcon />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-200">
                {dragOver ? "Drop CSV here" : "Drop CSV or click to upload"}
              </p>
              <p className="text-xs text-gray-500 mt-1">.csv files only</p>
            </div>
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <p className="text-[11px] text-gray-600 font-mono mt-3 leading-relaxed">{sampleHint}</p>

      <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-surface-border/50">
        <p className="text-xs text-gray-600">{formatDate(lastModified)}</p>
        {downloadHref && rowCount > 0 && (
          <a
            href={downloadHref}
            download={downloadFilename}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download CSV
          </a>
        )}
      </div>
    </Card>
  );
}
