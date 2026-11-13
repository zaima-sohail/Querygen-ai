
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import readOnlyPool from "@/lib/readonly-postgres";
import { createHash } from "crypto";

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized. Please log in." },
      { status: 401 }
    );
  }

  let client;

  try {
    const { sql } = await request.json();

    if (typeof sql !== "string" || !sql.trim()) {
      return NextResponse.json(
        { success: false, error: "Please provide a SQL query." },
        { status: 400 }
      );
    }

    const cleanSql = sql.trim().replace(/;$/, "").trim();

    // Only one SELECT statement is supported for uploaded CSV data.
    if (
      !/^SELECT\b/i.test(cleanSql) ||
      cleanSql.includes(";") ||
      /--|\/\*|\*\//.test(cleanSql) ||
      /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|UNION|INTERSECT|EXCEPT)\b/i.test(cleanSql) ||
      /\bJOIN\b/i.test(cleanSql) ||
      /\bWITH\b/i.test(cleanSql) ||
      /\bINTO\b/i.test(cleanSql)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Only a single read-only SELECT query on your uploaded CSV table is allowed.",
        },
        { status: 400 }
      );
    }

    // Recreate the same user-specific table name used by CSV import.
    const userHash = createHash("sha256")
      .update(userId)
      .digest("hex")
      .slice(0, 20);

    const tableName = `csv_upload_${userHash}`;

    // Require exactly one FROM reference to this user's table.
    const fromMatches = [
      ...cleanSql.matchAll(/\bFROM\s+("(?:[^"]|"")*"|[a-zA-Z_][a-zA-Z0-9_$]*)/gi),
    ];

    if (
      fromMatches.length !== 1 ||
      fromMatches[0][1].replace(/^"|"$/g, "") !== tableName
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Your query must read only from your uploaded CSV table. Please upload a CSV first.",
        },
        { status: 400 }
      );
    }

    // Reject comma-separated extra tables in the FROM clause.
    const fromPosition = fromMatches[0].index ?? 0;
    const afterFrom = cleanSql.slice(fromPosition + fromMatches[0][0].length);
    const fromClauseEnd = afterFrom.search(/\b(WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET)\b/i);
    const fromClause = fromClauseEnd === -1
      ? afterFrom
      : afterFrom.slice(0, fromClauseEnd);

    if (fromClause.includes(",") || fromClause.includes("(")) {
      return NextResponse.json(
        { success: false, error: "Multiple tables and subqueries are not allowed." },
        { status: 400 }
      );
    }

    client = await readOnlyPool.connect();

    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL statement_timeout = '5000ms'");

      const result = await client.query(
        `SELECT * FROM (${cleanSql}) AS querygen_result LIMIT 100`
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        tableName,
        columns: result.fields.map((field) => field.name),
        rows: result.rows,
        rowCount: result.rows.length,
        maxRows: 100,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("SQL execution error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error
          ? error.message
          : "SQL execution failed. Check your query and try again.",
      },
      { status: 400 }
    );
  } finally {
    client?.release();
  }
}
