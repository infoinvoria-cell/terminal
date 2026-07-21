import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("investors_crm")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServiceClient();
  const body = await req.json();
  const { data, error } = await supabase
    .from("investors_crm")
    .insert([body])
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
