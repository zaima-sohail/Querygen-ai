
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToMongoDB } from "@/lib/mongodb";

function historyErrorResponse(operation: "fetch" | "save", error: unknown) {
  console.error(`History ${operation} error:`, error);

  const isSrvDnsError =
    error instanceof Error &&
    "syscall" in error &&
    error.syscall === "querySrv";

  return NextResponse.json(
    {
      success: false,
      error: isSrvDnsError
        ? "MongoDB SRV DNS lookup failed. The server cannot reach its DNS resolver; Atlas IP allow-list changes will not fix this DNS error."
        : operation === "fetch"
          ? "Could not fetch history"
          : "Could not save query",
    },
    { status: isSrvDnsError ? 503 : 500 }
  );
}

// GET: Fetch only the logged-in user's query history
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const client = await connectToMongoDB();
    const db = client.db("querygen_ai");

    const history = await db
      .collection("query_history")
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    return NextResponse.json({
      success: true,
      history,
    });
  } catch (error) {
    return historyErrorResponse("fetch", error);
  }
}

// POST: Save a query for the logged-in user
export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const body = await request.json();

    const question =
      typeof body.question === "string" ? body.question.trim() : "";

    const sql =
      typeof body.sql === "string" ? body.sql.trim() : "";

    if (!question || !sql) {
      return NextResponse.json(
        {
          success: false,
          error: "Question and SQL are required",
        },
        { status: 400 }
      );
    }

    const client = await connectToMongoDB();
    const db = client.db("querygen_ai");

    const result = await db
      .collection("query_history")
      .insertOne({
        userId,
        question,
        sql,
        createdAt: new Date(),
      });

    return NextResponse.json({
      success: true,
      message: "Query saved successfully!",
      id: result.insertedId,
    });
  } catch (error) {
    return historyErrorResponse("save", error);
  }
}
