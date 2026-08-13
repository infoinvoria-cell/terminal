import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getFailureRequestId, shouldInjectFailure } from "@/lib/server/capitalife-failure-injection";
import { logServerFailure } from "@/lib/runtime/capitalife-errors";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    if (shouldInjectFailure(request, "investor-db-api")) {
      throw new Error("INVESTOR_DB_API_500");
    }
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("investor_database")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      logServerFailure({
        route: "/api/investor-db",
        module: "investor-db-get",
        error: error.message,
        errorCode: "INVESTOR_DB_QUERY_FAILED",
        requestId: getFailureRequestId(request),
      });
      return NextResponse.json({ error: error.message, status: "ERROR" }, { status: 500 });
    }
    return NextResponse.json(data ?? []);
  } catch (error) {
    logServerFailure({
      route: "/api/investor-db",
      module: "investor-db-get",
      error,
      errorCode: "INVESTOR_DB_API_500",
      requestId: getFailureRequestId(request),
    });
    return NextResponse.json({ error: "INVESTOR_DB_API_500", status: "ERROR" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (shouldInjectFailure(req, "investor-db-api")) {
      throw new Error("INVESTOR_DB_API_500");
    }
    const body = await req.json();
    if (!body.name?.trim()) return NextResponse.json({ error: "Name ist Pflichtfeld" }, { status: 400 });
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("investor_database")
      .insert([{ ...body, name: body.name.trim() }])
      .select()
      .single();
    if (error) {
      logServerFailure({
        route: "/api/investor-db",
        module: "investor-db-post",
        error: error.message,
        errorCode: "INVESTOR_DB_WRITE_FAILED",
        requestId: getFailureRequestId(req),
      });
      return NextResponse.json({ error: error.message, status: "ERROR" }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    logServerFailure({
      route: "/api/investor-db",
      module: "investor-db-post",
      error,
      errorCode: "INVESTOR_DB_API_500",
      requestId: getFailureRequestId(req),
    });
    return NextResponse.json({ error: "INVESTOR_DB_API_500", status: "ERROR" }, { status: 500 });
  }
}
