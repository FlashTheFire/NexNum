import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, ExternalLink, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GrafanaEmbedProps {
    dashboardUrl?: string;
    refreshInterval?: string;
    height?: string;
    className?: string;
}

export const GrafanaEmbed: React.FC<GrafanaEmbedProps> = ({
    // Default to localhost:3001 if not provided
    dashboardUrl = "http://localhost:3001/d/nexnum-command-center/nexnum-command-center?orgId=1&refresh=5s&kiosk",
    height = "800px",
    className = ""
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const [key, setKey] = useState(0); // For forcing refresh

    const handleRefresh = () => {
        setIsLoading(true);
        setKey(prev => prev + 1);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className={`w-full relative group ${className}`}
        >
            {/* Header / Controls */}
            <div className="flex items-center justify-between mb-4 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/50 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                        <Activity className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                            Live Metrics Dashboard
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                GRAFANA LINKED
                            </span>
                        </h3>
                        <p className="text-zinc-500 text-xs">Real-time system performance and infrastructure telemetry</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        className="h-8 bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-700/50 text-zinc-400 hover:text-zinc-200"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="h-8 bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-700/50 text-zinc-400 hover:text-zinc-200"
                    >
                        <a href={dashboardUrl.replace('&kiosk', '').replace('?kiosk', '')} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3.5 h-3.5 mr-2" />
                            Open Full
                        </a>
                    </Button>
                </div>
            </div>

            {/* Iframe Container */}
            <div className="relative w-full rounded-2xl overflow-hidden border border-zinc-800/50 shadow-2xl bg-zinc-950/50">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 z-10">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 rounded-full border-2 border-orange-500/20 border-t-orange-500 animate-spin" />
                            <p className="text-zinc-500 text-sm animate-pulse">Connecting to Grafana...</p>
                        </div>
                    </div>
                )}

                <iframe
                    key={key}
                    src={dashboardUrl}
                    style={{ height: height }}
                    width="100%"
                    height={height}
                    frameBorder="0"
                    onLoad={() => setIsLoading(false)}
                    className="w-full opacity-90 hover:opacity-100 transition-opacity duration-300"
                    title="Grafana Dashboard"
                />

                {/* Overlay for inactive states if needed */}
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-zinc-950/20 to-transparent" />
            </div>
        </motion.div>
    );
};
