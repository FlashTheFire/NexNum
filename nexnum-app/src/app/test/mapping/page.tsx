'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'

// Test scenarios
const testScenarios = {
    'Simple Flat Dictionary': {
        description: 'Basic dictionary with cost|price fallback',
        data: {
            "113": { "cost": "18.8", "count": 2068 },
            "124": { "price": "15.5", "qty": 5082 },  // Different field names
            "vk": { "amount": "12.0", "stock": 3252 }
        },
        mapping: {
            type: 'json_dictionary',
            fields: {
                cost: 'cost|price|amount',
                count: 'count|qty|stock',
                service: '$key'
            }
        }
    },

    'Nested 3-Level (Country>Service>Operator)': {
        description: 'Multi-level extraction with extractOperators',
        data: {
            "afghanistan": {
                "whatsapp": {
                    "virtual21": { "cost": 5, "count": 0 },
                    "virtual27": { "cost": 240, "count": 0 }
                },
                "telegram": {
                    "virtual21": { "cost": 4, "count": 10 }
                }
            }
        },
        mapping: {
            type: 'json_dictionary',
            nestingLevels: {
                extractOperators: true
            },
            fields: {
                cost: 'cost|price',
                count: 'count|qty',
                operator: '$key',
                service: '$parentKey'
            }
        }
    },

    'Providers Object (Aggregator)': {
        description: 'Special providers object extraction',
        data: {
            "22": {
                "fb": {
                    "price": 0.09,
                    "count": 822,
                    "providers": {
                        "2266": { "count": 1, "price": [0.0714], "provider_id": 2266 },
                        "3193": { "count": 76258, "price": [0.0667], "provider_id": 3193 }
                    }
                }
            }
        },
        mapping: {
            type: 'json_dictionary',
            nestingLevels: {
                providersKey: 'providers'
            },
            fields: {
                cost: 'price[0]|price|cost',
                count: 'count',
                operator: 'provider_id|$key',
                service: '$parentKey'
            }
        }
    },

    'Mixed Field Names': {
        description: 'Testing all fallback variations',
        data: {
            "1": {
                "bqp": { "cost": 0.55, "count": 435, "physicalCount": 287 },
                "aon": { "amount": 0.6, "stock": 344 },
                "ya": { "price": 0.02, "qty": 408 }
            }
        },
        mapping: {
            type: 'json_dictionary',
            fields: {
                cost: 'cost|price|amount|value',
                count: 'count|qty|stock|physicalCount',
                service: '$key'
            }
        }
    },
    '5sim Nested Structure (Reproduction)': {
        description: 'Testing 3-level nesting (Country>Service>Operator)',
        data: {
            "india": {
                "1688": {
                    "virtual4": {
                        "cost": 16,
                        "count": 0
                    }
                },
                "101z": {
                    "virtual21": {
                        "cost": 7,
                        "count": 7
                    }
                }
            }
        },
        mapping: {
            "type": "json_dictionary",
            "nestingLevels": {
                "extractOperators": true
            },
            "fields": {
                "cost": "cost|price",
                "count": "count|qty",
                "operator": "$key",
                "service": "$parentKey",
                "country": "$grandParentKey"
            }
        }
    },

    'GrizzlySMS Standard (Reproduction)': {
        description: 'Testing 2-level nesting (Country>Service>Data)',
        data: {
            "22": {
                "Prcl": {
                    "price": 0.06,
                    "count": 65
                },
                "aa": {
                    "price": 0.13,
                    "count": 1131
                }
            }
        },
        mapping: {
            "type": "json_dictionary",
            "extractOperators": false, // Standard dict mode
            "fields": {
                "cost": "price|cost",
                "count": "count",
                "service": "$key",
                "country": "$parentKey"
            }
        }
    },

    'HeroSMS Standard (Reproduction)': {
        description: 'Testing 2-level nesting similar to Grizzly',
        data: {
            "22": {
                "aon": {
                    "cost": 0.08,
                    "count": 0
                },
                "xz": {
                    "cost": 0.04,
                    "count": 0
                }
            }
        },
        mapping: {
            "type": "json_dictionary",
            "fields": {
                "cost": "cost|price",
                "count": "count",
                "service": "$key",
                "country": "$parentKey"
            }
        }
    },

    'Deeply Nested with Multiple Operators': {
        description: 'Real aggregator with multiple providers per service',
        data: {
            "1": {
                "1": {
                    "fb": {
                        "2263": {
                            "count": 8468,
                            "price": 0.3336,
                            "provider_id": 2263
                        },
                        "2579": {
                            "count": 131,
                            "price": 1.0667,
                            "provider_id": 2579
                        },
                        "2738": {
                            "count": 8738,
                            "price": 0.9448,
                            "provider_id": 2738
                        },
                        "2739": {
                            "count": 186,
                            "price": 0.2918,
                            "provider_id": 2739
                        },
                        "2750": {
                            "count": 5,
                            "price": 0.5679,
                            "provider_id": 2750
                        },
                        "2840": {
                            "count": 270,
                            "price": 0.2878,
                            "provider_id": 2840
                        },
                        "3001": {
                            "count": 1,
                            "price": 0.0858,
                            "provider_id": 3001
                        },
                        "3042": {
                            "count": 236,
                            "price": 1.0667,
                            "provider_id": 3042
                        },
                        "3177": {
                            "count": 32,
                            "price": 0.6667,
                            "provider_id": 3177
                        },
                        "3182": {
                            "count": 1,
                            "price": 0.0477,
                            "provider_id": 3182
                        }
                    },
                    "vi": {
                        "2263": {
                            "count": 7718,
                            "price": 0.659,
                            "provider_id": 2263
                        },
                        "2579": {
                            "count": 128,
                            "price": 2.2104,
                            "provider_id": 2579
                        },
                        "2738": {
                            "count": 7880,
                            "price": 2.0155,
                            "provider_id": 2738
                        },
                        "2739": {
                            "count": 18,
                            "price": 0.3162,
                            "provider_id": 2739
                        },
                        "2750": {
                            "count": 5,
                            "price": 2.2104,
                            "provider_id": 2750
                        },
                        "2840": {
                            "count": 327,
                            "price": 0.9675,
                            "provider_id": 2840
                        },
                        "3001": {
                            "count": 1,
                            "price": 0.1143,
                            "provider_id": 3001
                        },
                        "3177": {
                            "count": 137,
                            "price": 1.25,
                            "provider_id": 3177
                        }
                    },
                    "dh": {
                        "2263": {
                            "count": 9014,
                            "price": 0.2943,
                            "provider_id": 2263
                        },
                        "2579": {
                            "count": 85,
                            "price": 0.334,
                            "provider_id": 2579
                        },
                        "2738": {
                            "count": 9296,
                            "price": 0.3037,
                            "provider_id": 2738
                        },
                        "2739": {
                            "count": 288,
                            "price": 0.2186,
                            "provider_id": 2739
                        },
                        "2750": {
                            "count": 5,
                            "price": 0.334,
                            "provider_id": 2750
                        },
                        "2840": {
                            "count": 455,
                            "price": 0.1956,
                            "provider_id": 2840
                        },
                        "3001": {
                            "count": 1,
                            "price": 0.1143,
                            "provider_id": 3001
                        },
                        "3177": {
                            "count": 149,
                            "price": 0.2506,
                            "provider_id": 3177
                        }
                    },
                    "ds": {
                        "2263": {
                            "count": 8960,
                            "price": 0.1995,
                            "provider_id": 2263
                        },
                        "2579": {
                            "count": 116,
                            "price": 0.5011,
                            "provider_id": 2579
                        },
                        "2738": {
                            "count": 9242,
                            "price": 0.4675,
                            "provider_id": 2738
                        },
                        "2739": {
                            "count": 246,
                            "price": 0.0211,
                            "provider_id": 2739
                        },
                        "2750": {
                            "count": 5,
                            "price": 0.0502,
                            "provider_id": 2750
                        },
                        "2840": {
                            "count": 442,
                            "price": 0.1567,
                            "provider_id": 2840
                        },
                        "3001": {
                            "count": 1,
                            "price": 0.1143,
                            "provider_id": 3001
                        },
                        "3177": {
                            "count": 148,
                            "price": 0.1701,
                            "provider_id": 3177
                        }
                    },
                    "tg": {
                        "2263": {
                            "count": 7112,
                            "price": 3.1765,
                            "provider_id": 2263
                        },
                        "2579": {
                            "count": 117,
                            "price": 5.1575,
                            "provider_id": 2579
                        },
                        "2738": {
                            "count": 7394,
                            "price": 4.7118,
                            "provider_id": 2738
                        },
                        "2739": {
                            "count": 66,
                            "price": 2.7204,
                            "provider_id": 2739
                        },
                        "2750": {
                            "count": 5,
                            "price": 5.1575,
                            "provider_id": 2750
                        },
                        "3109": {
                            "count": 1,
                            "price": 3.7039,
                            "provider_id": 3109
                        },
                        "3172": {
                            "count": 2598,
                            "price": 4.0236,
                            "provider_id": 3172
                        },
                        "3177": {
                            "count": 74,
                            "price": 2.8236,
                            "provider_id": 3177
                        }
                    },
                    "hw": {
                        "2260": {
                            "count": 154,
                            "price": 0.0835,
                            "provider_id": 2260
                        },
                        "2263": {
                            "count": 8036,
                            "price": 0.2667,
                            "provider_id": 2263
                        },
                        "2579": {
                            "count": 66,
                            "price": 0.5011,
                            "provider_id": 2579
                        },
                        "2738": {
                            "count": 8264,
                            "price": 0.4638,
                            "provider_id": 2738
                        },
                        "2739": {
                            "count": 288,
                            "price": 0.0591,
                            "provider_id": 2739
                        },
                        "2750": {
                            "count": 5,
                            "price": 0.5011,
                            "provider_id": 2750
                        },
                        "2920": {
                            "count": 226,
                            "price": 0.0835,
                            "provider_id": 2920
                        },
                        "3001": {
                            "count": 1,
                            "price": 0.1906,
                            "provider_id": 3001
                        },
                        "3042": {
                            "count": 226,
                            "price": 0.0835,
                            "provider_id": 3042
                        }
                    }
                }
            }
        },
        mapping: {
            type: 'json_dictionary',
            fields: {
                cost: 'price',
                count: 'count',
                country: '$grandParentKey',
                service: '$parentKey',
                operator: '$key'
            },
            rootPath: ''
        }
    }
}

export default function MappingTestPage() {
    const [selectedTest, setSelectedTest] = useState<string>(Object.keys(testScenarios)[0])
    const [testResult, setTestResult] = useState<any>(null)
    const [isRunning, setIsRunning] = useState(false)

    const runTest = async () => {
        setIsRunning(true)
        const scenario = testScenarios[selectedTest as keyof typeof testScenarios]

        try {
            // Call REAL parsing API using DynamicProvider
            const response = await fetch('/api/test/mapping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: scenario.data,
                    mapping: scenario.mapping,
                    testName: selectedTest
                })
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.error || 'Parsing failed')
            }

            setTestResult(result)
        } catch (error: any) {
            setTestResult({
                success: false,
                error: error.message,
                note: 'Failed to parse - check console for details'
            })
            console.error('[Test Error]', error)
        } finally {
            setIsRunning(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">📊 Mapping System Test Lab</h1>
                    <p className="text-slate-300">Test all enhanced mapping features interactively</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Test Selection */}
                    <Card className="p-6 bg-slate-800/50 border-slate-700">
                        <h2 className="text-xl font-semibold text-white mb-4">🧪 Test Scenarios</h2>
                        <div className="space-y-2">
                            {Object.keys(testScenarios).map((name) => (
                                <button
                                    key={name}
                                    onClick={() => setSelectedTest(name)}
                                    className={`w-full text-left px-4 py-3 rounded-lg transition-all ${selectedTest === name
                                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/50'
                                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                                        }`}
                                >
                                    <div className="font-medium">{name}</div>
                                    <div className="text-xs opacity-75 mt-1">
                                        {testScenarios[name as keyof typeof testScenarios].description}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </Card>

                    {/* Test Configuration */}
                    <Card className="lg:col-span-2 p-6 bg-slate-800/50 border-slate-700">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold text-white">⚙️ Configuration</h2>
                            <button
                                onClick={runTest}
                                disabled={isRunning}
                                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white rounded-lg font-medium transition-all shadow-lg"
                            >
                                {isRunning ? '🔄 Running...' : '▶️ Run Test'}
                            </button>
                        </div>

                        {selectedTest && (
                            <>
                                {/* Input Data */}
                                <div className="mb-4">
                                    <h3 className="text-sm font-semibold text-slate-300 mb-2">📥 Input Data:</h3>
                                    <pre className="bg-slate-900 p-4 rounded-lg overflow-x-auto text-sm text-green-400 border border-slate-700">
                                        {JSON.stringify(testScenarios[selectedTest as keyof typeof testScenarios].data, null, 2)}
                                    </pre>
                                </div>

                                {/* Mapping Config */}
                                <div className="mb-4">
                                    <h3 className="text-sm font-semibold text-slate-300 mb-2">🗺️ Mapping:</h3>
                                    <pre className="bg-slate-900 p-4 rounded-lg overflow-x-auto text-sm text-blue-400 border border-slate-700">
                                        {JSON.stringify(testScenarios[selectedTest as keyof typeof testScenarios].mapping, null, 2)}
                                    </pre>
                                </div>

                                {/* Test Result */}
                                {testResult && (
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-300 mb-2">✅ Result:</h3>
                                        <pre className="bg-slate-900 p-4 rounded-lg overflow-x-auto text-sm text-yellow-400 border border-slate-700">
                                            {JSON.stringify(testResult, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </>
                        )}
                    </Card>
                </div>

                {/* Feature Guide */}
                <Card className="mt-6 p-6 bg-slate-800/50 border-slate-700">
                    <h2 className="text-xl font-semibold text-white mb-4">📖 Feature Guide</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="bg-slate-900 p-4 rounded-lg border border-blue-500/30">
                            <div className="text-blue-400 font-semibold mb-2">🔗 Fallback Chains</div>
                            <code className="text-slate-300">"cost|price|amount"</code>
                            <p className="text-slate-400 mt-2 text-xs">Tries each field name in order until one is found</p>
                        </div>

                        <div className="bg-slate-900 p-4 rounded-lg border border-purple-500/30">
                            <div className="text-purple-400 font-semibold mb-2">📊 Multi-Level</div>
                            <code className="text-slate-300">extractOperators: true</code>
                            <p className="text-slate-400 mt-2 text-xs">Extracts nested country &gt; service &gt; operator</p>
                        </div>

                        <div className="bg-slate-900 p-4 rounded-lg border border-green-500/30">
                            <div className="text-green-400 font-semibold mb-2">🏢 Providers Object</div>
                            <code className="text-slate-300">providersKey: "providers"</code>
                            <p className="text-slate-400 mt-2 text-xs">Extracts from special nested provider structures</p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    )
}
