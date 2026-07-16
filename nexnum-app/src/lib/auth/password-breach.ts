import crypto from 'crypto';

// Have I Been Pwned API endpoint
const HIBP_API_URL = 'https://api.pwnedpasswords.com/range/';

// Result object returned from `checkPasswordBreach`.
//   - pwned: true if the password appears in any breach.
//   - count?: number – how many times that exact password was seen in breaches (0 if not pwned).
export type PasswordBreachResult = {
  pwned: boolean;
  count?: number;   // only defined when pwned === true
};

/**
 * Runtime switch – set this env var to `"true"` to completely bypass the breach-check.
 * Example usage (in a Docker/K8s env or .env file):
 *   DISABLE_PASSWORD_BREACH_CHECK=true
 */
const DISABLE_PASSWORD_BREACH_CHECK =
  process.env.DISABLE_PASSWORD_BREACH_CHECK?.toLowerCase() === 'true';

/**
 * Checks whether a password has been exposed in any known breach
 * and also returns the number of times that exact password was observed.
 *
 * The implementation follows the k‑anonymity protocol used by Have‑I‑Been‑Pwned:
 *   1️⃣ Compute SHA‑1 hash of the password.
 *   2️⃣ Send the first 5 hex characters (the *prefix*) to the HIBP “range” endpoint.
 *   3️⃣ Receive a newline‑separated list of “suffix:count” pairs.
 *   4️⃣ Look for a suffix that matches the remaining 35 hash characters.
 *   5️⃣ If found, return `{ pwned: true, count: <the_number_after_the_colon> }`.
 *   6️⃣ If not found, return `{ pwned: false }`.
 *
 * The function **fails open** – any network error or non‑200 response results
 * in `{ pwned: false }` so that a temporary HIBP outage does not block users.
 */
export async function checkPasswordBreach(
  password: string
): Promise<PasswordBreachResult> {
  // ---------------------------------------------------------
  // 0️⃣  DEV / DISABLE FLAG
  // ---------------------------------------------------------
  if (DISABLE_PASSWORD_BREACH_CHECK) {
    console.warn('[PasswordBreach] DISABLE_PASSWORD_BREACH_CHECK is set – skipping HIBP check');
    return { pwned: false };
  }

  // ---------------------------------------------------------
  // 1️⃣  Guard‑clause: empty / non‑string input
  // ---------------------------------------------------------
  if (!password || typeof password !== 'string') {
    return { pwned: false };
  }

  // Trim whitespace that could affect hashing
  const cleanPassword = password.trim();

  // ---------------------------------------------------------
  // 2️⃣  Compute SHA‑1 hash (upper‑case hex)
  // ---------------------------------------------------------
  const sha1Hash = crypto
    .createHash('sha1')
    .update(cleanPassword, 'utf8')
    .digest('hex')
    .toUpperCase();

  const prefix = sha1Hash.slice(0, 5);
  const suffix = sha1Hash.slice(5);

  // ---------------------------------------------------------
  // 3️⃣  Query the HIBP “range” endpoint
  // ---------------------------------------------------------
  const response = await fetch(
    `${HIBP_API_URL}${prefix}`,
    {
      headers: {
        'User-Agent': 'NexNum-Auth-Service',
      },
    }
  );

  // ---------------------------------------------------------
  // 4️⃣  Fail‑open on HTTP error – treat as “not pwned”
  // ---------------------------------------------------------
  if (!response.ok) {
    console.warn(
      '[PasswordBreach] HIBP request failed – treating as NOT‑pwned',
      response.status
    );
    return { pwned: false };
  }

  // ---------------------------------------------------------
  // 5️⃣  Parse the newline‑separated “suffix:count” pairs
  // ---------------------------------------------------------
  const data = await response.text();
  const lines = data.split(/\r?\n/);

  // ---------------------------------------------------------
  // 6️⃣  Find the matching suffix
  // ---------------------------------------------------------
  const match = lines.find((l) => l.startsWith(`${suffix}:`));
  if (!match) {
    return { pwned: false };
  }

  // The part after the colon is the *count* (how many times that exact password was seen)
  const count = Number(match.split(':')[1]);

  // Return the rich result – caller can read both the boolean flag and the count.
  return { pwned: true, count };
}