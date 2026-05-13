const UNPKG_DOMAIN = "unpkg.com";
const ESBUILD_LIB_REMAINDER = "esbuild-wasm@0.25.0/lib/browser.js";
const ESBUILD_WASM_REMAINDER = "esbuild-wasm@0.25.0/esbuild.wasm";

const ESMSH_DOMAIN = "esm.sh";

// Injecting the main library
importScripts(UNPKG_DOMAIN + ESBUILD_LIB_REMAINDER);

let esbuildInitialized = false;

const cdnResolverPlugin = {
  name: 'cdn-resolver',
  setup(build) {
    // 1. Entry File Resolution
    build.onResolve({ filter: /^index\.js$/ }, () => ({ path: 'index.js', namespace: 'local' }));

    // 2. Relative Project Imports
    build.onResolve({ filter: /^\.\.?\// }, (args) => ({
      path: new URL(args.path, 'http://local/' + args.importer).pathname.replace(/^\//, ''),
      namespace: 'local'
    }));

    // 3. Bare NPM Package Imports
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      // If the dependency was requested by an existing file already on esm.sh
      if (args.importer.startsWith(ESMSH_DOMAIN)) {
        return { path: new URL(args.path, args.importer).toString(), namespace: 'cdn' };
      }
      // Top-level dependency requested by your user
      return { path: ESMSH_DOMAIN + args.path, namespace: 'cdn' };
    });

    // Load Local Modules
    build.onLoad({ filter: /.*/, namespace: 'local' }, async (args) => {
      const files = self.currentFiles || { 'index.js': 'console.log("No input code provided")' };
      return { contents: files[args.path], loader: 'jsx' };
    });

    // Fetch NPM Code Modules Over Network
    build.onLoad({ filter: /.*/, namespace: 'cdn' }, async (args) => {
      try {
        const response = await fetch(args.path);
        if (!response.ok) throw new Error(`Failed to fetch package from CDN: ${args.path}`);
        
        return {
          contents: await response.text(),
          loader: 'js',
          resolveDir: new URL('.', args.path).toString()
        };
      } catch (err) {
        return { errors: [{ text: err.message }] };
      }
    });
  }
};

self.onmessage = async (e) => {
  const { type, files } = e.data;

  if (type === 'BUNDLE') {
    self.currentFiles = files;

    if (!esbuildInitialized) {
      await esbuild.initialize({
        worker: false,
        // Assembling the complete binary path from the distinct tokens
        wasmURL: UNPKG_DOMAIN + ESBUILD_WASM_REMAINDER
      });
      esbuildInitialized = true;
    }

    try {
      const result = await esbuild.build({
        entryPoints: ['index.js'],
        bundle: true,
        write: false,
        plugins: [cdnResolverPlugin],
        define: { 'process.env.NODE_ENV': '"development"' }
      });

      self.postMessage({ type: 'SUCCESS', code: result.outputFiles[0].text });
    } catch (err) {
      self.postMessage({ type: 'ERROR', message: err.message });
    }
  }
};
