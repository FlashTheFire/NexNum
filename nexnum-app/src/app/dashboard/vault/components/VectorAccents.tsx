
import { cn } from "@/lib/utils";

interface VectorAccentsProps {
    variant?: "corner" | "edge" | "circle" | "crosshair" | "dots";
    className?: string;
    dark?: boolean;
}

export const VectorAccents = ({ variant = "corner", className, dark = false }: VectorAccentsProps) => {
    const color = dark ? "stroke-black/20" : "stroke-white/20";
    const fillColor = dark ? "fill-black/20" : "fill-white/20";

    switch (variant) {
        case "corner":
            return (
                <svg className={cn("absolute w-6 h-6 pointer-events-none", className)} viewBox="0 0 24 24" fill="none">
                    <path d="M1 1V9M1 1H9" className={cn("stroke-width-1.5", color)} />
                </svg>
            );
        case "edge":
            return (
                <svg className={cn("absolute w-full h-[6px] pointer-events-none", className)} preserveAspectRatio="none" viewBox="0 0 100 6" fill="none">
                    <path d="M0 3H100" strokeDasharray="4 4" className={cn("stroke-width-1", color)} />
                    <rect x="45" y="1" width="10" height="4" className={cn(fillColor)} />
                </svg>
            );
        case "circle":
            return (
                <svg className={cn("absolute w-12 h-12 pointer-events-none", className)} viewBox="0 0 48 48" fill="none">
                    <circle cx="24" cy="24" r="23" strokeDasharray="4 4" className={cn("stroke-width-0.5 opacity-30", color)} />
                    <circle cx="24" cy="24" r="12" className={cn("stroke-width-1 opacity-50", color)} />
                </svg>
            );
        case "crosshair":
            return (
                <svg className={cn("absolute w-4 h-4 pointer-events-none", className)} viewBox="0 0 16 16" fill="none">
                    <path d="M8 0V16M0 8H16" className={cn("stroke-width-1", color)} />
                </svg>
            );
        case "dots":
            return (
                <div className={cn("absolute grid grid-cols-3 gap-1 pointer-events-none", className)}>
                    {[...Array(9)].map((_, i) => (
                        <div key={i} className={cn("w-0.5 h-0.5 rounded-full", dark ? "bg-black/20" : "bg-white/20")} />
                    ))}
                </div>
            );
        default:
            return null;
    }
};
