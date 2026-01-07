/**
 * OTP Code Extractor
 * 
 * Extracts verification codes from SMS text using:
 * - Service-specific patterns (WhatsApp, Google, etc.)
 * - Generic numeric patterns
 * - Keyword-based extraction
 */

import { CodeExtractionResult, CodePattern } from './types'

// ============================================
// CODE PATTERNS
// ============================================

const SERVICE_PATTERNS: CodePattern[] = [
    {
        name: 'whatsapp',
        regex: /(?:whatsapp|wa).*?(\d{6})/i,
        service: 'wa',
        keywords: ['whatsapp', 'wa'],
        confidenceBoost: 0.2,
    },
    {
        name: 'telegram',
        regex: /(?:telegram|tg).*?(\d{5})/i,
        service: 'tg',
        keywords: ['telegram'],
        confidenceBoost: 0.2,
    },
    {
        name: 'google',
        regex: /[gG]-?(\d{6})/,
        service: 'go',
        keywords: ['google', 'gmail'],
        confidenceBoost: 0.2,
    },
    {
        name: 'facebook',
        regex: /(?:facebook|fb|meta).*?(\d{6}|[A-Z0-9]{8})/i,
        service: 'fb',
        keywords: ['facebook', 'fb', 'meta', 'instagram'],
        confidenceBoost: 0.2,
    },
    {
        name: 'twitter',
        regex: /(?:twitter|x\.com).*?(\d{6,8})/i,
        service: 'tw',
        keywords: ['twitter', 'x.com'],
        confidenceBoost: 0.2,
    },
    {
        name: 'microsoft',
        regex: /(?:microsoft|outlook|live).*?(\d{6,7})/i,
        service: 'mm',
        keywords: ['microsoft', 'outlook', 'live'],
        confidenceBoost: 0.2,
    },
    {
        name: 'amazon',
        regex: /(?:amazon|aws).*?(\d{6})/i,
        service: 'am',
        keywords: ['amazon', 'aws'],
        confidenceBoost: 0.2,
    },
    {
        name: 'uber',
        regex: /(?:uber).*?(\d{4})/i,
        service: 'ub',
        keywords: ['uber'],
        confidenceBoost: 0.2,
    },
]

const GENERIC_PATTERNS: CodePattern[] = [
    {
        name: 'generic-6-digit',
        regex: /(?:code|verification|verify|otp|pin)[\s:]*(\d{6})/i,
        keywords: ['code', 'verification', 'verify', 'otp', 'pin'],
    },
    {
        name: 'generic-5-digit',
        regex: /(?:code|verification|verify|otp|pin)[\s:]*(\d{5})/i,
        keywords: ['code', 'verification', 'verify', 'otp', 'pin'],
    },
    {
        name: 'generic-4-digit',
        regex: /(?:code|verification|verify|otp|pin)[\s:]*(\d{4})/i,
        keywords: ['code', 'verification', 'verify', 'otp', 'pin'],
    },
    {
        name: 'generic-8-digit',
        regex: /(?:code|verification|verify|otp|pin)[\s:]*(\d{8})/i,
        keywords: ['code', 'verification', 'verify', 'otp', 'pin'],
    },
    // Standalone numeric codes (lower confidence)
    {
        name: 'standalone-6-digit',
        regex: /\b(\d{6})\b/,
    },
    {
        name: 'standalone-5-digit',
        regex: /\b(\d{5})\b/,
    },
    {
        name: 'standalone-4-digit',
        regex: /\b(\d{4})\b/,
    },
]

// ============================================
// EXTRACTOR CLASS
// ============================================

export class CodeExtractor {
    /**
     * Extract OTP code from SMS text
     */
    static extract(
        text: string,
        serviceCode?: string
    ): CodeExtractionResult | null {
        if (!text) return null

        // Try service-specific patterns first
        if (serviceCode) {
            const result = this.tryServicePatterns(text, serviceCode)
            if (result) return result
        }

        // Try generic patterns with keywords
        const genericResult = this.tryGenericPatterns(text, true)
        if (genericResult) return genericResult

        // Try generic patterns without keywords
        const looseResult = this.tryGenericPatterns(text, false)
        if (looseResult) return looseResult

        return null
    }

    /**
     * Try service-specific patterns
     */
    private static tryServicePatterns(
        text: string,
        serviceCode: string
    ): CodeExtractionResult | null {
        for (const pattern of SERVICE_PATTERNS) {
            if (pattern.service === serviceCode) {
                const match = text.match(pattern.regex)
                if (match && match[1]) {
                    const hasKeywords = pattern.keywords
                        ? pattern.keywords.some(kw =>
                            text.toLowerCase().includes(kw.toLowerCase())
                        )
                        : false

                    return {
                        code: match[1],
                        confidence: hasKeywords
                            ? 0.95
                            : 0.85,
                        method: 'service-pattern',
                        pattern: pattern.name,
                    }
                }
            }
        }

        return null
    }

    /**
     * Try generic OTP patterns
     */
    private static tryGenericPatterns(
        text: string,
        requireKeywords: boolean
    ): CodeExtractionResult | null {
        for (const pattern of GENERIC_PATTERNS) {
            const match = text.match(pattern.regex)
            if (match && match[1]) {
                // Check keywords if required
                if (requireKeywords && pattern.keywords) {
                    const hasKeywords = pattern.keywords.some(kw =>
                        text.toLowerCase().includes(kw.toLowerCase())
                    )
                    if (!hasKeywords) continue
                }

                const confidence = this.calculateConfidence(
                    match[1],
                    text,
                    pattern,
                    requireKeywords
                )

                return {
                    code: match[1],
                    confidence,
                    method: requireKeywords ? 'keyword' : 'regex',
                    pattern: pattern.name,
                }
            }
        }

        return null
    }

    /**
     * Calculate extraction confidence
     */
    private static calculateConfidence(
        code: string,
        text: string,
        pattern: CodePattern,
        hasKeywords: boolean
    ): number {
        let confidence = 0.5 // Base confidence

        // Boost for keywords
        if (hasKeywords && pattern.keywords) {
            confidence += pattern.confidenceBoost || 0.3
        }

        // Boost for common code lengths
        if ([4, 5, 6].includes(code.length)) {
            confidence += 0.1
        }

        // Boost for proximity to keywords
        const keywordIndex = this.findKeywordIndex(text.toLowerCase())
        const codeIndex = text.indexOf(code)
        if (keywordIndex !== -1 && codeIndex !== -1) {
            const distance = Math.abs(codeIndex - keywordIndex)
            if (distance < 20) confidence += 0.1
        }

        // Reduce for very short codes without context
        if (code.length === 4 && !hasKeywords) {
            confidence -= 0.2
        }

        return Math.min(Math.max(confidence, 0), 1)
    }

    /**
     * Find index of verification keywords
     */
    private static findKeywordIndex(text: string): number {
        const keywords = [
            'code', 'verification', 'verify', 'otp', 'pin',
            'password', 'one-time', 'confirm', 'authenticate'
        ]

        for (const keyword of keywords) {
            const index = text.indexOf(keyword)
            if (index !== -1) return index
        }

        return -1
    }

    /**
     * Extract all possible codes (for debugging)
     */
    static extractAll(text: string): CodeExtractionResult[] {
        const results: CodeExtractionResult[] = []

        // Try all patterns
        const allPatterns = [...SERVICE_PATTERNS, ...GENERIC_PATTERNS]

        for (const pattern of allPatterns) {
            const match = text.match(pattern.regex)
            if (match && match[1]) {
                results.push({
                    code: match[1],
                    confidence: this.calculateConfidence(
                        match[1],
                        text,
                        pattern,
                        false
                    ),
                    method: 'regex',
                    pattern: pattern.name,
                })
            }
        }

        // Sort by confidence
        return results.sort((a, b) => b.confidence - a.confidence)
    }

    /**
     * Validate extracted code
     */
    static isValidCode(code: string): boolean {
        // Must be numeric
        if (!/^\d+$/.test(code)) return false

        // Common lengths: 4, 5, 6, 7, 8
        const length = code.length
        return length >= 4 && length <= 8
    }
}
