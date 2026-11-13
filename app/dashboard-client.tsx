
"use client";

import { useCallback, useEffect, useState } from "react";
import { Show, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import CsvUploader from "@/components/CsvUploader";
type QueryResult = {
  success: boolean;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  maxRows?: number;
};

type HistoryItem = {
  _id?: string;
  question: string;
  sql: string;
  createdAt: string;
};

const examples = [
  "Show all customers from Pakistan",
  "List the top 5 orders by total amount",
  "Show all products with their quantities",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHistoryItem(value: unknown): value is HistoryItem {
  return (
    isRecord(value) &&
    typeof value.question === "string" &&
    typeof value.sql === "string" &&
    typeof value.createdAt === "string"
  );
}

async function readHistoryResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "unknown content type";
  const responseText = await response.text();
  let payload: unknown;

  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    throw new Error(
      `History API returned a non-JSON response (HTTP ${response.status}, ${contentType}).`
    );
  }

  if (!isRecord(payload)) {
    throw new Error(
      `History API returned an invalid response (HTTP ${response.status}, ${contentType}).`
    );
  }

  if (!response.ok || payload.success !== true) {
    const apiError =
      typeof payload.error === "string" ? payload.error.trim() : "";
    throw new Error(
      apiError ||
        `History API returned HTTP ${response.status} (${contentType}) without a success response.`
    );
  }

  return payload;
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [sql, setSql] = useState("");
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [copied, setCopied] = useState(false);

  // MongoDB history states
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMessage, setHistoryMessage] = useState("");
  const [activityAnchor, setActivityAnchor] = useState<number | null>(null);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setActivityAnchor(Date.now());

    try {
      const response = await fetch("/api/history");
      const data = await readHistoryResponse(response);

      if (!Array.isArray(data.history) || !data.history.every(isHistoryItem)) {
        throw new Error("History API response did not contain a valid history list.");
      }

      setHistory(data.history);
    } catch (err) {
      setHistoryMessage(
        err instanceof Error ? err.message : "History loading failed."
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Load the signed-in user's saved queries when the dashboard first opens.
  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  // Save generated query to MongoDB
  async function saveToHistory(generatedQuestion: string, generatedSQL: string) {
    try {
      const response = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: generatedQuestion,
          sql: generatedSQL,
        }),
      });

      await readHistoryResponse(response);

      setHistoryMessage("Query saved to history successfully!");
      await fetchHistory();
    } catch (err) {
      console.error("History save failed:", err);
      setHistoryMessage(
        err instanceof Error
          ? `SQL generated, but history could not be saved: ${err.message}`
          : "SQL generated, but history could not be saved."
      );
    }
  }

  async function generateSQL() {
    if (!question.trim()) {
      setError("Please enter your question first.");
      return;
    }

    setLoading(true);
    setError("");
    setHistoryMessage("");
    setResult(null);

    try {
      const response = await fetch("/api/generate-sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await response.json();

      if (!response.ok || typeof data.sql !== "string") {
        throw new Error(data.error || "SQL generation failed.");
      }

      setSql(data.sql);
      await saveToHistory(question, data.sql);
    } catch (err) {
      setError(err instanceof Error ? err.message : "SQL generation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function runQuery() {
    if (!sql.trim()) {
      setError("Enter or generate a SQL query first.");
      return;
    }

    setRunning(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/execute-sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Query execution failed.");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query execution failed.");
    } finally {
      setRunning(false);
    }
  }

  async function copySQL() {
    if (!sql) return;

    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Unable to copy SQL. Please copy it manually.");
    }
  }

  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "object") return JSON.stringify(value) ?? String(value);
    return String(value);
  }

  const activity = Array.from({ length: 7 }, (_, index) => {
    if (activityAnchor === null) {
      return { label: `D${index + 1}`, count: 0 };
    }

    const date = new Date(activityAnchor);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));

    return {
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      count: history.filter((item) => {
        const createdAt = new Date(item.createdAt);
        return (
          !Number.isNaN(createdAt.getTime()) &&
          createdAt.toDateString() === date.toDateString()
        );
      }).length,
    };
  });
  const activityMax = Math.max(1, ...activity.map((day) => day.count));
  const chartPoints = activity.map((day, index) => ({
    x: 24 + index * 48,
    y: 82 - (day.count / activityMax) * 58,
  }));
  const chartLine = chartPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const chartArea = `${chartLine} L 312 96 L 24 96 Z`;

  return (
    <main className="min-h-screen overflow-hidden bg-[#070a12] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_18%_0%,rgba(34,211,238,0.11),transparent_35%),radial-gradient(ellipse_at_86%_18%,rgba(139,92,246,0.12),transparent_30%)]" />
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#080b12]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-sm font-bold text-cyan-200">
              Q
            </span>
            <span className="text-sm font-semibold tracking-wide text-white">
              QUERYGEN<span className="text-cyan-300">.</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-slate-400 md:flex">
            <a href="#workspace" className="transition hover:text-white">Workspace</a>
            <a href="#visuals" className="transition hover:text-white">Analytics</a>
            <a href="#history" className="transition hover:text-white">History</a>
          </nav>
          <div className="flex items-center gap-3">
            <Show when="signed-out">
              <Link href="/sign-in" className="text-sm text-slate-300 transition hover:text-cyan-200">
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="rounded-lg border border-cyan-200/20 bg-cyan-300 px-3.5 py-2 text-sm font-semibold text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.12)] transition hover:bg-cyan-200"
              >
                Get started
              </Link>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-7xl px-5 pb-16 md:px-8">
        <section className="grid gap-5 pb-6 pt-9 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0c111c]/90 p-7 md:p-9">
            <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-400/[0.08] blur-3xl" />
            <div className="relative">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.07] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-200">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_#67e8f9]" />
                AI data workspace
              </div>
              <h1 className="max-w-2xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-white md:text-5xl">
                Ask your data
                <br />
                <span className="bg-gradient-to-r from-cyan-200 via-sky-300 to-violet-300 bg-clip-text text-transparent">
                  better questions.
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-6 text-slate-400 md:text-base">
                Turn natural language into clear, read-only SQL. Inspect the
                result, refine the query, and keep your workflow moving.
              </p>
              <a
                href="#workspace"
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100"
              >
                Open workspace <span aria-hidden="true">-&gt;</span>
              </a>
            </div>
          </div>

          <div
            id="visuals"
            className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0c111c]/90 p-5 md:p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Query activity
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  {history.length}
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    saved queries
                  </span>
                </p>
              </div>
              <span className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-400">
                LAST 7 DAYS
              </span>
            </div>
            <div className="mt-5">
              <svg
                viewBox="0 0 336 108"
                role="img"
                aria-label="Saved query activity over the last seven days"
                className="h-28 w-full overflow-visible"
              >
                <defs>
                  <linearGradient id="activity-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="activity-line" x1="0" x2="1">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#a78bfa" />
                  </linearGradient>
                </defs>
                {[24, 48, 72, 96].map((y) => (
                  <line
                    key={y}
                    x1="20"
                    x2="316"
                    y1={y}
                    y2={y}
                    stroke="rgba(148,163,184,0.12)"
                    strokeDasharray="3 5"
                  />
                ))}
                <path d={chartArea} fill="url(#activity-fill)" />
                <path
                  d={chartLine}
                  fill="none"
                  stroke="url(#activity-line)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                />
                {chartPoints.map((point, index) => (
                  <circle
                    key={activity[index].label}
                    cx={point.x}
                    cy={point.y}
                    r="3.5"
                    fill="#0c111c"
                    stroke="#67e8f9"
                    strokeWidth="2"
                  />
                ))}
              </svg>
              <div className="mt-1 grid grid-cols-7 text-center text-[10px] text-slate-600">
                {activity.map((day) => (
                  <span key={day.label}>{day.label}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 pb-8 sm:grid-cols-3">
          {[
            {
              label: "Saved queries",
              value: String(history.length).padStart(2, "0"),
              detail: "From your history",
              color: "text-cyan-200",
            },
            {
              label: "Rows returned",
              value: result ? result.rowCount.toLocaleString() : "--",
              detail: result ? "Latest execution" : "Run a query to begin",
              color: "text-violet-200",
            },
            {
              label: "Workspace",
              value: running ? "Running" : result ? "Ready" : "Idle",
              detail: "Read-only SQL mode",
              color: "text-emerald-200",
            },
          ].map((metric) => (
            <div
              key={metric.label}
              className="rounded-2xl border border-white/[0.07] bg-[#0c111c]/80 px-5 py-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500">{metric.label}</p>
                  <p className={`mt-2 text-2xl font-semibold tracking-tight ${metric.color}`}>
                    {metric.value}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">{metric.detail}</p>
                </div>
                <span className="mt-1 h-2 w-2 rounded-full bg-current opacity-70" />
              </div>
            </div>
          ))}
        </section>

        <section
          id="workspace"
          className="mb-5 overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0c111c]/90"
        >
          <div className="flex flex-col gap-4 border-b border-white/[0.07] px-5 py-5 sm:flex-row sm:items-center sm:justify-between md:px-7">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-200/70">
                Workspace / 01
              </p>
              <h2 className="mt-1 text-xl font-semibold text-white">
                Natural language to SQL
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Read-only execution
            </div>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="p-5 md:p-7">
              <label
                htmlFor="question"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                What would you like to find?
              </label>
              <div className="rounded-2xl border border-white/[0.09] bg-[#080c14] p-3 transition focus-within:border-cyan-300/40 focus-within:shadow-[0_0_0_3px_rgba(34,211,238,0.06)]">
                <textarea
                  id="question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ask a question about your data..."
                  rows={3}
                  className="w-full resize-y bg-transparent px-2 py-1 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-600"
                />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                  <span className="text-[11px] text-slate-600">
                    Be specific about filters, grouping, and sort order.
                  </span>
                  <button
                    type="button"
                    onClick={generateSQL}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? "Generating..." : "Generate SQL"}
                    {!loading && <span aria-hidden="true">-&gt;</span>}
                  </button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {examples.map((example, index) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setQuestion(example)}
                    className="group inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-[11px] text-slate-400 transition hover:border-cyan-300/25 hover:text-cyan-100"
                  >
                    <span className="font-mono text-cyan-300/60">0{index + 1}</span>
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-white/[0.07] bg-white/[0.015] p-5 lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-300">How it works</p>
                <span className="font-mono text-[10px] text-slate-600">FLOW / 4</span>
              </div>
              <div className="relative mt-5 grid grid-cols-4 gap-1">
                <div className="absolute left-[12%] right-[12%] top-4 h-px bg-gradient-to-r from-cyan-300/40 via-violet-300/35 to-emerald-300/40" />
                {[
                  ["01", "Ask", "text-cyan-200"],
                  ["02", "Generate", "text-sky-200"],
                  ["03", "Review", "text-violet-200"],
                  ["04", "Run", "text-emerald-200"],
                ].map(([step, label, color]) => (
                  <div key={step} className="relative flex flex-col items-center text-center">
                    <span className={`z-10 flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-[#0c111c] font-mono text-[10px] ${color}`}>
                      {step}
                    </span>
                    <span className="mt-2 text-[10px] text-slate-500">{label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-xl border border-violet-300/10 bg-violet-300/[0.04] p-3">
                <div className="flex items-center gap-2 text-[11px] font-medium text-violet-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
                  Guardrails enabled
                </div>
                <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
                  Generated queries are restricted to read-only operations.
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <section className="space-y-5">
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c111c]/90">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-300/10 font-mono text-xs text-violet-200">
                    SQL
                  </span>
                  <div>
                    <h3 className="text-sm font-medium text-white">Query editor</h3>
                    <p className="text-[10px] text-slate-600">PostgreSQL syntax</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={copySQL}
                    disabled={!sql}
                    className="rounded-lg border border-white/[0.09] px-3 py-2 text-xs text-slate-300 transition hover:border-white/20 disabled:opacity-40"
                  >
                    {copied ? "Copied" : "Copy SQL"}
                  </button>
                  <button
                    type="button"
                    onClick={runQuery}
                    disabled={running || !sql.trim()}
                    className="rounded-lg bg-emerald-300 px-3.5 py-2 text-xs font-semibold text-[#07120d] transition hover:bg-emerald-200 disabled:opacity-40"
                  >
                    {running ? "Running..." : "Run query"}
                  </button>
                </div>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute bottom-0 left-0 top-0 w-12 border-r border-white/[0.04] bg-white/[0.015]" />
                <div className="pointer-events-none absolute left-0 top-0 w-12 select-none py-5 text-center font-mono text-[11px] leading-6 text-slate-700">
                  {Array.from({ length: Math.max(6, sql.split("\n").length) }, (_, index) => (
                    <div key={index}>{String(index + 1).padStart(2, "0")}</div>
                  ))}
                </div>
                <textarea
                  id="sql"
                  value={sql}
                  onChange={(event) => setSql(event.target.value)}
                  placeholder={"-- Your generated SQL will appear here\nSELECT ..."}
                  rows={Math.max(7, Math.min(12, sql.split("\n").length + 2))}
                  spellCheck={false}
                  className="min-h-48 w-full resize-y bg-transparent py-5 pl-16 pr-5 font-mono text-xs leading-6 text-cyan-100 outline-none placeholder:text-slate-700"
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/[0.06] p-3 text-sm text-red-200">
                {error}
              </p>
            )}
            {historyMessage && (
              <p role="status" className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] p-3 text-sm text-cyan-100">
                {historyMessage}
              </p>
            )}

            <section
              id="results"
              className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c111c]/90"
            >
              <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                <div>
                  <h3 className="text-sm font-medium text-white">Result set</h3>
                  <p className="mt-1 text-[10px] text-slate-600">
                    {result
                      ? `${result.rowCount} rows returned${result.maxRows ? ` · capped at ${result.maxRows}` : ""}`
                      : "Run a query to inspect your data"}
                  </p>
                </div>
                <span className="rounded-md border border-white/[0.08] px-2 py-1 font-mono text-[10px] text-slate-500">
                  {result ? `${result.columns.length} COL` : "TABLE"}
                </span>
              </div>
              {!result ? (
                <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-5 text-center">
                  <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.02] font-mono text-xs text-slate-600">
                    {"{ }"}
                  </div>
                  <p className="text-xs text-slate-500">Your result visualization will appear here.</p>
                </div>
              ) : result.rows.length === 0 ? (
                <p className="p-5 text-sm text-slate-400">Query completed with no rows.</p>
              ) : (
                <div className="max-h-[420px] overflow-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="sticky top-0 bg-[#101724] text-slate-400">
                      <tr>
                        {result.columns.map((column) => (
                          <th key={column} className="whitespace-nowrap px-4 py-3 font-medium">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-t border-white/[0.05] hover:bg-white/[0.02]">
                          {result.columns.map((column) => (
                            <td key={column} className="max-w-xs truncate px-4 py-3 text-slate-300">
                              {formatValue(row[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <CsvUploader />
          </section>

          <aside
            id="history"
            className="h-fit overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c111c]/90"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                  Library
                </p>
                <h3 className="mt-1 text-sm font-medium text-white">Recent queries</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHistoryMessage("");
                  void fetchHistory();
                }}
                disabled={historyLoading}
                aria-label="Refresh query history"
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] text-slate-400 transition hover:border-cyan-300/25 hover:text-cyan-100 disabled:opacity-40"
              >
                {historyLoading ? "..." : "↻"}
              </button>
            </div>
            <div className="p-3">
              {history.map((item, index) => (
                <button
                  key={item._id || `${item.createdAt}-${index}`}
                  type="button"
                  onClick={() => {
                    setQuestion(item.question);
                    setSql(item.sql);
                    setError("");
                  }}
                  className="group mb-2 block w-full rounded-xl border border-transparent p-3 text-left transition hover:border-white/[0.08] hover:bg-white/[0.025]"
                >
                  <span className="mb-2 flex items-center justify-between gap-3">
                    <span className="line-clamp-2 text-xs font-medium leading-5 text-slate-300 group-hover:text-white">
                      {item.question}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] text-slate-600">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </span>
                  <span className="block truncate font-mono text-[10px] text-slate-600">
                    {item.sql}
                  </span>
                  <span className="mt-2 block text-[10px] text-slate-600">
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleString()
                      : ""}
                  </span>
                </button>
              ))}
              {!historyLoading && history.length === 0 && (
                <div className="px-3 py-9 text-center">
                  <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.02] font-mono text-xs text-slate-600">
                    00
                  </div>
                  <p className="mt-3 text-xs text-slate-500">History is ready when you are.</p>
                  <p className="mt-1 text-[10px] text-slate-700">Refresh to load saved queries.</p>
                </div>
              )}
              {historyLoading && (
                <p className="px-3 py-8 text-center text-xs text-slate-500">
                  Loading history...
                </p>
              )}
            </div>
          </aside>
        </div>

        <footer className="mt-8 flex flex-col justify-between gap-2 border-t border-white/[0.06] pt-5 text-[10px] text-slate-600 sm:flex-row">
          <span>QUERYGEN AI / DATA WORKSPACE</span>
          <span>Natural language. Read-only SQL. Clear results.</span>
        </footer>
      </div>
    </main>
  );
}