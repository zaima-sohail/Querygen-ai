
import { NextResponse } from "next/server";
import pool from "@/lib/postgres";

export async function GET() {
  try {
    const result = await pool.query(
      "SELECT current_database() AS database, current_user AS user"
    );

    return NextResponse.json({
      connected: true,
      message: "Neon PostgreSQL connected successfully!",
      database: result.rows[0].database,
      user: result.rows[0].user,
    });
  } catch (error) {
    console.error("Database connection error:", error);

    return NextResponse.json(
      {
        connected: false,
        error: "Database connection failed. Check your DATABASE_URL.",
      },
      { status: 500 }
    );
  }
}
