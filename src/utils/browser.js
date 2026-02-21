import fs from 'fs';
import puppeteer from 'puppeteer-extra';

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (Apple) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

export const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

/**
 * Get the standardized Chrome executable path for Railway/Linux environments
 */
export const getExecutablePath = () => {
    // If explicitly set via env var
    if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

    // Common paths on Railway/Debian
    const linuxPaths = [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
    ];

    if (process.platform === 'linux') {
        for (const path of linuxPaths) {
            if (fs.existsSync(path)) {
                console.log(`🧩 [Browser] Chrome detectado em: ${path}`);
                return path;
            }
        }
    }

    console.log(`⚠️ [Browser] Nenhum Chrome detectado na lista padrão (${process.platform}). Usando default.`);
    // Default to undefined to let Puppeteer decide (works on Windows/Mac)
    return undefined;
};

/**
 * Common optimized Puppeteer launch arguments for low-memory environments
 */
export const getCommonArgs = () => [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-sync',
    '--no-first-run',
    '--no-zygote',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1280,720'
];

export default { getExecutablePath, getCommonArgs };
