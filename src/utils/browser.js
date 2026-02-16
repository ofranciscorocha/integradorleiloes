import fs from 'fs';
import puppeteer from 'puppeteer-extra';

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
            if (fs.existsSync(path)) return path;
        }
    }

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
    '--single-process', // Warning: can be unstable, but saves a lot of memory
    '--window-size=1280,720'
];

export default { getExecutablePath, getCommonArgs };
