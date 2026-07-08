#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');

// Ensure dist directory exists and is empty
await fs.emptyDir(distDir);

// Copy manifest.json
await fs.copy(path.join(__dirname, 'manifest.json'), path.join(distDir, 'manifest.json'));

// Create src directory in dist
await fs.ensureDir(path.join(distDir, 'src'));

// Copy and potentially minify JS files
const background = await fs.readFile(path.join(__dirname, 'src/background.js'), 'utf-8');
const content = await fs.readFile(path.join(__dirname, 'src/content.js'), 'utf-8');
const options = await fs.readFile(path.join(__dirname, 'src/options.js'), 'utf-8');
const optionsHtml = await fs.readFile(path.join(__dirname, 'src/options.html'), 'utf-8');
const popup = await fs.readFile(path.join(__dirname, 'src/popup.js'), 'utf-8');
const popupHtml = await fs.readFile(path.join(__dirname, 'src/popup.html'), 'utf-8');

await fs.writeFile(path.join(distDir, 'src/background.js'), background);
await fs.writeFile(path.join(distDir, 'src/content.js'), content);
await fs.writeFile(path.join(distDir, 'src/options.js'), options);
await fs.writeFile(path.join(distDir, 'src/options.html'), optionsHtml);
await fs.writeFile(path.join(distDir, 'src/popup.js'), popup);
await fs.writeFile(path.join(distDir, 'src/popup.html'), popupHtml);

// Copy icon.png
await fs.copy(path.join(__dirname, 'icon.png'), path.join(distDir, 'icon.png'));

console.log('✓ Extension built successfully to dist/');
