const UNPKG_DOMAIN = "unpkg.com/";
const ESBUILD_LIB_REMAINDER = "esbuild-wasm@0.25.0/lib/browser.js";
const ESBUILD_WASM_REMAINDER = "esbuild-wasm@0.25.0/esbuild.wasm";

const ESMSH_DOMAIN = "esm.sh/";

let esbuild = null;
let esbuildInitialized = false;

const cdnResolverPlugin = {
  name: 'cdn-resolver',
  setup(build) {
    build.onResolve({ filter: /^index\.js$/ }, () => ({ path: 'index.js', namespace: 'local' }));

    build.onResolve({ filter: /^\.\.?\// }, (args) => ({
      path: new URL(args.path, 'http://local/' + args.importer).pathname.replace(/^\//, ''),
      namespace: 'local'
    }));

    build.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.importer.startsWith(ESMSH_DOMAIN)) {
        return { path: new URL(args.path, args.importer).toString(), namespace: 'cdn' };
      }
      return { path: `${ESMSH_DOMAIN}${args.path}`, namespace: 'cdn' };
    });

    build.onLoad({ filter: /.*/, namespace: 'local' }, async (args) => {
      const files = self.currentFiles || { 'index.js': 'console.log("No input code provided")' };
      return { contents: files[args.path], loader: 'jsx' };
    });

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

    try {
      // Lazy-load the ES module dynamically to comply with browser cross-origin worker security
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
        bundle: true,
        write: false,
        plugins: [cdnResolverPlugin],
        define: { 'process.env.NODE_ENV': '"development"' }
      });

      self.postMessage({ type: 'SUCCESS', code: result.outputFiles[0].text });
    } catch (err) {
      // This will now catch both loading/initialization errors and compilation errors
      self.postMessage({ type: 'ERROR', message: err.message });
    }
  }
};
