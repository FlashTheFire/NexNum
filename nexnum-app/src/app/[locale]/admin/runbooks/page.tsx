"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
    BookOpen, AlertTriangle, Database, Server,
    Wallet, Users, RefreshCw, Clock, ExternalLink,
    ChevronDown, ChevronRight, Search, Copy, Check
} from "lucide-react"
import Link from "next/link"

// ============================================================================
// RUNBOOK DATA
// ============================================================================

interface RunbookStep {
    title: string
    command?: string
    description?: string
    warning?: string
}

interface Runbook {
    id: string
    title: string
    severity: 'critical' | 'warning' | 'info'
    category: string
    description: string
    symptoms: string[]
    steps: RunbookStep[]
    escalation?: string
    relatedAlerts?: string[]
}

const runbooks: Runbook[] = [
    {
        id: 'high-error-rate',
        title: 'High Error Rate',
        severity: 'critical',
        category: 'Availability',
        description: 'Error rate exceeds 5% for 5+ minutes',
        symptoms: [
            'Prometheus alert: HighErrorRate',
            'Users reporting failures',
            'Error rate dashboard showing spike'
        ],
        steps: [
            {
                title: 'Check recent deployments',
                command: 'git log --oneline -10',
                description: 'Look for recent changes that could cause errors'
            },
            {
                title: 'Check application logs',
                command: 'docker logs nexnum-app --tail 100 | grep ERROR',
                description: 'Look for error patterns and stack traces'
            },
            {
                title: 'Check database connectivity',
                command: 'curl http://localhost:3000/api/health/detailed',
                description: 'Verify database and Redis are healthy'
            },
            {
                title: 'Check provider status',
                description: 'Visit admin panel → Providers to check for failed syncs'
            },
            {
                title: 'Rollback if needed',
                command: 'git revert HEAD && npm run build && pm2 restart all',
                warning: 'Only do this if a recent deployment caused the issue'
            }
        ],
        escalation: 'If not resolved in 15 minutes, page on-call engineer',
        relatedAlerts: ['HighErrorRate', 'ServiceDown']
    },
    {
        id: 'provider-latency',
        title: 'High Provider Latency',
        severity: 'warning',
        category: 'Performance',
        description: 'Provider API P99 latency exceeds 2 seconds',
        symptoms: [
            'Prometheus alert: HighProviderLatency',
            'Slow number purchases',
            'Timeouts in logs'
        ],
        steps: [
            {
                title: 'Identify affected provider',
                command: 'curl http://localhost:3000/api/metrics | grep provider_latency',
                description: 'Check which provider has high latency'
            },
            {
                title: 'Check provider status page',
                description: 'Visit the provider\'s status page for outage info'
            },
            {
                title: 'Check network connectivity',
                command: 'ping api.smsactivate.org',
                description: 'Verify network path to provider'
            },
            {
                title: 'Enable circuit breaker',
                description: 'If provider is consistently slow, pause in admin panel'
            },
            {
                title: 'Monitor recovery',
                description: 'Watch latency metrics for improvement'
            }
        ],
        relatedAlerts: ['HighProviderLatency', 'ProviderDown']
    },
    {
        id: 'db-connection-exhaustion',
        title: 'Database Connection Exhaustion',
        severity: 'critical',
        category: 'Infrastructure',
        description: 'Database connection pool above 90% utilization',
        symptoms: [
            'Prometheus alert: DBConnectionExhaustion',
            'Slow or timed out queries',
            '"connection pool exhausted" in logs'
        ],
        steps: [
            {
                title: 'Check active connections',
                command: 'SELECT state, count(*) FROM pg_stat_activity GROUP BY state;',
                description: 'Run in database to see connection states'
            },
            {
                title: 'Identify long-running queries',
                command: 'SELECT pid, now() - query_start AS duration, query FROM pg_stat_activity WHERE state = \'active\' ORDER BY duration DESC LIMIT 10;',
                description: 'Find queries holding connections'
            },
            {
                title: 'Kill long-running queries',
                command: 'SELECT pg_terminate_backend(pid);',
                warning: 'Use with caution - may cause transaction rollbacks'
            },
            {
                title: 'Restart application',
                command: 'pm2 restart all',
                description: 'Clears leaked connections'
            },
            {
                title: 'Scale connection pool',
                description: 'If legitimate load, increase DATABASE_POOL_SIZE'
            }
        ],
        escalation: 'If pool stays above 90% after restart, escalate to DBA',
        relatedAlerts: ['DBConnectionExhaustion']
    },
    {
        id: 'worker-queue-backlog',
        title: 'Worker Queue Backlog',
        severity: 'warning',
        category: 'Workers',
        description: 'Background job queue has more than 1000 pending jobs',
        symptoms: [
            'Prometheus alert: WorkerQueueBacklog',
            'Delayed SMS polling',
            'Numbers stuck in PENDING state'
        ],
        steps: [
            {
                title: 'Check queue depth',
                command: 'SELECT state, count(*) FROM pgboss.job GROUP BY state;',
                description: 'See distribution of job states'
            },
            {
                title: 'Identify stuck jobs',
                command: 'SELECT name, count(*) FROM pgboss.job WHERE state = \'active\' AND startedon < now() - interval \'10 minutes\' GROUP BY name;',
                description: 'Find jobs that have been running too long'
            },
            {
                title: 'Check worker health',
                command: 'pm2 status',
                description: 'Verify worker processes are running'
            },
            {
                title: 'Scale workers',
                command: 'pm2 scale worker +2',
                description: 'Add more worker processes'
            },
            {
                title: 'Monitor queue drain',
                description: 'Watch queue depth decrease over time'
            }
        ],
        relatedAlerts: ['WorkerQueueBacklog', 'HighFailedJobCount']
    },
    {
        id: 'wallet-failures',
        title: 'Wallet Transaction Failures',
        severity: 'critical',
        category: 'Payments',
        description: 'High rate of wallet transaction failures',
        symptoms: [
            'Prometheus alert: WalletTransactionFailures',
            'Users unable to purchase numbers',
            'Balance deductions failing'
        ],
        steps: [
            {
                title: 'Check wallet service logs',
                command: 'docker logs nexnum-app --tail 100 | grep -i wallet',
                description: 'Look for wallet-related errors'
            },
            {
                title: 'Check database locks',
                command: 'SELECT * FROM pg_locks WHERE NOT granted;',
                description: 'Look for blocking locks on Wallet table'
            },
            {
                title: 'Verify transaction isolation',
                description: 'Check if concurrent transactions are causing conflicts'
            },
            {
                title: 'Check for negative balances',
                command: 'SELECT count(*) FROM "Wallet" WHERE balance < 0;',
                description: 'Should be 0 - indicates race condition if not'
            },
            {
                title: 'Emergency: Pause purchases',
                description: 'If data integrity at risk, pause all providers'
            }
        ],
        escalation: 'Immediately escalate to payments team lead',
        relatedAlerts: ['WalletTransactionFailures']
    },
    {
        id: 'service-down',
        title: 'Service Down',
        severity: 'critical',
        category: 'Availability',
        description: 'NexNum API is not responding',
        symptoms: [
            'Prometheus alert: ServiceDown',
            'Health check returning 5xx',
            'Load balancer marking unhealthy'
        ],
        steps: [
            {
                title: 'Check container status',
                command: 'docker ps -a | grep nexnum',
                description: 'Verify container is running'
            },
            {
                title: 'Check container logs',
                command: 'docker logs nexnum-app --tail 200',
                description: 'Look for crash reason'
            },
            {
                title: 'Check system resources',
                command: 'docker stats',
                description: 'Verify CPU/memory not exhausted'
            },
            {
                title: 'Restart container',
                command: 'docker restart nexnum-app',
                description: 'Quick recovery attempt'
            },
            {
                title: 'Check dependencies',
                command: 'docker-compose ps',
                description: 'Ensure Redis, MeiliSearch, DB are healthy'
            }
        ],
        escalation: 'Page on-call immediately if not recovered in 5 minutes',
        relatedAlerts: ['ServiceDown']
    }
]

// ============================================================================
// COMPONENTS
// ============================================================================

const severityConfig = {
    critical: {
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        text: 'text-red-400',
        badge: 'bg-red-500/20 text-red-400'
    },
    warning: {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        text: 'text-amber-400',
        badge: 'bg-amber-500/20 text-amber-400'
    },
    info: {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        text: 'text-blue-400',
        badge: 'bg-blue-500/20 text-blue-400'
    }
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false)

    const handleCopy = () => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title="Copy command"
        >
            {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
                <Copy className="w-3.5 h-3.5 text-white/40" />
            )}
        </button>
    )
}

function RunbookCard({ runbook }: { runbook: Runbook }) {
    const [isExpanded, setIsExpanded] = useState(false)
    const config = severityConfig[runbook.severity]

    return (
        <motion.div
            layout
            className={`
                rounded-xl border ${config.border}
                bg-[#0F1115] overflow-hidden
            `}
        >
            {/* Header - Always visible */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full p-4 flex items-start gap-4 hover:bg-white/5 transition-colors text-left"
            >
                <div className={`p-2 rounded-lg ${config.bg} shrink-0 mt-0.5`}>
                    <BookOpen className={`w-4 h-4 ${config.text}`} />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white">{runbook.title}</h3>
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${config.badge}`}>
                            {runbook.severity}
                        </span>
                        <span className="px-2 py-0.5 text-[10px] text-white/40 bg-white/5 rounded">
                            {runbook.category}
                        </span>
                    </div>
                    <p className="text-sm text-white/50">{runbook.description}</p>
                </div>

                {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-white/40 shrink-0" />
                ) : (
                    <ChevronRight className="w-5 h-5 text-white/40 shrink-0" />
                )}
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="px-4 pb-4 border-t border-white/5"
                >
                    {/* Symptoms */}
                    <div className="mt-4 mb-6">
                        <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
                            Symptoms
                        </h4>
                        <ul className="space-y-1">
                            {runbook.symptoms.map((symptom, i) => (
                                <li key={i} className="text-sm text-white/70 flex items-start gap-2">
                                    <span className="text-amber-400 mt-1">•</span>
                                    {symptom}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Steps */}
                    <div className="mb-6">
                        <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">
                            Resolution Steps
                        </h4>
                        <div className="space-y-3">
                            {runbook.steps.map((step, i) => (
                                <div key={i} className="rounded-lg bg-white/5 p-3">
                                    <div className="flex items-start gap-3">
                                        <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
                                            {i + 1}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-white text-sm mb-1">
                                                {step.title}
                                            </div>
                                            {step.description && (
                                                <p className="text-xs text-white/50 mb-2">
                                                    {step.description}
                                                </p>
                                            )}
                                            {step.command && (
                                                <div className="flex items-center gap-2 bg-black/30 rounded px-3 py-2 font-mono text-xs text-emerald-400">
                                                    <code className="flex-1 overflow-x-auto">
                                                        {step.command}
                                                    </code>
                                                    <CopyButton text={step.command} />
                                                </div>
                                            )}
                                            {step.warning && (
                                                <div className="mt-2 flex items-start gap-2 text-xs text-amber-400">
                                                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                                    {step.warning}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Escalation */}
                    {runbook.escalation && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                                <div>
                                    <div className="text-xs font-semibold text-red-400 uppercase mb-1">
                                        Escalation
                                    </div>
                                    <p className="text-sm text-white/70">{runbook.escalation}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Related Alerts */}
                    {runbook.relatedAlerts && runbook.relatedAlerts.length > 0 && (
                        <div className="mt-4 flex items-center gap-2 text-xs text-white/40">
                            <span>Related alerts:</span>
                            {runbook.relatedAlerts.map((alert, i) => (
                                <span key={i} className="px-2 py-0.5 bg-white/5 rounded font-mono">
                                    {alert}
                                </span>
                            ))}
                        </div>
                    )}
                </motion.div>
            )}
        </motion.div>
    )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function RunbooksPage() {
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

    const categories = Array.from(new Set(runbooks.map(r => r.category)))

    const filteredRunbooks = runbooks.filter(runbook => {
        const matchesSearch = !searchQuery ||
            runbook.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            runbook.description.toLowerCase().includes(searchQuery.toLowerCase())

        const matchesCategory = !selectedCategory || runbook.category === selectedCategory

        return matchesSearch && matchesCategory
    })

    return (
        <main className="min-h-screen p-4 md:p-6 lg:p-8">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-2 text-white/40 text-sm mb-2">
                    <Link href="/en/admin" className="hover:text-white transition-colors">
                        Command Center
                    </Link>
                    <ChevronRight className="w-4 h-4" />
                    <span className="text-white">Runbooks</span>
                </div>
                <h1 className="text-2xl font-bold text-white">Operational Runbooks</h1>
                <p className="text-white/50 mt-1">
                    Step-by-step procedures for handling common incidents
                </p>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                        type="text"
                        placeholder="Search runbooks..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-white/20"
                    />
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setSelectedCategory(null)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!selectedCategory
                                ? 'bg-white/10 text-white'
                                : 'text-white/40 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        All
                    </button>
                    {categories.map(category => (
                        <button
                            key={category}
                            onClick={() => setSelectedCategory(category)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedCategory === category
                                    ? 'bg-white/10 text-white'
                                    : 'text-white/40 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            {category}
                        </button>
                    ))}
                </div>
            </div>

            {/* Runbooks List */}
            <div className="space-y-4">
                {filteredRunbooks.map(runbook => (
                    <RunbookCard key={runbook.id} runbook={runbook} />
                ))}

                {filteredRunbooks.length === 0 && (
                    <div className="text-center py-12 text-white/40">
                        <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No runbooks found matching your search</p>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-white/5 text-center text-xs text-white/30">
                <p>Last updated: January 2026</p>
                <p className="mt-1">
                    <Link href="/en/admin" className="hover:text-white transition-colors">
                        ← Back to Command Center
                    </Link>
                </p>
            </div>
        </main>
    )
}
