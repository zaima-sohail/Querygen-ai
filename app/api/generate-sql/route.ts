
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import readOnlyPool from "@/lib/readonly-postgres";
import { createHash } from "crypto";

function getUserTableName(userId: string) {
  const userHash = createHash("sha256")
    .update(userId)
    .digest("hex")
    .slice(0, 20);

  return `csv_upload_${userHash}`;
}

export async function POST(request: Request) {
  try {
    // 1. Verify user authentication
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    // 2. Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "OpenAI API key is missing." },
        { status: 500 }
      );
    }

    // 3. Validate question
    const body = await request.json();
    const question = body.question;

    if (
      typeof question !== "string" ||
      !question.trim() ||
      question.length > 2000
    ) {
      return NextResponse.json(
        { success: false, error: "Please enter a valid question (maximum 2000 characters)." },
        { status: 400 }
      );
    }

    // 4. Identify this user's CSV table
    const tableName = getUserTableName(userId);

    // 5. Read only this user's CSV table schema
    const schemaResult = await readOnlyPool.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = $1
       AND table_name = $2
       ORDER BY ordinal_position`,
      ["public", tableName]
    );

    if (schemaResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No uploaded CSV found. Please upload and import your CSV file first.",
        },
        { status: 404 }
      );
    }

    const schema = schemaResult.rows
      .map(
        (column) =>
          `Column: "${column.column_name}", Type: ${column.data_type}`
      )
      .join("\n");

    // 6. Create OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // 7. Generate SQL using only the user's CSV schema
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
You are an expert PostgreSQL Text-to-SQL assistant.

Your task is to convert natural language questions into PostgreSQL SQL.

THE USER'S ONLY AVAILABLE TABLE:
"${tableName}"

DATABASE SCHEMA:
${schema}

STRICT RULES:
1. Use ONLY the table "${tableName}".
2. Use ONLY the columns listed in the schema.
3. Never invent a table or column.
4. Generate exactly one SELECT statement.
5. Do not use INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT or REVOKE.
6. Do not use JOIN, UNION, CTEs, subqueries or multiple tables.
7. Do not use comments or multiple SQL statements.
8. Use PostgreSQL syntax.
9. Use double quotes around the table name.
10. If the question cannot be answered using the available columns, return exactly: INVALID_QUESTION
11. Return only SQL. No markdown, code fences or explanations.

Example:
SELECT country, SUM(total_amount) AS total_sales
FROM "${tableName}"
GROUP BY country
ORDER BY total_sales DESC;
          `,
        },
        {
          role: "user",
          content: question.trim(),
        },
      ],
    });

    let sql = completion.choices[0]?.message?.content?.trim();

    if (!sql) {
      return NextResponse.json(
        { success: false, error: "Could not generate SQL." },
        { status: 500 }
      );
    }

    // 8. Clean possible markdown code fences
    sql = sql
      .replace(/^```(?:sql)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    sql = sql.replace(/;\s*$/, "").trim();

    if (sql === "INVALID_QUESTION") {
      return NextResponse.json(
        {
          success: false,
          error: "This question cannot be answered using your uploaded CSV columns. Please try another question.",
        },
        { status: 400 }
      );
    }

    // 9. Basic safety validation
    if (
      !/^SELECT\b/i.test(sql) ||
      sql.includes(";") ||
      /--|\/\*|\*\//.test(sql) ||
      /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|UNION|INTERSECT|EXCEPT|JOIN|WITH|INTO)\b/i.test(sql)
    ) {
      return NextResponse.json(
        { success: false, error: "AI generated an unsupported SQL query. Please try again." },
        { status: 400 }
      );
    }

    // 10. Verify the query reads from this user's table
    const fromMatches = [
      ...sql.matchAll(/\bFROM\s+("(?:[^"]|"")*"|[a-zA-Z_][a-zA-Z0-9_$]*)/gi),
    ];

    if (
      fromMatches.length !== 1 ||
      fromMatches[0][1].replace(/^"|"$/g, "") !== tableName
    ) {
      return NextResponse.json(
        { success: false, error: "Generated SQL does not reference your uploaded CSV table." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      sql,
      tableName,
    });

  } catch (error) {
    console.error("SQL generation error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "SQL generation failed. Please try again.",
      },
      { status: 500 }
    );
  }
}
