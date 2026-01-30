"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLocale } from "next-intl"
import "../globals.css"

export default function NotFound() {
    return (
        <div style={{ backgroundColor: '#030305', color: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
            <h1 style={{ fontSize: '4rem', marginBottom: '1rem' }}>404</h1>
            <p style={{ color: '#888', marginBottom: '2rem' }}>Page Not Found</p>
            <a href="/" style={{ color: '#ccff00', textDecoration: 'none', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                Return to Home
            </a>
        </div>
    )
}
