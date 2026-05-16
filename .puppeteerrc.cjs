const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */

// No ShardCloud (Linux), usa o path absoluto padrão /app/.cache/puppeteer
// Localmente (Windows), usa a pasta relativa do projeto
const cacheDirectory = process.platform === 'linux'
  ? '/app/.cache/puppeteer'
  : join(process.cwd(), '.cache', 'puppeteer');

module.exports = {
  cacheDirectory,
  skipDownload: false,
};
