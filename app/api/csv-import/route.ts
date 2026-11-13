
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Pool } from "pg";
import Papa from "papaparse";
import { createHash } from "crypto";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing.");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function makeColumnNames(headers: string[]) {
  const used = new Set<string>();

  return headers.map((header, index) => {
    let name = header
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");

    if (!name) name = `column_${index + 1}`;
    if (/^[0-9]/.test(name)) name = `col_${name}`;

    const base = name;
    let suffix = 2;

    while (used.has(name)) {
      name = `${base}_${suffix++}`;
    }

    used.add(name);
    return name;
  });
}

function inferColumnType(values: string[]) {
  const nonEmpty = values
    .map((value) => value.trim())
    .filter(Boolean);

  if (!nonEmpty.length) return "TEXT";

  const isInteger = nonEmpty.every((value) =>
    /^-?\d+$/.test(value)
  );

  if (isInteger) return "BIGINT";

  const isNumber = nonEmpty.every(
    (value) =>
      value.trim() !== "" &&
      Number.isFinite(Number(value))
  );

  if (isNumber) return "DOUBLE PRECISION";

  return "TEXT";
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Please log in first." },
      { status: 401 }
    );
  }

  let client;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "CSV file is required." },
        { status: 400 }
      );
    }

    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "CSV must be smaller than 4 MB." },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { success: false, error: "Only CSV files are allowed." },
        { status: 400 }
      );
    }

    const csvText = await file.text();

    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim(),
    });

    if (parsed.errors.length) {
      return NextResponse.json(
        { success: false, error: parsed.errors[0].message },
        { status: 400 }
      );
    }

    const headers = parsed.meta.fields ?? [];
    const rows = parsed.data;

    if (!headers.length || !rows.length) {
      return NextResponse.json(
        { success: false, error: "CSV must contain headers and data rows." },
        { status: 400 }
      );
    }

    if (
      headers.length > 50 ||
      headers.some((header) => !header) ||
      new Set(headers.map((h) => h.toLowerCase())).size !== headers.length
    ) {
      return NextResponse.json(
        { success: false, error: "CSV must have 1–50 unique, non-empty columns." },
        { status: 400 }
      );
    }

    if (rows.length > 20000) {
      return NextResponse.json(
        { success: false, error: "Maximum 20,000 rows are allowed." },
        { status: 400 }
      );
    }

    const columns = makeColumnNames(headers);

    // Har signed-in user ke liye alag table name.
    const userHash = createHash("sha256")
      .update(userId)
      .digest("hex")
      .slice(0, 20);

    const tableName = `csv_upload_${userHash}`;
    const quotedTable = quoteIdentifier(tableName);

    const columnTypes = columns.map((column, index) => ({
      name: column,
      type: inferColumnType(
        rows.map((row) => String(row[headers[index]] ?? ""))
      ),
    }));

    client = await pool.connect();
    await client.query("BEGIN");

    // Is user ki previous CSV table replace hogi.
    await client.query(`DROP TABLE IF EXISTS ${quotedTable}`);

    const definitions = columnTypes
      .map(
        (column) =>
          `${quoteIdentifier(column.name)} ${column.type}`
      )
      .join(", ");

    await client.query(
      `CREATE TABLE ${quotedTable} (${definitions})`
    );

    // Data ko parameterized batches mein insert karein.
    const batchSize = 300;

    for (let start = 0; start < rows.length; start += batchSize) {
      const batch = rows.slice(start, start + batchSize);
      const values: unknown[] = [];

      const valueGroups = batch.map((row, rowIndex) => {
        const placeholders = columns.map((column, columnIndex) => {
          const rawValue = String(row[headers[columnIndex]] ?? "").trim();
          const value = rawValue === "" ? null : rawValue;

          values.push(value);

          return `$${rowIndex * columns.length + columnIndex + 1}`;
        });

        return `(${placeholders.join(", ")})`;
      });

      await client.query(
        `INSERT INTO ${quotedTable} (${columns.map(quoteIdentifier).join(", ")})
         VALUES ${valueGroups.join(", ")}`,
        values
      );
    }

    // Existing read-only SQL role ko imported table par SELECT access.
    await client.query(
      `GRANT SELECT ON TABLE ${quotedTable} TO querygen_reader`
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      tableName,
      rowsImported: rows.length,
      columns: columnTypes,
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("CSV import error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not import CSV.",
      },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}
