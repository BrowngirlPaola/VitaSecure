// http.ts — CORS + JSON response helpers shared by every Edge Function.
//
// Client-facing errors stay generic (Directives §4.10.2); detail goes to logs.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function ok(data: unknown): Response {
  return json({ data }, 200);
}

/** Generic client error; the real reason is logged server-side. */
export function fail(status: number, publicMessage = "The request could not be completed."): Response {
  return json({ error: publicMessage }, status);
}

export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return null;
}
