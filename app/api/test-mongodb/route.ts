import { NextResponse } from "next/server";
import { connectToMongoDB } from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await connectToMongoDB();
    const database = client.db("querygen_ai");

    await database.command({ ping: 1 });

    return NextResponse.json({
      success: true,
      message: "MongoDB Atlas connected successfully!",
      database: database.databaseName,
    });
  } catch (error) {
    console.error("MongoDB connection error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "MongoDB connection failed. Check your configuration.",
      },
      { status: 500 }
    );
  }
}
