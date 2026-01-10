"use client"

import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react"
import { cn } from "@/lib/utils/utils"
import { Copy, Check, Maximize2, Minimize2, AlertTriangle } from "lucide-react"

interface JsonEditorProps {
    value: string
    onChange?: (value: string) => void
    readOnly?: boolean
    className?: string
    minHeight?: string
    maxHeight?: string
}

// Syntax highlighting colors
const TOKEN_COLORS = {
    key: "#9CDCFE",           // Blue - JSON keys
    string: "#CE9178",        // Orange/Brown - Strings
    number: "#B5CEA8",        // Green - Numbers
    boolean: "#569CD6",       // Blue - true/false
    null: "#569CD6",          // Blue - null
    bracket: "#FFD700",       // Gold - {} []
    punctuation: "#808080",   // Gray - : ,
}

// Robust Regex for JSON syntax highlighting
// Matches: Strings (escaping handled), Keys (string followed by colon), Keywords, Numbers, Separators
// NOTE: We strictly forbid newlines inside strings `[^"\\\n]` to prevent unclosed quotes from swallowing the rest of the document (glitching)
const JSON_REGEX = /("(\\.|[^"\\\n])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[{}\[\],:])/g

function syntaxHighlight(json: string): string {
    if (!json) return ''
    try {
        // First try to parse and re-stringify for proper formatting check
        const escaped = json
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')

        return escaped.replace(JSON_REGEX, (match) => {
            let color = TOKEN_COLORS.number
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    // Key
                    color = TOKEN_COLORS.key
                } else {
                    // String value
                    color = TOKEN_COLORS.string
                }
            } else if (/true|false/.test(match)) {
                color = TOKEN_COLORS.boolean
            } else if (/null/.test(match)) {
                color = TOKEN_COLORS.null
            } else if (/[{}\[\]]/.test(match)) {
                color = TOKEN_COLORS.bracket
            } else if (/[:,]/.test(match)) {
                color = TOKEN_COLORS.punctuation
            }
            return `<span style="color:${color}">${match}</span>`
        }
        )
    } catch {
        return json
    }
}

function addLineNumbers(html: string): string {
    if (!html) return ''
    const lines = html.split('\n')
    return lines.map((line, i) => {
        const lineNum = `<span class="line-number">${i + 1}</span>`
        return `<div class="code-line">${lineNum}<span class="line-content">${line || ' '}</span></div>`
    }).join('')
}

export function JsonEditor({
    value,
    onChange,
    readOnly = false,
    className,
    minHeight = "150px",
    maxHeight = "400px"
}: JsonEditorProps) {
    const safeValue = value || ''
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const preRef = useRef<HTMLPreElement>(null)
    const [copied, setCopied] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [isValid, setIsValid] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string>("")
    const [isFocused, setIsFocused] = useState(false)

    // Validate JSON
    const validateJson = useCallback((json: string) => {
        try {
            if (json.trim()) {
                JSON.parse(json)
            }
            setIsValid(true)
            setErrorMessage("")
            return true
        } catch (e: any) {
            setIsValid(false)
            setErrorMessage(e.message || "Invalid JSON")
            return false
        }
    }, [])

    useEffect(() => {
        validateJson(safeValue)
    }, [safeValue, validateJson])

    // Sync scroll between textarea and highlighted pre
    const handleScroll = () => {
        if (textareaRef.current && preRef.current) {
            preRef.current.scrollTop = textareaRef.current.scrollTop
            preRef.current.scrollLeft = textareaRef.current.scrollLeft
        }
    }

    // Force scroll sync on every render/update to prevent desync
    useLayoutEffect(() => {
        handleScroll()
    })

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value
        onChange?.(newValue)
    }

    const handleCopy = async () => {
        await navigator.clipboard.writeText(safeValue)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const formatJson = () => {
        try {
            const parsed = JSON.parse(safeValue)
            onChange?.(JSON.stringify(parsed, null, 2))
        } catch {
            // Already invalid
        }
    }

    const highlightedHtml = addLineNumbers(syntaxHighlight(safeValue))

    return (
        <div className={cn(
            "relative group rounded-xl overflow-hidden border transition-all duration-200 bg-[#1a1a1c]",
            isValid ? "border-white/10 hover:border-white/20" : "border-red-500/40",
            isFocused && "ring-2 ring-blue-500/30",
            isExpanded && "fixed inset-4 z-[9999]",
            className
        )}>
            {/* Header toolbar */}
            <div className="flex items-center justify-between px-3 py-2 bg-[#252528] border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                        <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                        <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                    </div>
                    <span className="text-[11px] text-white/40 font-medium tracking-wide">JSON</span>
                    {!isValid && (
                        <div
                            className="flex items-center gap-1.5 text-[11px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-md cursor-help"
                            title={errorMessage}
                        >
                            <AlertTriangle className="w-3 h-3" />
                            Invalid
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {!readOnly && (
                        <button
                            onClick={formatJson}
                            disabled={!isValid}
                            className="px-2 py-1 text-[10px] font-medium text-white/50 hover:text-white hover:bg-white/10 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Format JSON (Ctrl+Shift+F)"
                        >
                            Format
                        </button>
                    )}
                    <button
                        onClick={handleCopy}
                        className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors"
                        title="Copy to clipboard"
                    >
                        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors"
                        title={isExpanded ? "Exit fullscreen" : "Fullscreen"}
                    >
                        {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Editor container */}
            <div
                className="relative overflow-hidden"
                style={{
                    height: isExpanded ? "calc(100vh - 120px)" : "auto",
                    minHeight: isExpanded ? undefined : minHeight,
                    maxHeight: isExpanded ? undefined : maxHeight
                }}
            >
                {/* Syntax highlighted background - no scrollbar (follows textarea scroll) */}
                <pre
                    ref={preRef}
                    className="absolute inset-0 overflow-hidden p-3 m-0 font-mono text-xs leading-6 pointer-events-none select-none whitespace-pre"
                    style={{
                        background: 'transparent',
                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace'
                    }}
                    dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                />

                {/* Actual editable textarea */}
                <textarea
                    aria-label="JSON Editor"
                    ref={textareaRef}
                    value={safeValue}
                    onChange={handleChange}
                    onScroll={handleScroll}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    readOnly={readOnly}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    wrap="off"
                    className={cn(
                        "relative w-full h-full bg-transparent text-transparent caret-blue-400 p-3 pl-12 font-mono text-xs leading-6 resize-none focus:outline-none whitespace-pre",
                        "selection:bg-blue-500/30 overflow-auto"
                    )}
                    style={{
                        minHeight: isExpanded ? "calc(100vh - 120px)" : minHeight,
                        maxHeight: isExpanded ? undefined : maxHeight,
                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                        overflowX: 'auto',
                        overflowY: 'auto'
                    }}
                />
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#252528] border-t border-white/5 text-[10px] text-white/30">
                <div className="flex items-center gap-4">
                    <span>Lines: {safeValue.split('\n').length}</span>
                    <span>Chars: {safeValue.length}</span>
                </div>
                <span className="text-white/20">UTF-8</span>
            </div>

            {/* CSS for line numbers */}
            <style jsx global>{`
                .code-line {
                    display: flex;
                    min-height: 1.5rem;
                }
                .line-number {
                    display: inline-block;
                    width: 2.25rem;
                    padding-right: 0.75rem;
                    text-align: right;
                    color: rgba(255,255,255,0.2);
                    user-select: none;
                    flex-shrink: 0;
                    font-size: 10px;
                }
                .line-content {
                    flex: 1;
                    white-space: pre;
                }
            `}</style>
        </div>
    )
}
