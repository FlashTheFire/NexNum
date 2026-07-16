import crypto from 'crypto';

// Have I Been Pwned API endpoint
const HIBP_API_URL = 'https://api.pwnedpasswords.com/range/';

/**
 * Result object returned from `checkPasswordBreach`.
 *   - pwned: true if the password appears in any breach.
 *   - count?: number – how many times that exact password was seen in breaches (0 if not pwned).
 */
export type PasswordBreachResult = {
  pwned: boolean;
  count?: number;   // only defined when pwned === true
};

/**
 * Checks whether a password has been exposed in any known breach
 * and also returns the number of times that exact password was observed.
 *
 * The implementation follows the k‑anonymity protocol used by Have‑I‑Been‑Pwned:
 *   1️⃣ Compute SHA‑1 hash of the password.
 *   2️⃣ Send the first 5 hex characters (the *prefix*) to the HIBP “range” endpoint.
 *   3️⃣ Receive a newline‑separated list of “suffix:count” pairs.
 *   4️⃣ Look for a suffix that matches the remaining 35 hash characters.
 *   5️⃣ If found, return { pwned: true, count: <the_number_after_the_colon> }.
 *   6️⃣ If not found, return { pwned: false }.
 *
 * The function **fails open** – any network error or non‑200 response results
 * in `{ pwned: false }` so that a temporary HIBP outage does not block users.
 */
export async function checkPasswordBreach(
  password: string
): Promise<PasswordBreachResult> {
  if (!password || typeof password !== 'string') {
    return { pwned: false };
  }

  try {
    // ----- 1️⃣ Compute SHA‑1 hash -----
    const sha1Hash = crypto
      .createHash('sha1')
      .update(password, 'utf8')
      .digest('hex')
      .toUpperCase();

    const prefix = sha1Hash.slice(0, 5);
    const suffix = sha1Hash.slice(5);

    // ----- 2️⃣ Query HIBP -----
    const response = await fetch(
      `${HIBP_API_URL}${prefix}`,
      {
        headers: {
          'User-Agent': 'NexNum-Auth-Service',
        },
      }
    );

    if (!response.ok) {
      // HIBP unavailable → treat as “not pwned”
      console.warn('[PasswordBreach] HIBP request failed – failing open');
      return { pwned: false };
    }

    const data = await response.text();
    const lines = data.split(/\r?\n/);

    // ----- 3️⃣ Find the matching suffix -----
    const match = lines.find((l) => l.startsWith(`${suffix}:`));
    if (!match) {
      return { pwned: false };
    }

    // The part after the colon is the *count* (how many times that exact password was seen)
    const count = Number(match.split(':')[1]);

    return { pwned: true, count };
  } catch (err) {
    // Unexpected error – also fail open
    console.warn('[PasswordBreach] Unexpected error:', err);
    return { pwned: false };
  }
}