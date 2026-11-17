// Builds dist/mcsl-global.min.js from src/mcsl-global.js
// Comments and whitespace are removed; names are kept readable.
import { minify } from 'terser';
import fs from 'node:fs';

const src = fs.readFileSync('src/mcsl-global.js', 'utf8');
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const result = await minify(src, { compress: false, mangle: false, format: { comments: false } });
const banner = `/*! MCSL global script v${version} | https://github.com/arnabfouzder/mcsl-scripts */\n`;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/mcsl-global.min.js', banner + result.code + '\n');
console.log(`dist/mcsl-global.min.js written (${(banner.length + result.code.length).toLocaleString()} bytes)`);
