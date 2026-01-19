"use client"

import { useTranslations } from "next-intl"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card } from "@/components/ui/card"

const data = [
    { name: 'Mon', sms: 4 },
    { name: 'Tue', sms: 12 },
    { name: 'Wed', sms: 8 },
    { name: 'Thu', sms: 15 },
    { name: 'Fri', sms: 24 },
    { name: 'Sat', sms: 18 },
    { name: 'Sun', sms: 30 },
]

export function DashboardChart() {
    const t = useTranslations('dashboard')

    return (
        <div className="w-full h-full p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-400">{t('analytics.weeklyUsage')}</h3>
                <span className="text-xs text-[hsl(var(--neon-lime))] font-mono">+12%</span>
            </div>

            <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={data}
                        margin={{ top: 5, right: 0, left: -20, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="colorSms" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(var(--neon-lime))" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="hsl(var(--neon-lime))" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis
                            dataKey="name"
                            stroke="#666"
                            tick={{ fill: '#666', fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            stroke="#666"
                            tick={{ fill: '#666', fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#0c0e12', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}
                            itemStyle={{ color: 'hsl(var(--neon-lime))' }}
                            cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="sms"
                            stroke="hsl(var(--neon-lime))"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorSms)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
