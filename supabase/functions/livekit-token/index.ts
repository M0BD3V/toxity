import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

type TokenRequest = {
  room_name?: string;
  participant_name?: string;
};

const encoder = new TextEncoder();

function base64Url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function createLiveKitToken(
  apiKey: string,
  apiSecret: string,
  identity: string,
  participantName: string | undefined,
  roomName: string,
) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    exp: now + 15 * 60,
    nbf: now - 5,
    iss: apiKey,
    sub: identity,
    name: participantName,
    video: {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    },
  }));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(unsigned)));
  return `${unsigned}.${base64Url(signature)}`;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (request, { supabase }) => {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = (await request.json()) as TokenRequest;
    const roomName = String(body.room_name ?? "");
    const groupId = roomName.replace(/^group-/, "");
    if (!roomName || !groupId) {
      return Response.json({ error: "room_name is required" }, { status: 400 });
    }

    const { data: membership } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (!membership) {
      return new Response("Forbidden", { status: 403 });
    }

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const serverUrl = Deno.env.get("LIVEKIT_URL");
    if (!apiKey || !apiSecret || !serverUrl) {
      return Response.json({ error: "LiveKit is not configured" }, { status: 500 });
    }

    const participantToken = await createLiveKitToken(
      apiKey,
      apiSecret,
      auth.user.id,
      body.participant_name,
      roomName,
    );

    return Response.json(
      {
        server_url: serverUrl,
        participant_token: participantToken,
      },
      { status: 201 },
    );
  }),
};
