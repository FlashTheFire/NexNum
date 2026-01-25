import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        // Environment
        environment: 'node',
        globals: true,

        // Path aliases
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },

        // Exclusions
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            'e2e/**',
            '**/.next/**',
        ],

        // Test file patterns
        include: [
            'src/**/*.{test,spec}.{ts,tsx}',
        ],

        // Coverage configuration
        coverage: {
            provider: 'v8',
            reporter: ['text', 'text-summary', 'lcov', 'html'],
            reportsDirectory: './coverage',

            // Coverage thresholds
            thresholds: {
                lines: 60,
                functions: 60,
                branches: 50,
                statements: 60,
            },

            // Files to include in coverage
            include: [
                'src/lib/**/*.ts',
                'src/workers/**/*.ts',
                'src/config/**/*.ts',
            ],

            // Files to exclude from coverage
            exclude: [
                'src/**/*.d.ts',
                'src/**/*.test.ts',
                'src/**/*.spec.ts',
                'src/**/index.ts',
                'src/lib/tests/**',
            ],
        },

        // Setup files
        setupFiles: [],

        // Timeouts
        testTimeout: 10000,
        hookTimeout: 10000,

        // Reporters
        reporters: ['verbose'],
    },
})
