import { ReactNode } from 'react';

// Since we have specific layouts for locales, this root layout 
// just passes through the children which contain their own html/body tags.
export default function RootLayout({
    children,
}: {
    children: ReactNode;
}) {
    return children;
}
