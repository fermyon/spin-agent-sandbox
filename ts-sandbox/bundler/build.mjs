import { build } from 'esbuild';
import path from 'path';
import { SpinEsbuildPlugin } from "@spinframework/build-tools/plugins/esbuild/index.js";

const spinPlugin = await SpinEsbuildPlugin();

await build({
    entryPoints: ['./src/index.ts'],
    outfile: './build/bundle.js',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    conditions: ['browser', 'import', 'default'],
    mainFields: ['browser', 'module', 'main'],
    define: {
        'process.env.NODE_ENV': '"production"',
        'global': 'globalThis',
    },
    sourcemap: false,
    minify: true,
    plugins: [spinPlugin],
    logLevel: 'error',
    loader: {
        '.ts': 'ts',
        '.tsx': 'tsx',
    },
    resolveExtensions: ['.ts', '.tsx', '.js'],
    sourceRoot: path.resolve(process.cwd(), 'src'),
});
