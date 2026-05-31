import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

/**
 * Vitest Configuration
 *
 * Root cause of the historic esbuild crash:
 *   - Next.js installs esbuild@0.23.x at the workspace root.
 *   - Vite 7 bundles its own esbuild@0.27.x inside node_modules/vite/node_modules/.
 *   - The native OS binary that Node loads matches the ROOT version (0.23.x).
 *   - When Vite tried to spawn its bundled binary it failed with:
 *       "Host version 0.27.2 does not match binary version 0.23.1"
 *
 * Fix: pin esbuild to 0.27.2 at the workspace root so all callers (Next + Vite)
 * use the same binary (see devDependencies in package.json).
 */
export default defineConfig({
    plugins: [tsconfigPaths()],

    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },

    test: {
        environment: 'node',
        globals: true,

        // Only pick up *.test.ts(x) files — prevents Next.js page routes from
        // being treated as test files.
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],

        // Isolate module registries per test file so vi.mock() calls do not
        // bleed between suites.
        isolate: true,

        // Vitest 4: pool and forks options are now top-level (poolOptions was removed).
        pool: 'forks',
    },
});
