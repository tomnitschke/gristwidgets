const bundlerWorker = new Worker('bundler.worker.js');

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

runButton.addEventListener('click', () => {
  runButton.disabled = true;
  runButton.textContent = 'Bundling...';
  bundlerWorker.postMessage({ type: 'BUNDLE', files: userFiles });
});

// Handle data returned back from our background compiler worker
bundlerWorker.onmessage = (e) => {
  const { type, code, message } = e.data;
  runButton.disabled = false;
  runButton.textContent = 'Run Code';

  if (type === 'SUCCESS') {
    updatePreview(code);
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
