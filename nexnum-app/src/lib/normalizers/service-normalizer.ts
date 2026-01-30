import { SERVICE_OVERRIDES, normalizeServiceName, generateCanonicalCode } from './service-identity'
import metadata from '@/data/metadata.json'

// Use stop words from metadata
// Use stop words from metadata
const STOP_WORDS = new Set((metadata as any).searchConfig?.stopWords || [
    "the", "a", "an", "in", "on", "at", "for", "to", "of", "and", "sms", "verification", "code", "verify"
]);

export interface ServiceData {
    provider: string
    externalId: string
    name: string
    code?: string
    price?: number
    originalPrice?: number
    count?: number
    isActive?: boolean
}

export interface AggregatedService {
    canonicalName: string
    canonicalCode: string
    codes: string[] // CHANGED: Set<string> -> string[] for JSON safety
    providers: {
        provider: string
        externalId: string
        name: string
        code: string | undefined
        price: number
        originalPrice?: number
        count: number
        isActive: boolean
    }[]
    totalProviders: number
    bestPrice: number
    priceRange: { min: number, max: number }
}

// Disjoint Set (Union-Find)
class UnionFind {
    parent: number[]
    // Track providers in each set to enforce "One Provider Per Group" constraint
    providers: Set<string>[]

    constructor(size: number, initialServices: ServiceData[]) {
        this.parent = Array.from({ length: size }, (_, i) => i);
        this.providers = initialServices.map(s => new Set([s.provider]));
    }

    find(i: number): number {
        if (this.parent[i] !== i) this.parent[i] = this.find(this.parent[i]);
        return this.parent[i];
    }

    // Returns true if merge was successful, false if rejected due to provider collision
    union(i: number, j: number): boolean {
        const rootI = this.find(i);
        const rootJ = this.find(j);

        if (rootI === rootJ) return true; // Already merged

        // CONSTRAINT CHECK: Do the two groups share ANY provider?
        // If yes, we cannot merge, because a group cannot contain 2 entries from same provider.
        const smaller = this.providers[rootI].size < this.providers[rootJ].size ? this.providers[rootI] : this.providers[rootJ];
        const larger = this.providers[rootI].size < this.providers[rootJ].size ? this.providers[rootJ] : this.providers[rootI];

        for (const p of smaller) {
            if (larger.has(p)) return false; // REJECT MERGE
        }

        // Perform Merge
        this.parent[rootI] = rootJ;

        // Merge provider sets
        for (const p of this.providers[rootI]) {
            this.providers[rootJ].add(p);
        }
        // Free memory for the old root (optional, but good practice)
        this.providers[rootI].clear();

        return true;
    }
}

// Pre-compiled regex for speed
const CLEAN_REGEX_PARENS = /[\(\[].*?[\)\]]/g;
const CLEAN_REGEX_SYMBOLS = /[^a-z0-9 ]/g;
const CLEAN_REGEX_SPACES = /\s+/g;
// STOP_WORDS already defined at top of file
// Build golden rules from metadata.json via SERVICE_OVERRIDES
const GOLDEN_RULES: [RegExp, string][] = Object.entries(SERVICE_OVERRIDES)
    .map(([key, config]) => {
        const patterns = [key, ...(config.slugAliases || [])].join('|');
        return [new RegExp(`\\b(${patterns})\\b`, 'i'), config.displayName] as [RegExp, string];
    });

export function cleanName(name: string): string {
    return name.toLowerCase()
        .replace(CLEAN_REGEX_PARENS, '')
        .replace(CLEAN_REGEX_SYMBOLS, ' ')
        .trim()
        .replace(CLEAN_REGEX_SPACES, ' ');
}

function getGoldenName(cleanName: string): string | null {
    for (const [regex, canonical] of GOLDEN_RULES) {
        if (regex.test(cleanName)) return canonical;
    }
    return null;
}

// Optimized Score Calculation
function calculateScore(s1Clean: string, s2Clean: string, tokens1: Set<string>, tokens2: Set<string>): number {
    if (!s1Clean || !s2Clean) return 0;
    if (s1Clean === s2Clean) return 100;

    // 1. Substring Match
    // CAREFUL: "Amazon" in "AWS Amazon" -> 90. 
    // This is high, but the Provider Constraint will block it if strict rules apply.
    if (s1Clean.length > 3 && s2Clean.length > 3) {
        if (s1Clean.includes(s2Clean) || s2Clean.includes(s1Clean)) return 90;
    }

    // 2. Token Jaccard
    let intersection = 0;
    const [smaller, larger] = tokens1.size < tokens2.size ? [tokens1, tokens2] : [tokens2, tokens1];
    for (const t of smaller) {
        if (larger.has(t)) intersection++;
    }

    if (intersection > 0) {
        const union = tokens1.size + tokens2.size - intersection;
        const jaccard = intersection / union;
        if (jaccard > 0.6) return 85;
        if (jaccard > 0.4) return 60;
    }

    // 3. Levenshtein for Typos
    const lenDiff = Math.abs(s1Clean.length - s2Clean.length);
    if (lenDiff < 3 && intersection === 0) {
        let matches = 0;
        const len = Math.min(s1Clean.length, s2Clean.length);
        for (let i = 0; i < len; i++) if (s1Clean[i] === s2Clean[i]) matches++;
        if (matches / Math.max(s1Clean.length, s2Clean.length) > 0.85) return 80;
    }

    return 0;
}

interface Edge {
    u: number
    v: number
    score: number
}

export function aggregateServices(rawServices: ServiceData[]): AggregatedService[] {
    const n = rawServices.length;
    if (n === 0) return [];

    const uf = new UnionFind(n, rawServices);
    const edges: Edge[] = [];

    // 1. Pre-process (O(N))
    const meta = new Array(n);
    const invertedIndex = new Map<string, number[]>();
    const exactNameMap = new Map<string, number>();
    const goldenMap = new Map<string, number>();

    for (let i = 0; i < n; i++) {
        const s = rawServices[i];
        const clean = cleanName(s.name);

        // CHECK GOLDEN RULES
        const golden = getGoldenName(clean);
        // Note: Golden rules imply strict categorization. 
        // We will assign a High Priority Edge for golden matches instead of forcing Union immediately,
        // so the Provider Constraint is still checked.
        if (golden) {
            const gClean = golden.toLowerCase();
            meta[i] = { clean: gClean, tokens: new Set([gClean]), isGolden: true };

            // Collect/Group all matching this Golden Rule via High-Score Edge
            if (goldenMap.has(golden)) {
                edges.push({ u: goldenMap.get(golden)!, v: i, score: 1000 }); // Priority 1000
            } else {
                goldenMap.set(golden, i);
            }
            continue;
        }

        const tokens = new Set(clean.split(' ').filter(t => t.length > 2 && !STOP_WORDS.has(t)));
        meta[i] = { clean, tokens };

        // Exact Match
        if (exactNameMap.has(clean)) {
            edges.push({ u: exactNameMap.get(clean)!, v: i, score: 100 });
        } else {
            exactNameMap.set(clean, i);
        }

        // Inverted Index
        for (const token of tokens) {
            if (!invertedIndex.has(token)) invertedIndex.set(token, []);
            invertedIndex.get(token)!.push(i);
        }
    }

    // 2. Pairwise Comparison (O(N*K)) -> Generate Edges
    for (const [token, indices] of invertedIndex.entries()) {
        if (indices.length < 2 || indices.length > 1000) continue;

        for (let i = 0; i < indices.length; i++) {
            const idx1 = indices[i];
            for (let j = i + 1; j < indices.length; j++) {
                const idx2 = indices[j];
                const clean1 = meta[idx1].clean;
                const clean2 = meta[idx2].clean;

                // Avoid redundant checks if exact match already handled
                if (clean1 === clean2) continue;

                // Same Provider Check (Early Optimization)
                if (rawServices[idx1].provider === rawServices[idx2].provider) continue;

                const m1 = meta[idx1];
                const m2 = meta[idx2];
                if (!m1 || !m2) continue;
                if (m1.isGolden || m2.isGolden) continue; // Don't mix golden with non-golden loosely

                const score = calculateScore(m1.clean, m2.clean, m1.tokens, m2.tokens);

                let matched = false;
                if (score >= 80) matched = true;
                else if (rawServices[idx1].code && rawServices[idx2].code &&
                    rawServices[idx1].code.length > 1 &&
                    rawServices[idx1].code.toLowerCase() === rawServices[idx2].code.toLowerCase()) {
                    if (score >= 40) matched = true;
                }

                if (matched) {
                    edges.push({ u: idx1, v: idx2, score });
                }
            }
        }
    }

    // 3. Sort Edges by Score (Descending)
    edges.sort((a, b) => b.score - a.score);

    // 4. Greedy Merge with Constraints
    for (const edge of edges) {
        uf.union(edge.u, edge.v); // union() now returns bool and checks constraint internally
    }

    // 5. Build Groups
    const clusters = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
        const root = uf.find(i);
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root)!.push(i);
    }

    // 6. Construct Aggregated Objects
    const groups: AggregatedService[] = [];

    for (const indices of clusters.values()) {
        const services = indices.map(i => rawServices[i]);

        // Smart Canonical Naming
        let canonical = "";
        let goldenFound = false;

        for (const s of services) {
            const g = getGoldenName(cleanName(s.name));
            if (g) {
                canonical = g;
                goldenFound = true;
                break;
            }
        }

        if (!goldenFound) {
            const nameCounts = new Map<string, number>();
            services.forEach(s => nameCounts.set(s.name, (nameCounts.get(s.name) || 0) + 1));

            canonical = services[0].name;
            let maxCount = -1;
            for (const [name, count] of nameCounts.entries()) {
                if (count > maxCount) {
                    maxCount = count;
                    canonical = name;
                } else if (count === maxCount) {
                    if (name.length < canonical.length && name.length > 2) canonical = name;
                }
            }
        }

        // Use a temporary Set for uniqueness during collection
        const codeSet = new Set<string>();
        const targetProviders = [];

        let bestPrice = Infinity;
        let minPrice = Infinity;
        let maxPrice = -Infinity;

        for (const s of services) {
            const price = Number(s.price || 0);
            if (s.code) codeSet.add(s.code); // Collect code

            targetProviders.push({
                provider: s.provider,
                externalId: s.externalId,
                name: s.name,
                code: s.code,
                price: price,
                originalPrice: s.originalPrice ? Number(s.originalPrice) : undefined,
                count: s.count || 0,
                isActive: s.isActive ?? true
            });

            if (price > 0 && price < bestPrice) bestPrice = price;
            if (price > 0 && price < minPrice) minPrice = price;
            if (price > maxPrice) maxPrice = price;
        }

        groups.push({
            canonicalName: canonical,
            canonicalCode: generateCanonicalCode(canonical),
            codes: Array.from(codeSet), // CONVERT TO ARRAY
            providers: targetProviders,
            totalProviders: new Set(targetProviders.map(p => p.provider)).size,
            bestPrice: bestPrice === Infinity ? 0 : bestPrice,
            priceRange: { min: minPrice === Infinity ? 0 : minPrice, max: maxPrice === -Infinity ? 0 : maxPrice }
        });
    }

    return groups.sort((a, b) => b.totalProviders - a.totalProviders || a.canonicalName.localeCompare(b.canonicalName));
}
