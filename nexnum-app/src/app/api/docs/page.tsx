'use client';

import React from 'react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

/**
 * Live Swagger Documentation Page
 */
export default function ApiDocsPage() {
    return (
        <div className="bg-white min-h-screen">
            <div className="bg-slate-900 border-b border-slate-700 py-4 mb-4">
                <div className="container mx-auto px-4 flex items-center justify-between">
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="text-blue-500">NexNum</span> API Governance Docs
                    </h1>
                    <div className="text-slate-400 text-sm">OpenAPI 3.0 Standard</div>
                </div>
            </div>
            <SwaggerUI url="/api/docs/openapi.json" />
        </div>
    );
}
