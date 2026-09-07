const SUPABASE_URL = "https://yytyntrgqkddfsliooke.supabase.co";
const SUPABASE_KEY = "sb_publishable_r82IW91PSRwRa_dye0g1Cw_qU0zLeDW";
const BESTIES = new Set([
  "elainezhang1110@gmail.com",
  "zxu1115@icloud.com",
  "1914660774@qq.com",
  "mqianw00@163.com",
]);
const FRIENDS = new Set(["elainezhang1110@gmail.com", "test@test.com"]);
const ALLOWED_ORIGINS = new Set([
  "https://elnnnnn.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
]);
const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

function cors(request) {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://elnnnnn.github.io",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-File-Name, X-File-Size",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    Vary: "Origin",
  };
}

function json(request, value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...cors(request), "Content-Type": "application/json" },
  });
}

async function currentUser(request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: authorization },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return { ...user, authorization, email: String(user.email || "").toLowerCase() };
}

function canUseGroup(email, group) {
  return group === "besties"
    ? BESTIES.has(email)
    : group === "friends"
      ? FRIENDS.has(email)
      : false;
}

async function supabaseRequest(user, path, init = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: user.authorization,
      ...(init.headers || {}),
    },
  });
}

async function uploadPhoto(request, env, user) {
  const url = new URL(request.url);
  const group = url.searchParams.get("group") || "";
  const eventId = url.searchParams.get("event_id");
  const mime = (request.headers.get("Content-Type") || "").split(";")[0];
  const size = Number(
    request.headers.get("X-File-Size") ||
      request.headers.get("Content-Length") ||
      0,
  );
  if (!canUseGroup(user.email, group)) return json(request, { error: "无权上传到这个组" }, 403);
  if (!EXTENSIONS[mime]) return json(request, { error: "目前只支持 JPG、PNG、WebP 和 HEIC 照片" }, 415);
  if (!request.body || !size || size > 10 * 1024 * 1024)
    return json(request, { error: "单张照片需小于 10MB" }, 413);

  const id = crypto.randomUUID();
  const key = `${group}/${user.id}/${id}.${EXTENSIONS[mime]}`;
  await env.PHOTOS.put(key, request.body, {
    httpMetadata: { contentType: mime },
    customMetadata: { owner: user.id, group },
  });
  const fileName = decodeURIComponent(request.headers.get("X-File-Name") || "photo");
  const created = await supabaseRequest(user, "shared_calendar_photos?select=*", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      id,
      object_key: key,
      group_key: group,
      uploader_user_id: user.id,
      uploader_email: user.email,
      event_id: eventId ? Number(eventId) : null,
      file_name: fileName.slice(0, 200),
      mime_type: mime,
      size_bytes: size,
    }),
  });
  if (!created.ok) {
    await env.PHOTOS.delete(key);
    return json(request, { error: "照片资料保存失败" }, 400);
  }
  const rows = await created.json();
  return json(request, rows[0], 201);
}

async function getPhoto(request, env, user, id) {
  const found = await supabaseRequest(
    user,
    `shared_calendar_photos?id=eq.${encodeURIComponent(id)}&select=object_key,mime_type`,
  );
  if (!found.ok) return json(request, { error: "读取照片资料失败" }, 400);
  const rows = await found.json();
  if (!rows.length) return json(request, { error: "照片不存在或无权查看" }, 404);
  const object = await env.PHOTOS.get(rows[0].object_key);
  if (!object) return json(request, { error: "照片文件不存在" }, 404);
  const headers = new Headers(cors(request));
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "private, max-age=300");
  return new Response(object.body, { headers });
}

async function deletePhoto(request, env, user, id) {
  const deleted = await supabaseRequest(
    user,
    `shared_calendar_photos?id=eq.${encodeURIComponent(id)}&select=object_key`,
    { method: "DELETE", headers: { Prefer: "return=representation" } },
  );
  if (!deleted.ok) return json(request, { error: "删除失败" }, 400);
  const rows = await deleted.json();
  if (!rows.length) return json(request, { error: "只能删除自己上传的照片" }, 403);
  await env.PHOTOS.delete(rows[0].object_key);
  return json(request, { success: true });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
    const url = new URL(request.url);
    if (url.pathname === "/health") return json(request, { ok: true });
    const user = await currentUser(request);
    if (!user) return json(request, { error: "请先登录" }, 401);
    try {
      if (url.pathname === "/photos" && request.method === "POST")
        return await uploadPhoto(request, env, user);
      const match = url.pathname.match(/^\/photos\/([0-9a-f-]+)$/i);
      if (match && request.method === "GET") return await getPhoto(request, env, user, match[1]);
      if (match && request.method === "DELETE") return await deletePhoto(request, env, user, match[1]);
      return json(request, { error: "Not found" }, 404);
    } catch (error) {
      console.error(JSON.stringify({ route: url.pathname, error: String(error) }));
      return json(request, { error: "照片服务暂时不可用" }, 500);
    }
  },
};
