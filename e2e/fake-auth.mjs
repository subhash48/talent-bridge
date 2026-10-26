// A stand-in for Supabase Auth (GoTrue), for end-to-end tests only (run.sh starts it on :8200). It signs real
// ES256 access tokens (JWKS at /auth/v1/.well-known/jwks.json), so the backend and the frontend verify them
// unchanged; keeps users in memory and mirrors them into the e2e database's auth.users table, which the backend
// reads to know whether an email was verified; and "sends" emails into an outbox (GET /__outbox) instead of
// anyone's inbox. Only the endpoints TalentBridge calls are here.
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { createServer } from "node:http";

import pg from "pg";

const PORT = Number(process.env.E2E_AUTH_PORT ?? 8200);
const BASE = `http://localhost:${PORT}`;
const ISSUER = `${BASE}/auth/v1`;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "e2e-secret";
const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
await db.connect();

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const KID = "e2e-key";
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "ES256", use: "sig" };

const users = new Map(); // id -> user
const sessions = new Map(); // refresh token -> user id
const codes = new Map(); // pkce auth code -> { userId, challenge, type }
const tokens = new Map(); // email link token -> { userId, type, redirectTo, challenge }
const outbox = [];

const b64url = (buffer) => Buffer.from(buffer).toString("base64url");

function jwt(user, sessionId) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", typ: "JWT", kid: KID };
  const payload = {
    iss: ISSUER,
    sub: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    iat: now,
    exp: now + 3600,
    session_id: sessionId,
    user_metadata: user.user_metadata,
    app_metadata: { provider: "email", providers: ["email"] },
    aal: "aal1",
    amr: [{ method: "password", timestamp: now }],
    is_anonymous: false,
  };
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = sign("sha256", Buffer.from(body), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${body}.${b64url(signature)}`;
}

function publicUser(user) {
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: user.confirmed_at,
    confirmed_at: user.confirmed_at,
    invited_at: user.invited_at,
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: user.user_metadata,
    identities: [],
    created_at: user.created_at,
    updated_at: new Date().toISOString(),
    is_anonymous: false,
  };
}

function session(user) {
  const refresh = b64url(randomBytes(24));
  const sessionId = randomUUID();
  sessions.set(refresh, user.id);
  const expiresIn = 3600;
  return {
    access_token: jwt(user, sessionId),
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    refresh_token: refresh,
    user: publicUser(user),
  };
}

async function mirror(user) {
  await db.query(
    `insert into auth.users (id, email, email_confirmed_at, confirmation_sent_at, invited_at)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do update set email = $2, email_confirmed_at = $3, confirmation_sent_at = $4, invited_at = $5`,
    [user.id, user.email, user.confirmed_at, user.confirmation_sent_at, user.invited_at],
  );
}

async function createUser(email, { password = null, data = {}, confirmed = false, invited = false } = {}) {
  const now = new Date().toISOString();
  const user = {
    id: randomUUID(),
    email: email.toLowerCase(),
    password,
    user_metadata: data,
    confirmed_at: confirmed ? now : null,
    confirmation_sent_at: confirmed || invited ? null : now,
    invited_at: invited ? now : null,
    created_at: now,
  };
  users.set(user.id, user);
  await mirror(user);
  return user;
}

const byEmail = (email) => [...users.values()].find((user) => user.email === String(email).toLowerCase());

function mail(to, kind, link) {
  outbox.push({ to: to.toLowerCase(), kind, link, at: new Date().toISOString() });
}

function emailLink(user, type, redirectTo, challenge = null) {
  const token = b64url(randomBytes(18));
  tokens.set(token, { userId: user.id, type, redirectTo, challenge });
  return `${ISSUER}/verify?token=${token}&type=${type}&redirect_to=${encodeURIComponent(redirectTo ?? "")}`;
}

function bearerUser(req) {
  const auth = req.headers.authorization ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    return users.get(claims.sub) ?? null;
  } catch {
    return null;
  }
}

const isAdmin = (req) => req.headers.apikey === SECRET_KEY;

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": res.req.headers.origin ?? "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "x-supabase-api-version": "2024-01-01",
    ...headers,
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

const refuse = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });

async function read(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString();
  return text ? JSON.parse(text) : {};
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, BASE);
    const path = url.pathname;
    if (req.method === "OPTIONS") return send(res, 204);

    if (path === "/__outbox") return send(res, 200, outbox);
    if (path === "/__seed" && req.method === "POST") {
      // { email, password }: a confirmed account, as an operator would have made it.
      const body = await read(req);
      const user = byEmail(body.email) ?? (await createUser(body.email, { password: body.password, confirmed: true }));
      user.password = body.password;
      user.confirmed_at ??= new Date().toISOString();
      await mirror(user);
      return send(res, 200, { id: user.id });
    }
    if (path === "/auth/v1/.well-known/jwks.json") return send(res, 200, { keys: [jwk] });
    if (path === "/auth/v1/health" || path === "/auth/v1/settings") return send(res, 200, { external: { email: true } });

    if (path === "/auth/v1/signup" && req.method === "POST") {
      const body = await read(req);
      const redirectTo = url.searchParams.get("redirect_to") ?? body.options?.emailRedirectTo ?? BASE;
      if (byEmail(body.email)) {
        // Supabase's answer for an address that exists: looks the same, sends nothing.
        return send(res, 200, { id: randomUUID(), email: body.email, identities: [] });
      }
      const user = await createUser(body.email, { password: body.password, data: body.data ?? {} });
      mail(user.email, "signup", emailLink(user, "signup", redirectTo, body.code_challenge ?? null));
      return send(res, 200, publicUser(user));
    }

    if (path === "/auth/v1/verify" && req.method === "GET") {
      const entry = tokens.get(url.searchParams.get("token") ?? "");
      const redirectTo = url.searchParams.get("redirect_to") || entry?.redirectTo || BASE;
      if (!entry) {
        res.writeHead(303, { location: `${redirectTo}#error=access_denied&error_code=otp_expired` });
        return res.end();
      }
      tokens.delete(url.searchParams.get("token"));
      const user = users.get(entry.userId);
      user.confirmed_at ??= new Date().toISOString();
      await mirror(user);
      if (entry.challenge) {
        const code = randomUUID();
        codes.set(code, { userId: user.id, challenge: entry.challenge });
        const target = new URL(redirectTo);
        target.searchParams.set("code", code);
        res.writeHead(303, { location: target.href });
        return res.end();
      }
      // Implicit flow (invitations, admin links): the session in the fragment.
      const s = session(user);
      const fragment = new URLSearchParams({
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_in: String(s.expires_in),
        expires_at: String(s.expires_at),
        token_type: "bearer",
        type: entry.type,
      });
      res.writeHead(303, { location: `${redirectTo}#${fragment}` });
      return res.end();
    }

    if (path === "/auth/v1/token" && req.method === "POST") {
      const grant = url.searchParams.get("grant_type");
      const body = await read(req);
      if (grant === "password") {
        const user = byEmail(body.email);
        if (!user || !user.password || user.password !== body.password) {
          return refuse(res, 400, "invalid_credentials", "Invalid login credentials");
        }
        if (!user.confirmed_at) return refuse(res, 400, "email_not_confirmed", "Email not confirmed");
        return send(res, 200, session(user));
      }
      if (grant === "refresh_token") {
        const userId = sessions.get(body.refresh_token);
        if (!userId) return refuse(res, 400, "refresh_token_not_found", "Invalid Refresh Token");
        return send(res, 200, session(users.get(userId)));
      }
      if (grant === "pkce") {
        const entry = codes.get(body.auth_code);
        if (!entry) return refuse(res, 400, "flow_state_not_found", "invalid flow state");
        const verifier = createHash("sha256").update(body.code_verifier ?? "").digest("base64url");
        if (entry.challenge && verifier !== entry.challenge) {
          return refuse(res, 400, "bad_code_verifier", "code challenge does not match");
        }
        codes.delete(body.auth_code);
        return send(res, 200, session(users.get(entry.userId)));
      }
      return refuse(res, 400, "unsupported_grant_type", "unsupported grant");
    }

    if (path === "/auth/v1/user") {
      const user = bearerUser(req);
      if (!user) return refuse(res, 401, "bad_jwt", "invalid JWT");
      if (req.method === "PUT") {
        const body = await read(req);
        if (body.password) user.password = body.password;
        if (body.data) user.user_metadata = { ...user.user_metadata, ...body.data };
      }
      return send(res, 200, publicUser(user));
    }
    if (path === "/auth/v1/logout") return send(res, 204);

    if (path === "/auth/v1/otp" && req.method === "POST") {
      const body = await read(req);
      const user = byEmail(body.email);
      const redirectTo = url.searchParams.get("redirect_to") ?? body.options?.emailRedirectTo ?? BASE;
      if (user) mail(user.email, "magiclink", emailLink(user, "magiclink", redirectTo, body.code_challenge ?? null));
      return send(res, 200, {});
    }
    if (path === "/auth/v1/recover" && req.method === "POST") {
      const body = await read(req);
      const user = byEmail(body.email);
      const redirectTo = url.searchParams.get("redirect_to") ?? BASE;
      if (user) mail(user.email, "recovery", emailLink(user, "recovery", redirectTo, body.code_challenge ?? null));
      return send(res, 200, {});
    }

    // The admin API the backend calls with the secret key.
    if (path === "/auth/v1/invite" && req.method === "POST") {
      if (!isAdmin(req)) return refuse(res, 401, "no_authorization", "secret key required");
      const body = await read(req);
      if (byEmail(body.email)) return refuse(res, 422, "email_exists", "A user with this email address has already been registered");
      const user = await createUser(body.email, { data: body.data ?? {}, invited: true });
      mail(user.email, "invite", emailLink(user, "invite", url.searchParams.get("redirect_to")));
      return send(res, 200, publicUser(user));
    }
    if (path === "/auth/v1/admin/generate_link" && req.method === "POST") {
      if (!isAdmin(req)) return refuse(res, 401, "no_authorization", "secret key required");
      const body = await read(req);
      let user = byEmail(body.email);
      if (body.type === "invite") {
        if (user) return refuse(res, 422, "email_exists", "A user with this email address has already been registered");
        user = await createUser(body.email, { data: body.data ?? {}, invited: true });
      }
      if (!user) return refuse(res, 404, "user_not_found", "User not found");
      return send(res, 200, { ...publicUser(user), action_link: emailLink(user, body.type, body.redirect_to) });
    }

    return refuse(res, 404, "not_found", `${req.method} ${path}`);
  } catch (error) {
    console.error(error);
    return refuse(res, 500, "unexpected_failure", String(error));
  }
}).listen(PORT, () => console.log(`fake auth on ${BASE}`));
