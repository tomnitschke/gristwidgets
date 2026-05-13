function onDOMReady (fn) { if (document.readyState !== "loading") { fn(); } else { document.addEventListener("DOMContentLoaded", fn); } }


// Reusable 100% FOSS download helper using short-lived Memory Object URLs
function triggerBrowserDownload(contentString, filename, contentType) {
  const blob = new Blob([contentString], { type: contentType });
  const temporaryUrl = URL.createObjectURL(blob);
  
  const dummyAnchor = document.createElement('a');
  dummyAnchor.href = temporaryUrl;
  dummyAnchor.download = filename; // Tells browser to save file locally instead of navigating to it
  
  document.body.appendChild(dummyAnchor);
  dummyAnchor.click(); // Trigger native system save file interface
  
  // Clean up memory space
  document.body.removeChild(dummyAnchor);
  URL.revokeObjectURL(temporaryUrl);
}



onDOMReady(async () => {
  const bundlerWorker = new Worker('bundler.worker.js', { type: "module" });
  
  // Simulated user editor input (e.g., from an input textarea or CodeMirror instance)
  const userFiles = {
    'index.js': `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import confetti from 'canvas-confetti';
  
      function App() {
        return (
          <div style={{ textAlign: 'center', fontFamily: 'sans-serif', marginTop: '40px' }}>
            <h1>100% FOSS Sandbox Live!</h1>
            <button onClick={() => confetti()}>Trigger Confetti Effect</button>
          </div>
        );
      }
  
      const container = document.getElementById('root');
      const root = createRoot(container);
      root.render(<App />);
    `
  };
  
  // Target elements
  const previewIframe = document.getElementById('preview');
  const runButton = document.getElementById('run-btn');
  const downloadBundleBtn = document.getElementById('download-bundle-btn');

  // Variable to store the latest compiled code string in memory
  let lastCompiledCode = null;
  
  runButton.addEventListener('click', () => {
    runButton.disabled = true;
    runButton.textContent = 'Bundling...';
    bundlerWorker.postMessage({ type: 'BUNDLE', files: userFiles });
  });

  // FEATURE 1: Download the complete, self-contained HTML/JS bundle application
downloadBundleBtn.addEventListener('click', () => {
  if (!lastCompiledCode) return;

  // Build the complete standalone page skeleton structure
  const standaloneHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Exported Playground Application</title>
</head>
<body>
    <div id="root"></div>
    <script>${lastCompiledCode}<\/script>
</body>
</html>`;

  triggerBrowserDownload(standaloneHtml, 'index.html', 'text/html');
});
  
  // Handle data returned back from our background compiler worker
  bundlerWorker.onmessage = (e) => {
    const { type, code, message } = e.data;
    runButton.disabled = false;
    runButton.textContent = 'Run Code';
  
    if (type === 'SUCCESS') {
      updatePreview(code);
      lastCompiledCode = code;
      downloadBundleBtn.disabled = false;  // Enable download button only if compilation succeeded
    } else if (type === 'ERROR') {
      console.error("Bundle Failed:", message);
      alert(`Compilation Error: ${message}`);
    }
  };
  
  // Safely update execution sandbox using an isolated Object URL
  function updatePreview(compiledJS) {
    const htmlTemplate = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
      </head>
      <body>
        <div id="root"></div>
        <script>${compiledJS}<\/script>
      </body>
      </html>
    `;
  
    // Clean up existing memory pointers
    if (previewIframe.src) {
      URL.revokeObjectURL(previewIframe.src);
    }
  
    const blob = new Blob([htmlTemplate], { type: 'text/html' });
    previewIframe.src = URL.createObjectURL(blob);
  }
});
