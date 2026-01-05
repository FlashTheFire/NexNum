
import { cn } from "@/lib/utils";

interface ServiceIconProps {
    id?: string;
    name?: string;
    iconUrl?: string | null;
    className?: string;
}

export function ServiceIcon({ id, name, iconUrl, className }: ServiceIconProps) {
    const seed = name || id || 'unknown';
    // Use dicebear fallback if no specific iconUrl provided
    // This matches the logic from ServiceSelector for consistent visuals
    const url = iconUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}&backgroundColor=6366f1,8b5cf6,ec4899,f43f5e,f97316,eab308,22c55e,14b8a6`;

    return (
        <img
            src={url}
            alt={seed}
            className={cn("object-contain filter brightness-110", className)}
            loading="lazy"
        />
    );
}
