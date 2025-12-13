#!/usr/bin/env node
/**
 * Build script for webview bundle
 * Bundles Milkdown and webview scripts into a single file
 */

const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
    entryPoints: [path.resolve(__dirname, '../src/webview/index.ts')],
    bundle: true,
    outfile: path.resolve(__dirname, '../dist/webview.bundle.js'),
    format: 'iife',
    globalName: 'WebviewBundle',
    platform: 'browser',
    target: ['es2020'],
    minify: !isWatch,
    sourcemap: isWatch ? 'inline' : false,
    define: {
        'process.env.NODE_ENV': isWatch ? '"development"' : '"production"'
    },
    loader: {
        '.css': 'text'
    },
    // Include CSS imports even if marked as no side effects
    ignoreAnnotations: true,
    // Handle node modules that might have issues in browser
    alias: {
        'prosemirror-model': 'prosemirror-model',
        'prosemirror-state': 'prosemirror-state',
        'prosemirror-view': 'prosemirror-view',
        'prosemirror-transform': 'prosemirror-transform',
    }
};

async function build() {
    try {
        if (isWatch) {
            const ctx = await esbuild.context(buildOptions);
            await ctx.watch();
            console.log('👀 Watching for changes...');
        } else {
            const result = await esbuild.build(buildOptions);
            console.log('✅ Webview bundle built successfully!');
            if (result.metafile) {
                console.log(await esbuild.analyzeMetafile(result.metafile));
            }
        }
    } catch (error) {
        console.error('❌ Build failed:', error);
        process.exit(1);
    }
}

build();
