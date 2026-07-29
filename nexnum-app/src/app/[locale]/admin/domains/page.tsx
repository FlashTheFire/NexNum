'use client'

import { useState, useEffect } from 'react'
import { Globe, Plus, ShieldCheck, Server, Copy, Check, RefreshCw, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { api } from '@/lib/api/api-client'

export default function AdminDomainsPage() {
    const [domains, setDomains] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [newDomain, setNewDomain] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [copiedIp, setCopiedIp] = useState(false)
    const ec2Ip = '13.62.95.162'

    const fetchDomains = async () => {
        setIsLoading(true)
        try {
            const res: any = await api.request<any>('/api/admin/domains', 'GET')
            if (res?.success) {
                setDomains(res.domains || res.data?.domains || [])
            }
        } catch {
            toast.error('Failed to load domain configuration')
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchDomains()
    }, [])

    const handleAddDomain = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newDomain.trim()) return

        setIsSubmitting(true)
        try {
            const res = await api.request<any>('/api/admin/domains', 'POST', { domain: newDomain.trim() })
            if (res.success) {
                toast.success(`Domain ${newDomain} registered!`)
                setNewDomain('')
                fetchDomains()
            } else {
                toast.error(res.error || 'Failed to add domain')
            }
        } catch {
            toast.error('Network error while adding domain')
        } finally {
            setIsSubmitting(false)
        }
    }

    const copyIpToClipboard = () => {
        navigator.clipboard.writeText(ec2Ip)
        setCopiedIp(true)
        toast.success('EC2 IP copied to clipboard!')
        setTimeout(() => setCopiedIp(false), 2000)
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                    <div className="flex items-center gap-2">
                        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">Super CEO Hub</Badge>
                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Single Instance EC2 Multi-Tenant</Badge>
                    </div>
                    <h1 className="text-2xl font-bold text-white mt-2 flex items-center gap-2">
                        <Globe className="h-7 w-7 text-emerald-400" />
                        Multi-Domain Routing Manager
                    </h1>
                    <p className="text-sm text-white/50">
                        Connect unlimited custom domains to your single EC2 instance. All domains route seamlessly to NexNum with automated SSL and tenant context.
                    </p>
                </div>

                <Button onClick={fetchDomains} variant="outline" size="sm" className="bg-white/5 border-white/10 text-white gap-2">
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Quick DNS Setup Banner */}
            <Card className="bg-emerald-950/20 border-emerald-500/30">
                <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Server className="h-6 w-6 text-emerald-400 shrink-0" />
                        <div>
                            <p className="text-sm font-semibold text-white">Target EC2 Elastic IP: <span className="font-mono text-emerald-300">{ec2Ip}</span></p>
                            <p className="text-xs text-white/50">In Hostinger DNS Zone, set A Record (@ and www) pointing to this IP.</p>
                        </div>
                    </div>
                    <Button onClick={copyIpToClipboard} size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold gap-2">
                        {copiedIp ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copiedIp ? 'Copied' : 'Copy EC2 IP'}
                    </Button>
                </CardContent>
            </Card>

            {/* Add New Domain Form */}
            <Card className="bg-card/40 border-white/10">
                <CardHeader>
                    <CardTitle className="text-base text-white">Add Custom Domain</CardTitle>
                    <CardDescription className="text-xs text-white/50">Connect a new Hostinger domain to route to this platform</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleAddDomain} className="flex gap-3 max-w-xl">
                        <Input
                            placeholder="e.g. nexnum.com or smsfast.in"
                            value={newDomain}
                            onChange={(e) => setNewDomain(e.target.value)}
                            className="bg-black/60 border-white/10 text-white text-sm"
                        />
                        <Button type="submit" disabled={isSubmitting} className="bg-purple-600 hover:bg-purple-700 text-white gap-2">
                            <Plus className="h-4 w-4" />
                            {isSubmitting ? 'Adding...' : 'Connect Domain'}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* Connected Domains Table */}
            <Card className="bg-card/40 border-white/10 overflow-hidden">
                <CardHeader>
                    <CardTitle className="text-base text-white">Connected Domains ({domains.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="divide-y divide-white/5">
                        {domains.map((d) => (
                            <div key={d.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 font-mono font-bold text-sm">
                                        🌐
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-sm text-white">{d.domain}</p>
                                            {d.isPrimary && <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px]">PRIMARY</Badge>}
                                        </div>
                                        <p className="text-xs text-white/40 font-mono">Added: {new Date(d.createdAt).toLocaleDateString()}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs gap-1">
                                        <ShieldCheck className="h-3 w-3" />
                                        {d.sslStatus || 'SSL VALID'}
                                    </Badge>
                                    <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs">
                                        {d.status || 'ACTIVE'}
                                    </Badge>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
