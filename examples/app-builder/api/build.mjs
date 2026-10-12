import { build } from 'esbuild';
import path from 'path';
import { SpinEsbuildPlugin } from "@spinframework/build-tools/plugins/esbuild/index.js";
import fs from 'fs';

const spinPlugin = await SpinEsbuildPlugin();

// The LLM provider is fixed at build time so only its SDK is bundled (see spin.toml profiles).
const provider = process.env.LLM_PROVIDER ?? 'anthropic';
if (!['anthropic', 'openai'].includes(provider)) {
    throw new Error(`LLM_PROVIDER must be "anthropic" or "openai", got "${provider}"`);
}
const providerPlugin = {
    name: 'llm-provider',
    setup(build) {
        build.onResolve({ filter: /^#llm-provider$/ }, () => ({
            path: path.resolve(`src/llm/${provider}.ts`),
        }));
    },
};

let SourceMapPlugin = {
    name: 'excludeVendorFromSourceMap',
    setup(build) {
        build.onLoad({ filter: /node_modules/ }, args => {
            // Skip .json: appending a sourcemap comment corrupts JSON data files
            // (spin-js-sdk#406). The SDKs bundle some .json at build time.
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
    outfile: `./build/${provider}/bundle.js`,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    sourcemap: true,
    minify: false,
    plugins: [providerPlugin, spinPlugin, SourceMapPlugin],
    logLevel: 'error',
    loader: {
        '.ts': 'ts',
        '.tsx': 'tsx',
    },
    resolveExtensions: ['.ts', '.tsx', '.js'],
    sourceRoot: path.resolve(process.cwd(), 'src'),
});
