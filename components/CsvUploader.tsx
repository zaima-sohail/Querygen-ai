
"use client";

import { useState } from "react";
import Papa from "papaparse";

type CsvRow = Record<string, string>;

export default function CsvUploader() {
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [tableName, setTableName] = useState("");

  function handleFileUpload(file?: File) {
    if (!file) return;

    setError("");
    setMessage("");
    setTableName("");
    setFileName("");
    setSelectedFile(null);
    setRows([]);
    setColumns([]);
    setTotalRows(0);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please select a CSV file.");
      return;
    }

    // Vercel request body limit ko madde nazar rakhte hue 4 MB.
    if (file.size > 4 * 1024 * 1024) {
      setError("File size must be less than 4 MB.");
      return;
    }

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim(),
      complete: (result) => {
        const headers = result.meta.fields ?? [];

        if (result.errors.length > 0) {
          setError(result.errors[0].message);
          return;
        }

        if (!headers.length || !result.data.length) {
          setError("CSV must contain headers and at least one row.");
          return;
        }

        if (
          headers.some((header) => !header) ||
          new Set(headers.map((h) => h.toLowerCase())).size !== headers.length
        ) {
          setError("CSV column names must be non-empty and unique.");
          return;
        }

        if (headers.length > 50) {
          setError("Maximum 50 columns are allowed.");
          return;
        }

        setSelectedFile(file);
        setFileName(file.name);
        setColumns(headers);
        setRows(result.data.slice(0, 10));
        setTotalRows(result.data.length);
        setMessage("CSV read successfully. Click Import CSV to save it to Neon.");
      },
      error: () => setError("Could not read this CSV file."),
    });
  }

  async function importCSV() {
    if (!selectedFile) {
      setError("Please select a CSV file first.");
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/csv-import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "CSV import failed.");
      }

      setTableName(data.tableName);
      setMessage(
        `Successfully imported ${data.rowsImported} rows into Neon PostgreSQL.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "CSV import failed."
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="space-y-6 rounded-2xl border border-white/10 bg-[#101a2d] p-6">
      <div>
        <h2 className="text-xl font-bold text-white">
          CSV Upload &amp; Preview
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Upload your CSV and import its records into Neon PostgreSQL.
        </p>
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-cyan-400/40 bg-[#0b1425] p-10 text-center transition hover:border-cyan-300">
        <span className="text-4xl" aria-hidden="true">CSV</span>
        <span className="mt-3 font-semibold text-white">
          Choose CSV file
        </span>
        <span className="mt-1 text-sm text-slate-400">
          First 10 rows preview · Maximum 4 MB
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            handleFileUpload(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {message && (
        <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">
          {message}
        </p>
      )}

      {columns.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <p className="font-semibold text-white">{fileName}</p>
              <p className="text-sm text-slate-400">
                {columns.length} columns · {totalRows} rows
              </p>
            </div>
            <span className="rounded-lg bg-emerald-500/10 px-3 py-1 text-sm text-emerald-300">
              Preview ready
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#1b2940] text-cyan-300">
                <tr>
                  {columns.map((column) => (
                    <th key={column} className="whitespace-nowrap px-4 py-3">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className="border-t border-white/10 text-slate-300">
                    {columns.map((column) => (
                      <td key={column} className="px-4 py-3">
                        {row[column] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={importCSV}
            disabled={!selectedFile || uploading}
            className="rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Importing CSV..." : "Import CSV to Neon"}
          </button>

          {tableName && (
            <p className="text-sm text-cyan-300">
              Database table: <strong>{tableName}</strong>
            </p>
          )}

          <p className="text-xs text-slate-400">
            Showing first {rows.length} of {totalRows} records.
          </p>
        </div>
      )}
    </section>
  );
}
