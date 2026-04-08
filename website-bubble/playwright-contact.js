/**
 * playwright-contact.js — headless contact form submission
 *
 * Navigates to the local contact page and fills the native form.
 * Called by /api/playwright-fill or run directly for testing:
 *
 *   node playwright-contact.js \
 *     --name "Jane Smith" \
 *     --email "jane@example.com" \
 *     --phone "(555) 123-4567" \
 *     --scale "Small Business" \
 *     --services "General Inquiry"
 *
 * Expects the contact page to have:
 *   #cf-name, #cf-email, #cf-phone, #cf-scale, #cf-services, #cf-submit, #cf-success
 */

const { chromium } = require('playwright');

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--') && i + 1 < argv.length) {
    args[argv[i].slice(2)] = argv[++i];
  }
}

const BASE_URL     = process.env.BASE_URL    || 'http://localhost:3000';
const CONTACT_PATH = process.env.CONTACT_PATH || '/contact.html';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  try {
    await page.goto(BASE_URL + CONTACT_PATH, { waitUntil: 'domcontentloaded' });

    await page.fill('#cf-name',  args.name  || '');
    await page.fill('#cf-email', args.email || '');
    await page.fill('#cf-phone', args.phone || '');

    if (args.scale    && args.scale.trim())    await page.selectOption('#cf-scale',    { label: args.scale });
    if (args.services && args.services.trim()) await page.selectOption('#cf-services', { label: args.services });

    await page.click('#cf-submit');
    await page.waitForFunction(() => !document.getElementById('cf-success').hidden, { timeout: 10000 });

    console.log('Contact form submitted successfully.');
  } catch (err) {
    console.error('Playwright submission failed:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
