import { NextResponse } from "next/server";
import { issueToken } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * POST: OAuth 2.0 Token-Endpoint (Client Credentials Grant, GAP-14).
 * Body (form oder JSON): grant_type=client_credentials, client_id,
 * client_secret. Antwort: { access_token, token_type, expires_in }.
 */
export async function POST(req: Request) {
  let grantType = "";
  let clientId = "";
  let clientSecret = "";

  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = await req.json();
      grantType = String(body.grant_type ?? "");
      clientId = String(body.client_id ?? "");
      clientSecret = String(body.client_secret ?? "");
    } else {
      const form = await req.formData();
      grantType = String(form.get("grant_type") ?? "");
      clientId = String(form.get("client_id") ?? "");
      clientSecret = String(form.get("client_secret") ?? "");
    }
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (grantType !== "client_credentials")
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
  if (!clientId || !clientSecret)
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  if (!process.env.API_TOKEN_SECRET)
    return NextResponse.json({ error: "server_error" }, { status: 500 });

  const token = await issueToken(clientId, clientSecret);
  if (!token)
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });

  return NextResponse.json({
    access_token: token.accessToken,
    token_type: "Bearer",
    expires_in: token.expiresIn,
  });
}
