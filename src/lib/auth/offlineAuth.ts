/**
 * Offline authentication helper.
 *
 * Lets a user sign in to the desktop / PWA app even when there is no
 * internet connection, using the credentials they last successfully
 * used while online.
 *
 * Security model:
 *  - We NEVER store the raw password.
 *  - On a successful ONLINE login we store: email, a PBKDF2-SHA256
 *    hash of the password (with random per-user salt + 150k iterations),
 *    the user id, and the most recent valid Supabase session JSON.
 *  - On an OFFLINE login attempt we recompute the hash with the stored
 *    salt and compare in constant time. On match we restore the cached
 *    Supabase session into the supabase-js client so RLS-aware reads of
 *    the local Dexie cache continue to work.
 *  - Stored data is namespaced per email and lives in localStorage so it
 *    survives Tauri / browser restarts.
 *
 * When the device comes back online the next online login will refresh
 * both the cached hash and the cached session automatically.
 */

import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "applestore.offlineAuth.v1";
const ITERATIONS = 150_000;
const KEY_LENGTH_BITS = 256;

type StoredCredential = {
  email: string;
  user_id: string;
  salt_b64: string;
  hash_b64: string;
  session: Session | null;
  saved_at: number; // epoch ms
};

type Store = Record<string, StoredCredential>; // keyed by lowercased email

// ---------- low-level helpers ----------

function getSubtle(): SubtleCrypto | null {
  if (typeof crypto !== "undefined" && crypto.subtle) return crypto.subtle;
  return null;
}

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBuf(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function derive(
  password: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  const subtle = getSubtle();
  if (!subtle) throw new Error("WebCrypto unavailable");
  const keyMaterial = await subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_LENGTH_BITS
  );
  return new Uint8Array(bits);
}

// ---------- store I/O ----------

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota errors */
  }
}

function key(email: string) {
  return email.trim().toLowerCase();
}

// ---------- public API ----------

/**
 * Persist a successful online login so it can be reused offline next time.
 * Call this immediately after a successful supabase.auth.signInWithPassword.
 */
export async function rememberOnlineLogin(
  email: string,
  password: string,
  session: Session | null,
  userId: string | null
): Promise<void> {
  if (!email || !password || !userId) return;
  if (!getSubtle()) return; // silently skip if crypto unavailable

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);

  const store = readStore();
  store[key(email)] = {
    email: email.trim(),
    user_id: userId,
    salt_b64: bufToB64(salt.buffer),
    hash_b64: bufToB64(hash.buffer),
    session: session ?? null,
    saved_at: Date.now(),
  };
  writeStore(store);
}

/**
 * Update only the cached session for an existing offline credential
 * (e.g. after a token refresh) without re-prompting for password.
 */
export function updateCachedSession(email: string, session: Session | null) {
  const store = readStore();
  const entry = store[key(email)];
  if (!entry) return;
  entry.session = session;
  entry.saved_at = Date.now();
  writeStore(store);
}

/**
 * Whether this device has a cached credential for `email`. If `email` is
 * omitted, returns true when ANY offline credential exists.
 */
export function hasOfflineCredential(email?: string): boolean {
  const store = readStore();
  if (!email) return Object.keys(store).length > 0;
  return !!store[key(email)];
}

/**
 * Attempt to authenticate `email` + `password` against the locally cached
 * credential. On success the cached Supabase session is restored so the
 * rest of the app behaves as if a normal sign-in happened.
 *
 * Returns the user id on success, or throws an Error on failure.
 */
export async function offlineSignIn(
  email: string,
  password: string
): Promise<string> {
  if (!getSubtle()) {
    throw new Error("এই ডিভাইসে অফলাইন লগইন সাপোর্ট নেই");
  }
  const store = readStore();
  const entry = store[key(email)];
  if (!entry) {
    throw new Error(
      "এই ইমেইলের কোনো অফলাইন credential পাওয়া যায়নি — অন্তত একবার অনলাইনে লগইন করুন"
    );
  }

  const salt = b64ToBuf(entry.salt_b64);
  const expected = b64ToBuf(entry.hash_b64);
  const candidate = await derive(password, salt);

  if (!constantTimeEqual(expected, candidate)) {
    throw new Error("ভুল পাসওয়ার্ড");
  }

  // Restore the cached session into the supabase client so RLS-aware
  // local reads keep working. If the access_token is expired Supabase
  // will try to refresh it the next time we go online — that's fine.
  if (entry.session) {
    try {
      await supabase.auth.setSession({
        access_token: entry.session.access_token,
        refresh_token: entry.session.refresh_token,
      });
    } catch {
      /* token may be expired; offline reads from Dexie still work */
    }
  }

  return entry.user_id;
}

/**
 * Forget the offline credential for an email (e.g. on explicit "forget
 * this device" action). Pass no argument to wipe ALL cached creds.
 */
export function forgetOfflineCredential(email?: string) {
  if (!email) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  const store = readStore();
  delete store[key(email)];
  writeStore(store);
}

/**
 * Convenience: list emails that currently have an offline credential.
 */
export function listOfflineEmails(): string[] {
  return Object.values(readStore()).map((e) => e.email);
}