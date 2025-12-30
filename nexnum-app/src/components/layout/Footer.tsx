import Link from "next/link";
import Image from "next/image";

export default function Footer() {
    return (
        <footer className="bg-muted/30 border-t">
            <div className="container mx-auto px-4 py-12">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div className="space-y-4">
                        <Link href="/" className="flex items-center space-x-2">
                            <div className="w-9 h-9 bg-gradient-to-br from-[hsl(var(--neon-lime))] to-[hsl(72,70%,40%)] rounded-lg flex items-center justify-center p-1.5">
                                <Image
                                    src="/logos/nexnum-logo.svg"
                                    alt="NexNum Logo"
                                    width={24}
                                    height={24}
                                    style={{ filter: 'brightness(0)' }}
                                />
                            </div>
                            <span className="font-bold text-xl tracking-tight">NexNum</span>
                        </Link>
                        <p className="text-sm text-muted-foreground">
                            Premium virtual phone numbers for instant activation. Secure, private, and global.
                        </p>
                    </div>

                    <div>
                        <h3 className="font-semibold mb-4">Product</h3>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><Link href="#features" className="hover:text-primary">Features</Link></li>

                            <li><Link href="/api-docs" className="hover:text-primary">API</Link></li>
                            <li><Link href="/coverage" className="hover:text-primary">Coverage</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="font-semibold mb-4">Company</h3>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><Link href="/about" className="hover:text-primary">About</Link></li>
                            <li><Link href="/blog" className="hover:text-primary">Blog</Link></li>
                            <li><Link href="/careers" className="hover:text-primary">Careers</Link></li>
                            <li><Link href="/legal" className="hover:text-primary">Legal</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="font-semibold mb-4">Connect</h3>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><a href="#" className="hover:text-primary">Twitter</a></li>
                            <li><a href="#" className="hover:text-primary">GitHub</a></li>
                            <li><a href="#" className="hover:text-primary">Discord</a></li>
                            <li><a href="/contact" className="hover:text-primary">Contact Us</a></li>
                        </ul>
                    </div>
                </div>

                <div className="mt-12 pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-sm text-muted-foreground">
                        © {new Date().getFullYear()} NexNum Inc. All rights reserved.
                    </p>
                    <div className="flex gap-4 text-sm text-muted-foreground">
                        <Link href="/privacy" className="hover:text-primary">Privacy Policy</Link>
                        <Link href="/terms" className="hover:text-primary">Terms of Service</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
