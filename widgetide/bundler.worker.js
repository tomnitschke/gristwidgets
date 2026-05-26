const UNPKG_DOMAIN = "https://unpkg.com/";
const ESBUILD_LIB_REMAINDER = "esbuild-wasm@0.25.0/esm/browser.js";
const ESBUILD_WASM_REMAINDER = "esbuild-wasm@0.25.0/esbuild.wasm";

const ESMSH_DOMAIN = "https://esm.sh"; // Retain protocol for clean parsing

let esbuild = null;
let esbuildInitialized = false;

const cdnResolverPlugin = {
  name: 'cdn-resolver',
  setup(build) {
    // 1. Resolve local entry file
    build.onResolve({ filter: /^index\.js$/ }, () => ({ path: 'index.js', namespace: 'local' }));

    // 2. FIXED: Resolve relative imports (./ or ../)
    build.onResolve({ filter: /^\.\.?\// }, (args) => {
      // If the file requesting this relative asset is a CDN file, resolve it as a CDN url
      if (args.importer.startsWith('http://') || args.importer.startsWith('https://')) {
        return {
          path: new URL(args.path, args.importer).toString(),
          namespace: 'cdn'
        };
      }
      
      // Otherwise, it's a relative import inside the user's local code editor
      return {
        path: new URL(args.path, 'http://local/' + args.importer).pathname.replace(/^\//, ''),
        namespace: 'local'
      };
    });

    // 3. Catch root-relative CDN sub-dependencies (e.g. "/react@19...")
    build.onResolve({ filter: /^\/[^/]/ }, (args) => {
      return { path: `${ESMSH_DOMAIN}${args.path}`, namespace: 'cdn' };
    });

    // 4. Catch normal external package names (e.g. "react" or "canvas-confetti")
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.importer.startsWith(ESMSH_DOMAIN)) {
        return { path: new URL(args.path, args.importer).toString(), namespace: 'cdn' };
      }
      return { path: `${ESMSH_DOMAIN}/${args.path}`, namespace: 'cdn' };
    });

    // Load code content for local files
    build.onLoad({ filter: /.*/, namespace: 'local' }, async (args) => {
      const files = self.currentFiles || { 'index.js': 'console.log("No input code provided")' };
      return { contents: files[args.path], loader: 'jsx' };
    });

    // Load code content from external CDN
    build.onLoad({ filter: /.*/, namespace: 'cdn' }, async (args) => {
      try {
        const response = await fetch(args.path);
        if (!response.ok) throw new Error(`Failed to fetch package from CDN: ${args.path}`);
        
        return {
          contents: await response.text(),
          loader: 'js'
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

    try {
      if (!esbuild) {
        esbuild = await import(`${UNPKG_DOMAIN}${ESBUILD_LIB_REMAINDER}`);
      }

      if (!esbuildInitialized) {
        await esbuild.initialize({
          worker: false,
          wasmURL: `${UNPKG_DOMAIN}${ESBUILD_WASM_REMAINDER}`
        });
        esbuildInitialized = true;
      }

      const result = await esbuild.build({
        entryPoints: ['index.js'],
        format: "esm",
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
