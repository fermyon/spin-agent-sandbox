import { build } from 'esbuild';
import path from 'path';
import { SpinEsbuildPlugin } from "@spinframework/build-tools/plugins/esbuild/index.js";
import fs from 'fs';

const spinPlugin = await SpinEsbuildPlugin();

// Appends a minimal inline source map to unbundled vendor files so source maps
// always exist. The `.json` guard is the fix for spinframework/spin-js-sdk#406:
// esbuild rejects JSON that contains comments, and cheerio's transitive deps
// (iconv-lite / whatwg-encoding) ship encoding-table .json files. Without the
// guard the appended sourceMappingURL comment makes those .json files unparseable.
let SourceMapPlugin = {
    name: 'excludeVendorFromSourceMap',
    setup(build) {
        build.onLoad({ filter: /node_modules/ }, args => {
            if (args.path.endsWith('.json')) return;
            return {
                contents: fs.readFileSync(args.path, 'utf8')
                    + '\n//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIiJdLCJtYXBwaW5ncyI6IkEifQ==',
                loader: 'default',
            }
        })
    },
}

await build({
    entryPoints: ['./src/index.ts'],
    outfile: './build/bundle.js',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    // Prefer browser builds (nanoid/ulidx ship browser-specific entrypoints) and
    // define globals the bundled libs expect but the engine does not provide.
    conditions: ['browser', 'import', 'default'],
    mainFields: ['browser', 'module', 'main'],
    define: {
        'process.env.NODE_ENV': '"production"',
        'global': 'globalThis',
    },
    sourcemap: true,
    minify: true,
    plugins: [spinPlugin, SourceMapPlugin],
    logLevel: 'error',
    loader: {
        '.ts': 'ts',
        '.tsx': 'tsx',
    },
    resolveExtensions: ['.ts', '.tsx', '.js'],
    sourceRoot: path.resolve(process.cwd(), 'src'),
});
