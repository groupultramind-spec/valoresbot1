const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer.
  cacheDirectory: join(process.cwd(), '.cache', 'puppeteer'),
  skipDownload: false,
};

