/**
 * Isomorphic Crypto Utilities
 * 
 * Provides environment-agnostic implementations of cryptographic functions.
 * Resolves Next.js Edge Runtime warnings by avoiding direct 'crypto' module imports
 * where Web Crypto API equivalents exist.
 */

/**
 * Generate a cryptographically secure UUID (v4)
 * Native implementation for Edge and modern Node.js
 */
export function randomUUID(): string {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    // Fallback for older Node.js environments (if any) or SSR
    // This is wrapped to prevent Next.js from detecting it as a top-level Node import
    try {
        const nodeCrypto = require('crypto');
        return nodeCrypto.randomUUID();
    } catch {
        // Basic fallback for environments with no crypto support (extreme edge case)
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }
}

/**
 * Timing-safe string comparison
 * Prevents timing attacks when comparing sensitive tokens/signatures.
 * 
 * NOTE: This implementation is synchronous and environment-agnostic.
 */
export function timingSafeEqual(a: string | Buffer, b: string | Buffer): boolean {
    const bufA = typeof a === 'string' ? Buffer.from(a) : a;
    const bufB = typeof b === 'string' ? Buffer.from(b) : b;

    if (bufA.length !== bufB.length) {
        return false;
    }

    // Use Node's native timingSafeEqual if available for maximum hardware security
    try {
        const nodeCrypto = require('crypto');
        if (nodeCrypto.timingSafeEqual) {
            return nodeCrypto.timingSafeEqual(bufA, bufB);
        }
    } catch {
        // Fallback to manual bitwise comparison for Edge Runtime
    }

    let result = 0;
    for (let i = 0; i < bufA.length; i++) {
        result |= bufA[i] ^ bufB[i];
    }
    return result === 0;
}
