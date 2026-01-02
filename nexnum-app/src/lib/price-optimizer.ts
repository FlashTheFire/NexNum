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
        rate?: number
        rate1?: number
        rate3?: number
        rate24?: number
        rate72?: number
        rate168?: number
        rate720?: number  // 7-day rolling average
        [key: string]: any
    }
    /** Raw data for debugging */
    raw?: any
}

export interface OptimizerConfig {
    /** Weight for cost factor (0-1), default: 0.5 */
    costWeight: number
    /** Weight for stock availability (0-1), default: 0.3 */
    stockWeight: number
    /** Weight for success rate (0-1), default: 0.2 */
    rateWeight: number
    /** Minimum stock threshold (exclude options below this), default: 0 */
    minStock: number
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
        rateScore: number
    }
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_OPTIMIZER_CONFIG: OptimizerConfig = {
    costWeight: 0.5,      // Cost is most important
    stockWeight: 0.3,     // Stock availability matters
    rateWeight: 0.2,      // Success rate is bonus
    minStock: 0,          // Accept even sold-out for price comparison
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
        const totalWeight = this.config.costWeight + this.config.stockWeight + this.config.rateWeight
        if (totalWeight > 0) {
            this.config.costWeight /= totalWeight
            this.config.stockWeight /= totalWeight
            this.config.rateWeight /= totalWeight
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
        // Filter by minimum stock
        const eligible = options.filter(opt => opt.count >= this.config.minStock)

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

        // Success Rate Score: Use best available rate metric
        let rateScore = 0.5 // Neutral default
        if (option.successRate !== undefined) {
            // Direct success rate (0-100, higher is better)
            rateScore = option.successRate / 100
        } else if (option.metadata) {
            // Use failure rates (inverted: lower failure = higher score)
            const rate720 = option.metadata.rate720
            const rate168 = option.metadata.rate168
            const rate72 = option.metadata.rate72
            const rate24 = option.metadata.rate24

            if (rate720 !== undefined && rate720 >= 0) {
                rateScore = 1 - (rate720 / 100)
            } else if (rate168 !== undefined && rate168 >= 0) {
                rateScore = 1 - (rate168 / 100)
            } else if (rate72 !== undefined && rate72 >= 0) {
                rateScore = 1 - (rate72 / 100)
            } else if (rate24 !== undefined && rate24 >= 0) {
                rateScore = 1 - (rate24 / 100)
            }
        }

        // Composite Score
        const score =
            (costScore * this.config.costWeight) +
            (stockScore * this.config.stockWeight) +
            (rateScore * this.config.rateWeight)

        return {
            ...option,
            score: Math.min(1, Math.max(0, score)), // Clamp to [0, 1]
            breakdown: {
                costScore,
                stockScore,
                rateScore
            }
        }
    }

    /**
     * Optimize a nested price structure (country > service > operators)
     * Returns flattened list with best operator per service
     */
    optimizePriceData(
        data: Record<string, Record<string, any>>,
        countryCode?: string
    ): Array<{
        country: string
        service: string
        operator: string
        cost: number
        count: number
        score?: number
    }> {
        const results: any[] = []

        for (const [serviceKey, serviceData] of Object.entries(data)) {
            if (typeof serviceData !== 'object' || serviceData === null) continue

            // Check if this service has multiple operators
            const operators: PriceOption[] = []

            for (const [operatorKey, opData] of Object.entries(serviceData)) {
                if (typeof opData !== 'object' || opData === null) continue

                const cost = Number(opData.cost ?? opData.price ?? 0)
                const count = Number(opData.count ?? opData.qty ?? 0)

                operators.push({
                    operator: operatorKey,
                    providerId: opData.provider_id?.toString(),
                    cost,
                    count,
                    metadata: opData,
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
