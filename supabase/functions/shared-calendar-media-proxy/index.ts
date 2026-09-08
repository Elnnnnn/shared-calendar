const TARGET =
  "https://shared-calendar-media.elaine-shared-calendar.workers.dev";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://elnnnnn.github.io",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-file-name, x-file-size",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  Vary: "Origin",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const incoming = new URL(request.url);
  const marker = "/shared-calendar-media-proxy";
  const markerIndex = incoming.pathname.indexOf(marker);
  const suffix =
    markerIndex >= 0
      ? incoming.pathname.slice(markerIndex + marker.length) || "/health"
      : "/health";
  const target = new URL(suffix + incoming.search, TARGET);
  const headers = new Headers();
  for (const name of [
    "authorization",
    "content-type",
    "x-file-name",
    "x-file-size",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : request.body,
    });
    const outgoing = new Headers(corsHeaders);
    for (const name of ["content-type", "cache-control", "etag"]) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch (error) {
    console.error("media proxy failed", error);
    return new Response(JSON.stringify({ error: "照片服务连接失败" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
