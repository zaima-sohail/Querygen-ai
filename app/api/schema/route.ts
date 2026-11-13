
import { NextResponse } from "next/server";
import pool from "@/lib/postgres";

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        table_name,
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `);

    const tables: Record<
      string,
      {
        column: string;
        type: string;
        nullable: boolean;
      }[]
    > = {};

    for (const row of result.rows) {
      if (!tables[row.table_name]) {
        tables[row.table_name] = [];
      }

      tables[row.table_name].push({
        column: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === "YES",
      });
    }

    return NextResponse.json({
      success: true,
      tables,
      tableCount: Object.keys(tables).length,
    });
  } catch (error) {
    console.error("Schema detection error:", error);

    return NextResponse.json(
      { success: false, error: "Could not read database schema." },
      { status: 500 }
    );
  }
}
