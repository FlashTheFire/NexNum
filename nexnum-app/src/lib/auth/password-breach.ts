import { Hasher } from 'bcrypt'
import crypto from 'crypto'

// Have I Been Pwned API endpoint
const HIBP_API_URL = 'https://api.pwnedpasswords.com/range/'

/**
 * Check if a password has been compromised in data breaches using k-anonymity model
 *
 * @param password - The plain text password to check
 * @returns true if password has been pwned, false otherwise
 *
 * Implementation follows k-anonymity model:
 * 1. Hash password with SHA-1
 * 2. Send first 5 characters of hash to HIBP API
 * 3. Compare remaining 35 characters against hash suffixes returned
 */
export async function checkPasswordBreach(password: string): Promise<boolean> {
  if (!password || typeof password !== 'string') {
    return false
  }

  try {
    // Step 1: SHA-1 hash the password
    const sha1Hash = crypto.createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()

    // Split into first 5 chars (prefix) and remaining 35 chars (suffix)
    const prefix = sha1Hash.slice(0, 5)
    const suffix = sha1Hash.slice(5)

    // Step 2: Request hash suffixes from HIBP API
    const response = await fetch(`${HIBP_API_URL}${prefix}`, {
      headers: {
        'User-Agent': 'NexNum-Auth-Service'
      }
    })

    if (!response.ok) {
      // Fail-open: if service is unavailable, assume password is NOT compromised
      // This prevents locking users out due to external service issues
      console.warn('[PasswordBreach] Unable to contact HIBP API, failing open')
      return false
    }

    const data = await response.text()

    // Step 3: Check if our suffix matches any of the returned suffixes
    const hashSuffixes = data.split('\r\n').map(line => line.split(':')[0])
    const isPwned = hashSuffixes.some(hashSuffix =>
      hashSuffix.toUpperCase() === suffix
    )

    if (isPwned) {
      console.warn('[PasswordBreach] Password found in breach database')
    }

    return isPwned
  } catch (error) {
    // Fail-open: if any error occurs, assume password is NOT compromised
    // This prevents blocking legitimate users due to service issues
    console.warn('[PasswordBreach] Error checking password breach, failing open:', error)
    return false
  }
}