// Root layout - passthrough for locale-based routing
// All actual layout is handled by [locale]/layout.tsx

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
