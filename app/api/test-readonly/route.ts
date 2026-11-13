
import { NextResponse } from "next/server";
import readOnlyPool from "@/lib/readonly-postgres";

export async function GET() {
  try {
    const result = await readOnlyPool.query(`
      SELECT
        current_user AS database_user,
        has_table_privilege(
          current_user,
          'customers',
          'SELECT'
        ) AS can_read_customers,
        has_table_privilege(
          current_user,
          'customers',
          'INSERT'
        ) AS can_insert_customers
    `);

    return NextResponse.json({
      success: true,
      ...result.rows[0],
    });
  } catch (error) {
    console.error("Read-only connection error:", error);

    return NextResponse.json(
      { success: false, error: "Read-only connection failed." },
      { status: 500 }
    );
  }
}
