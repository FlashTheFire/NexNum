"use client"

import { useState } from "react"
import { Terminal, Copy, Check, ExternalLink, Code2, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"

type Lang = "curl" | "node" | "python" | "go"

export function DeveloperDocs() {
    const [activeLang, setActiveLang] = useState<Lang>("curl")
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

    const snippets = [
        {
            title: "1. Purchase / Rent Virtual Number",
            endpoint: "POST /api/v1/numbers/purchase",
            description: "Rent an isolated physical SIM virtual number for SMS verification",
            code: {
                curl: `curl -X POST "https://nexnum.app/api/v1/numbers/purchase" \\
  -H "Authorization: Bearer nex_live_9a8f37b2d1e04c5a9b8c7d6e5f4a3b2c1" \\
  -H "Content-Type: application/json" \\
  -d '{"country": "IN", "service": "telegram"}'`,
                node: `import { NexNumClient } from '@nexnum/sdk';

const client = new NexNumClient({ apiKey: 'nex_live_9a8f37b2d1e04c5a9b8c7d6e5f4a3b2c1' });

const number = await client.numbers.purchase({
  country: 'IN',
  service: 'telegram'
});
console.log('Rented Number:', number.phoneNumber, 'ID:', number.id);`,
                python: `import requests

headers = {
    "Authorization": "Bearer nex_live_9a8f37b2d1e04c5a9b8c7d6e5f4a3b2c1",
    "Content-Type": "application/json"
}
payload = {"country": "IN", "service": "telegram"}

response = requests.post("https://nexnum.app/api/v1/numbers/purchase", json=payload, headers=headers)
print(response.json())`,
                go: `package main

import (
	"fmt"
	"net/http"
	"strings"
)

func main() {
	url := "https://nexnum.app/api/v1/numbers/purchase"
	payload := strings.NewReader(\`{"country": "IN", "service": "telegram"}\`)

	req, _ := http.NewRequest("POST", url, payload)
	req.Header.Add("Authorization", "Bearer nex_live_9a8f37b2d1e04c5a9b8c7d6e5f4a3b2c1")
	req.Header.Add("Content-Type", "application/json")

	res, _ := http.DefaultClient.Do(req)
	fmt.Println(res.Status)
}`
            }
        },
        {
            title: "2. Fetch Incoming SMS OTP Messages",
            endpoint: "GET /api/v1/sms/{numberId}",
            description: "Poll or fetch real-time incoming SMS messages and OTP codes for a rented number",
            code: {
                curl: `curl -X GET "https://nexnum.app/api/v1/sms/num_9824057524" \\
  -H "Authorization: Bearer nex_live_9a8f37b2d1e04c5a9b8c7d6e5f4a3b2c1"`,
                node: `const sms = await client.sms.get('num_9824057524');
console.log('Latest OTP:', sms.code, 'Full Text:', sms.message);`,
                python: `response = requests.get("https://nexnum.app/api/v1/sms/num_9824057524", headers=headers)
print(response.json())`,
                go: `req, _ := http.NewRequest("GET", "https://nexnum.app/api/v1/sms/num_9824057524", nil)
req.Header.Add("Authorization", "Bearer nex_live_9a8f37b2d1e04c5a9b8c7d6e5f4a3b2c1")
res, _ := http.DefaultClient.Do(req)`
            }
        },
        {
            title: "3. Check Wallet Balance",
            endpoint: "GET /api/v1/balance",
            description: "Check your current account balance across multi-currency ledgers",
            code: {
                curl: `curl -X GET "https://nexnum.app/api/v1/balance" \\
  -H "Authorization: Bearer nex_live_9a8f37b2d1e04c5a9b8c7d6e5f4a3b2c1"`,
                node: `const balance = await client.balance.get();
console.log('Balance INR:', balance.INR, 'USD:', balance.USD);`,
                python: `response = requests.get("https://nexnum.app/api/v1/balance", headers=headers)
print(response.json())`,
                go: `req, _ := http.NewRequest("GET", "https://nexnum.app/api/v1/balance", nil)
req.Header.Add("Authorization", "Bearer nex_live_9a8f37b2d1e04c5a9b8c7d6e5f4a3b2c1")
res, _ := http.DefaultClient.Do(req)`
            }
        }
    ]

    const copyCode = (text: string, index: number) => {
        navigator.clipboard.writeText(text)
        setCopiedIndex(index)
        toast.success("Code snippet copied to clipboard")
        setTimeout(() => setCopiedIndex(null), 2000)
    }

    return (
        <div className="space-y-6">
            {/* Docs Banner */}
            <Card className="border-white/10 bg-[#12131a]/80 backdrop-blur-md shadow-lg">
                <CardHeader className="pb-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-indigo-400" />
                            <CardTitle className="text-sm font-semibold text-white">Developer API Quick Reference</CardTitle>
                        </div>
                        <CardDescription className="text-xs text-gray-400 mt-0.5">
                            Integrate SMS verification programmatically using our high-throughput REST API endpoints.
                        </CardDescription>
                    </div>

                    {/* Language Switcher Tabs */}
                    <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                        <button
                            onClick={() => setActiveLang("curl")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${activeLang === "curl" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}
                        >cURL</button>
                        <button
                            onClick={() => setActiveLang("node")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${activeLang === "node" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}
                        >Node.js</button>
                        <button
                            onClick={() => setActiveLang("python")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${activeLang === "python" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}
                        >Python</button>
                        <button
                            onClick={() => setActiveLang("go")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${activeLang === "go" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}
                        >Go</button>
                    </div>
                </CardHeader>
            </Card>

            {/* Code Snippets List */}
            <div className="space-y-4">
                {snippets.map((snip, idx) => (
                    <Card key={snip.endpoint} className="border-white/10 bg-[#12131a]/80 backdrop-blur-md shadow-lg overflow-hidden">
                        <div className="p-4 border-b border-white/5 flex flex-wrap items-center justify-between gap-2 bg-black/30">
                            <div>
                                <h4 className="text-xs font-semibold text-white">{snip.title}</h4>
                                <p className="text-[11px] text-gray-400 mt-0.5">{snip.description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px] font-mono border-indigo-500/40 text-indigo-400 bg-indigo-500/10">
                                    {snip.endpoint}
                                </Badge>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyCode(snip.code[activeLang], idx)}
                                    className="h-7 px-2 text-xs text-gray-300 hover:text-white border border-white/10"
                                >
                                    {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </Button>
                            </div>
                        </div>
                        <CardContent className="p-0 bg-[#0c0d12]">
                            <pre className="p-4 text-xs font-mono text-indigo-200 overflow-x-auto leading-relaxed">
                                <code>{snip.code[activeLang]}</code>
                            </pre>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
