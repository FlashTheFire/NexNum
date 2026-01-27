/**
 * Forensic Risk Sentinel
 * 
 * The central intelligence brain of the NexNum security perimeter.
 * Aggregates signals from:
 * 1. Device Fingerprinting (Identity Fidelity)
 * 2. Request Signing (Integrity)
 * 3. Origin Guard (Reputation & Forensic IP)
 * 4. Bot Attestation (Behavioral)
 * 
 * Result: A RiskScore (0-100) and Adaptive Friction decisions.
 */

import { DeviceFingerprint, compareFingerprints } from './fingerprint'
import { logger } from '@/lib/core/logger'

export type RiskLevel = 'low' | 'suspicious' | 'high' | 'malicious'

export interface RiskSignal {
    fingerprint?: DeviceFingerprint
    storedFingerprint?: DeviceFingerprint
    isBot?: boolean
    signatureValid?: boolean
    originValid?: boolean
    ipReputation?: number // 0-1 (1 = good)
}

export interface RiskAssessment {
    score: number
    level: RiskLevel
    factors: string[]
    action: 'allow' | 'challenge' | 'block'
}

const THRESHOLDS = {
    CHALLENGE: 40,
    BLOCK: 75
}

export class RiskSentinel {
    /**
     * Perform a forensic request assessment
     */
    static assess(signals: RiskSignal): RiskAssessment {
        let score = 0
        const factors: string[] = []

        // 1. Fingerprint Similarity (Account Takeover Protection)
        if (signals.fingerprint && signals.storedFingerprint) {
            const similarity = compareFingerprints(signals.fingerprint, signals.storedFingerprint)
            if (similarity < 0.6) {
                score += 35
                factors.push(`Fingerprint Mismatch (${Math.round(similarity * 100)}% similarity)`)
            }
        } else if (signals.fingerprint) {
            // New device, low risk increase
            score += 5
            factors.push('New Device/Fingerprint')
        }

        // 2. Automated Traffic Detection
        if (signals.isBot) {
            score += 50
            factors.push('Automated Traffic Patterns (Bot Attestation)')
        }

        // 3. Request Integrity (HMAC Signing)
        if (signals.signatureValid === false) {
            score += 60
            factors.push('Request Integrity Violation (Invalid Signature)')
        }

        // 4. Origin & Reputation
        if (signals.originValid === false) {
            score += 40
            factors.push('Unauthorized Origin/Referer')
        }

        if (signals.ipReputation !== undefined && signals.ipReputation < 0.5) {
            const repCost = Math.round((1 - signals.ipReputation) * 30)
            score += repCost
            factors.push('Low IP Reputation')
        }

        // Cap score at 100
        score = Math.min(score, 100)

        // Determine Level & Action
        let level: RiskLevel = 'low'
        let action: 'allow' | 'challenge' | 'block' = 'allow'

        if (score >= THRESHOLDS.BLOCK) {
            level = 'malicious'
            action = 'block'
        } else if (score >= THRESHOLDS.CHALLENGE) {
            level = 'high'
            action = 'challenge'
        } else if (score >= 20) {
            level = 'suspicious'
            action = 'challenge'
        }

        return { score, level, factors, action }
    }

    /**
     * Unified logging for risk assessment
     */
    static logAssessment(userId: string | undefined, assessment: RiskAssessment, context: any) {
        if (assessment.score < 20) return // Skip logging clean requests

        const logMsg = `[RiskSentinel] ${assessment.level.toUpperCase()} risk detected (${assessment.score}) for ${userId || 'guest'}`

        if (assessment.level === 'malicious') {
            logger.error(logMsg, { factors: assessment.factors, ...context })
        } else {
            logger.warn(logMsg, { factors: assessment.factors, ...context })
        }
    }
}
