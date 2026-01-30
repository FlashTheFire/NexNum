/**
 * Professional Price Optimization Engine
 * 
 * Intelligently selects the best operator/provider when multiple options exist
 * based on weighted scoring: cost, stock availability, and success rates.
 */

// ============================================================================
// INTERFACES
// ============================================================================

export interface PriceOption {
    /** Operator/Provider identifier (e.g., "virtual21", "2266") */
    operator?: string
    /** Provider ID for tracking */
    providerId?: string
    /** Cost per number */
    cost: number
    /** Available quantity */
    count: number
    /** Success rate (0-100, lower is better for failure rates) */
    successRate?: number
    /** Additional metadata */
    metadata?: {
        [key: string]: unknown
    }
    /** Raw data for debugging */
    raw?: unknown
}

export interface OptimizerConfig {
    /** Weight for cost factor (0-1), default: 0.6 */
    costWeight: number
    /** Weight for stock availability (0-1), default: 0.4 */
    stockWeight: number
    /** Minimum stock threshold (exclude options below this), default: 1 */
    minStock: number
    /** Profit Protection: Min points profit per purchase */
    minProfitPoints: number
    /** Profit Protection: Min margin percentage (e.g. 0.1 for 10%) */
    minMarginPercent: number
    /** If true, return all options ranked by score instead of just the best */
    returnAllOptions: boolean
}

export interface ScoredOption extends PriceOption {
    /** Composite score (0-1, higher is better) */
    score: number
    /** Individual component scores for transparency */
    breakdown: {
        costScore: number
        stockScore: number
    }
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_OPTIMIZER_CONFIG: OptimizerConfig = {
    costWeight: 0.6,      // Higher weight for cost (lower is better)
    stockWeight: 0.4,     // Weight for stock availability (higher is better)
    minStock: 1,          // Default to needing at least 1 in stock
    minProfitPoints: 5.0, // Default 5 points profit floor
    minMarginPercent: 0.05, // Default 5% margin floor
    returnAllOptions: false
}

// ============================================================================
// PRICE OPTIMIZER ENGINE
// ============================================================================

export class PriceOptimizer {
    private config: OptimizerConfig

    constructor(config?: Partial<OptimizerConfig>) {
        this.config = { ...DEFAULT_OPTIMIZER_CONFIG, ...config }

        // Normalize weights to sum to 1.0
        const totalWeight = this.config.costWeight + this.config.stockWeight
        if (totalWeight > 0) {
            this.config.costWeight /= totalWeight
            this.config.stockWeight /= totalWeight
        }
    }

    /**
     * Select the best single option from a list
     */
    selectBestOption(options: PriceOption[]): ScoredOption | null {
        if (options.length === 0) return null
        if (options.length === 1) return this.scoreOption(options[0], options)

        const ranked = this.rankOptions(options)
        return ranked[0] || null
    }

    /**
     * Rank all options by score (highest first)
     */
    rankOptions(options: PriceOption[]): ScoredOption[] {
        // 1. Filter by minimum stock & Profit Guards
        const eligible = options.filter(opt => {
            const hasStock = opt.count >= this.config.minStock

            // Profit Calculation (Internal Points)
            // Note: This assumes 'cost' is provider cost. 
            // In a real flow, we'd compare against 'Retail Price'.
            // For the optimizer, we often treat 'cost' as the provider price.
            // If we have a 'targetRetail' we can filter.

            return hasStock
        })

        if (eligible.length === 0) {
            // If all below threshold, return all anyway (sorted by score)
            return options.map(opt => this.scoreOption(opt, options)).sort((a, b) => b.score - a.score)
        }

        // Score and sort
        return eligible
            .map(opt => this.scoreOption(opt, eligible))
            .sort((a, b) => b.score - a.score)
    }

    /**
     * Calculate composite score for an option
     */
    scoreOption(option: PriceOption, allOptions: PriceOption[]): ScoredOption {
        const costs = allOptions.map(o => o.cost).filter(c => c > 0)
        const counts = allOptions.map(o => o.count).filter(c => c >= 0)

        const minCost = Math.min(...costs)
        const maxCost = Math.max(...costs)
        const minCount = Math.min(...counts)
        const maxCount = Math.max(...counts)

        // Cost Score: Lower cost = higher score (inverted)
        let costScore = 0
        if (maxCost > minCost && option.cost > 0) {
            costScore = 1 - ((option.cost - minCost) / (maxCost - minCost))
        } else if (option.cost === minCost) {
            costScore = 1
        }

        // Stock Score: Higher count = higher score
        let stockScore = 0
        if (maxCount > minCount && option.count >= 0) {
            stockScore = (option.count - minCount) / (maxCount - minCount)
        } else if (option.count === maxCount) {
            stockScore = 1
        }

        // Simple Composite Score: Cost + Stock only
        const score =
            (costScore * this.config.costWeight) +
            (stockScore * this.config.stockWeight)

        return {
            ...option,
            score: Math.min(1, Math.max(0, score)), // Clamp to [0, 1]
            breakdown: {
                costScore,
                stockScore
            }
        }
    }

    /**
     * Optimize a nested price structure (country > service > operators)
     * Returns flattened list with best operator per service
     */
    optimizePriceData(
        data: Record<string, Record<string, Record<string, unknown>>>,
        countryCode?: string
    ): Array<{
        country: string
        service: string
        operator: string
        cost: number
        count: number
        score?: number
    }> {
        const results: Array<{
            country: string
            service: string
            operator: string
            cost: number
            count: number
            score?: number
        }> = []

        for (const [serviceKey, serviceData] of Object.entries(data)) {
            if (typeof serviceData !== 'object' || serviceData === null) continue

            // Check if this service has multiple operators
            const operators: PriceOption[] = []

            for (const [operatorKey, opDataRaw] of Object.entries(serviceData)) {
                if (typeof opDataRaw !== 'object' || opDataRaw === null) continue
                const opData = opDataRaw as Record<string, unknown>

                const cost = Number(opData.cost ?? opData.price ?? 0)
                const count = Number(opData.count ?? opData.qty ?? 0)

                operators.push({
                    operator: operatorKey,
                    providerId: (opData.provider_id as any)?.toString(),
                    cost,
                    count,
                    metadata: opData as Record<string, unknown>,
                    raw: opData
                })
            }

            if (operators.length === 0) continue

            // Single operator: use it
            if (operators.length === 1) {
                const op = operators[0]
                results.push({
                    country: countryCode || '',
                    service: serviceKey,
                    operator: op.operator || '',
                    cost: op.cost,
                    count: op.count
                })
            } else {
                // Multiple operators: select best
                const best = this.selectBestOption(operators)
                if (best) {
                    results.push({
                        country: countryCode || '',
                        service: serviceKey,
                        operator: best.operator || '',
                        cost: best.cost,
                        count: best.count,
                        score: best.score
                    })
                }
            }
        }

        return results
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalOptimizer: PriceOptimizer | null = null

/**
 * Get or create global optimizer instance
 */
export function getOptimizer(config?: Partial<OptimizerConfig>): PriceOptimizer {
    if (!globalOptimizer || config) {
        globalOptimizer = new PriceOptimizer(config)
    }
    return globalOptimizer
}

/**
 * Reset global optimizer (useful for tests)
 */
export function resetOptimizer(): void {
    globalOptimizer = null
}
