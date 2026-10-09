/**
 * Packaging utility for ScreenQuizSolver
 * Creates a clean release zip containing only extension distribution assets.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const zipName = `screen-quiz-solver-v${manifest.version}.zip`;
const outputPath = path.join(distDir, zipName);

console.log(`Packaging ScreenQuizSolver v${manifest.version}...`);

const filesToInclude = [
  'manifest.json',
  'background.js',
  'content.js',
  'content.css',
  'popup.html',
  'popup.js',
  'options.html',
  'lib',
  'icons'
];

try {
  // Remove existing output if present
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  const cmd = `zip -r "${outputPath}" ${filesToInclude.join(' ')}`;
  execSync(cmd, { cwd: rootDir, stdio: 'inherit' });
  console.log(`Successfully created distribution archive: dist/${zipName}`);
} catch (err) {
  console.error('Failed to package extension:', err.message);
  process.exit(1);
}
