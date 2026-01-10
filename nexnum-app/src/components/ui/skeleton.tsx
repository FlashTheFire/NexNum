import { cn } from "@/lib/utils/utils"

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn("animate-pulse rounded-md bg-white/5", className)}
            {...props}
        />
    )
}

export function PremiumSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn("relative overflow-hidden bg-white/5 rounded-xl", className)}>
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>
    )
}
