'use client'

import dynamic from 'next/dynamic'
import 'swagger-ui-react/swagger-ui.css'

// Import Swagger UI lazily to avoid SSR issues
const SwaggerUI = dynamic(() => import('swagger-ui-react'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
        </div>
    )
})

export default function ApiDocsPage() {
    return (
        <div className="min-h-screen bg-[#0d1117]">
            {/* Header */}
            <header className="border-b border-gray-800 bg-[#161b22]">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center font-bold text-white text-lg">
                            N
                        </div>
                        <div>
                            <h1 className="text-lg font-semibold text-white">NexNum API</h1>
                            <p className="text-xs text-gray-400">Developer Documentation</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-sm rounded-full font-medium">
                            v1.0.0
                        </span>
                        <a
                            href="/en/dashboard"
                            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors"
                        >
                            Dashboard
                        </a>
                    </div>
                </div>
            </header>

            {/* Dark theme overrides for Swagger UI */}
            <style jsx global>{`
                /* Base dark theme */
                .swagger-ui {
                    background: #0d1117 !important;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                }
                
                /* Hide default topbar */
                .swagger-ui .topbar {
                    display: none !important;
                }
                
                /* Info section */
                .swagger-ui .info {
                    margin: 24px 0 !important;
                }
                .swagger-ui .info .title {
                    color: #f0f6fc !important;
                    font-size: 2rem !important;
                }
                .swagger-ui .info .description,
                .swagger-ui .info .description p,
                .swagger-ui .info .description h1,
                .swagger-ui .info .description h2,
                .swagger-ui .info .description h3 {
                    color: #8b949e !important;
                }
                .swagger-ui .info .description code {
                    background: #21262d !important;
                    color: #58a6ff !important;
                    padding: 2px 6px !important;
                    border-radius: 4px !important;
                }
                .swagger-ui .info .description pre {
                    background: #161b22 !important;
                    border: 1px solid #30363d !important;
                    border-radius: 8px !important;
                }
                
                /* Scheme container */
                .swagger-ui .scheme-container {
                    background: #161b22 !important;
                    box-shadow: none !important;
                    border: 1px solid #30363d !important;
                    border-radius: 8px !important;
                    padding: 16px !important;
                }
                
                /* Tags */
                .swagger-ui .opblock-tag {
                    color: #f0f6fc !important;
                    border-bottom: 1px solid #21262d !important;
                    font-size: 1.25rem !important;
                }
                .swagger-ui .opblock-tag:hover {
                    background: #161b22 !important;
                }
                .swagger-ui .opblock-tag-section {
                    border: none !important;
                }
                
                /* Operation blocks */
                .swagger-ui .opblock {
                    background: #161b22 !important;
                    border: 1px solid #30363d !important;
                    border-radius: 8px !important;
                    margin-bottom: 12px !important;
                }
                .swagger-ui .opblock .opblock-summary {
                    border: none !important;
                }
                .swagger-ui .opblock .opblock-summary-method {
                    font-weight: 700 !important;
                    border-radius: 6px !important;
                    min-width: 80px !important;
                }
                .swagger-ui .opblock.opblock-get {
                    border-color: #238636 !important;
                    background: rgba(35, 134, 54, 0.1) !important;
                }
                .swagger-ui .opblock.opblock-get .opblock-summary-method {
                    background: #238636 !important;
                }
                .swagger-ui .opblock.opblock-post {
                    border-color: #1f6feb !important;
                    background: rgba(31, 111, 235, 0.1) !important;
                }
                .swagger-ui .opblock.opblock-post .opblock-summary-method {
                    background: #1f6feb !important;
                }
                .swagger-ui .opblock.opblock-delete {
                    border-color: #da3633 !important;
                    background: rgba(218, 54, 51, 0.1) !important;
                }
                .swagger-ui .opblock.opblock-delete .opblock-summary-method {
                    background: #da3633 !important;
                }
                .swagger-ui .opblock.opblock-put {
                    border-color: #d29922 !important;
                    background: rgba(210, 153, 34, 0.1) !important;
                }
                .swagger-ui .opblock.opblock-put .opblock-summary-method {
                    background: #d29922 !important;
                }
                
                /* Path and description */
                .swagger-ui .opblock .opblock-summary-path {
                    color: #c9d1d9 !important;
                    font-family: 'SFMono-Regular', Consolas, monospace !important;
                }
                .swagger-ui .opblock .opblock-summary-description {
                    color: #8b949e !important;
                }
                
                /* Expanded operation */
                .swagger-ui .opblock-body {
                    background: #0d1117 !important;
                }
                .swagger-ui .opblock-body pre {
                    background: #161b22 !important;
                    color: #c9d1d9 !important;
                    border: 1px solid #30363d !important;
                    border-radius: 8px !important;
                }
                .swagger-ui .opblock-section-header {
                    background: #21262d !important;
                    border: none !important;
                }
                .swagger-ui .opblock-section-header h4 {
                    color: #f0f6fc !important;
                }
                
                /* Parameters */
                .swagger-ui .parameters-col_description {
                    color: #8b949e !important;
                }
                .swagger-ui .parameter__name {
                    color: #58a6ff !important;
                }
                .swagger-ui .parameter__type {
                    color: #a371f7 !important;
                }
                .swagger-ui .parameter__in {
                    color: #7ee787 !important;
                }
                
                /* Response */
                .swagger-ui .responses-inner {
                    background: #0d1117 !important;
                }
                .swagger-ui .response-col_status {
                    color: #7ee787 !important;
                }
                .swagger-ui .response-col_description {
                    color: #8b949e !important;
                }
                
                /* Models */
                .swagger-ui .model-box {
                    background: #161b22 !important;
                    border: 1px solid #30363d !important;
                    border-radius: 8px !important;
                }
                .swagger-ui .model {
                    color: #c9d1d9 !important;
                }
                .swagger-ui .prop-type {
                    color: #7ee787 !important;
                }
                .swagger-ui .prop-format {
                    color: #d29922 !important;
                }
                
                /* Tables */
                .swagger-ui table thead tr th {
                    color: #f0f6fc !important;
                    border-bottom: 1px solid #30363d !important;
                    background: #161b22 !important;
                }
                .swagger-ui table tbody tr td {
                    color: #c9d1d9 !important;
                    border-bottom: 1px solid #21262d !important;
                }
                
                /* Buttons */
                .swagger-ui .btn {
                    border-radius: 6px !important;
                }
                .swagger-ui .btn.authorize {
                    background: #238636 !important;
                    border-color: #238636 !important;
                    color: white !important;
                }
                .swagger-ui .btn.authorize:hover {
                    background: #2ea043 !important;
                }
                .swagger-ui .btn.execute {
                    background: #1f6feb !important;
                    border-color: #1f6feb !important;
                }
                .swagger-ui .authorization__btn {
                    fill: #7ee787 !important;
                }
                
                /* Inputs */
                .swagger-ui select,
                .swagger-ui input[type=text],
                .swagger-ui textarea {
                    background: #0d1117 !important;
                    color: #c9d1d9 !important;
                    border: 1px solid #30363d !important;
                    border-radius: 6px !important;
                }
                .swagger-ui select:focus,
                .swagger-ui input[type=text]:focus,
                .swagger-ui textarea:focus {
                    border-color: #58a6ff !important;
                    outline: none !important;
                }
                
                /* Links */
                .swagger-ui a.nostyle,
                .swagger-ui a {
                    color: #58a6ff !important;
                }
                
                /* Markdown */
                .swagger-ui .markdown p,
                .swagger-ui .renderedMarkdown p {
                    color: #8b949e !important;
                }
                .swagger-ui .markdown code,
                .swagger-ui .renderedMarkdown code {
                    background: #21262d !important;
                    color: #58a6ff !important;
                    padding: 2px 6px !important;
                    border-radius: 4px !important;
                }
                
                /* Try it out */
                .swagger-ui .try-out__btn {
                    border-color: #30363d !important;
                    color: #c9d1d9 !important;
                }
                .swagger-ui .try-out__btn:hover {
                    background: #21262d !important;
                }
            `}</style>

            {/* Main content */}
            <main className="max-w-7xl mx-auto px-6 py-8">
                <SwaggerUI
                    url="/openapi.yaml"
                    docExpansion="list"
                    defaultModelsExpandDepth={-1}
                    persistAuthorization={true}
                />
            </main>
        </div>
    )
}
