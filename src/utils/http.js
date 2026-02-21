import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { proxyConfig } from './proxy-config.js';

/**
 * Enhanced HTTP Utility with retries, persistence, and proxy support.
 * Designed to meet the "persistent until works" requirement.
 */
class PersistentHTTP {
    constructor(config = {}) {
        this.maxRetries = config.maxRetries || 5;
        this.retryDelay = config.retryDelay || 2000;
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'
        ];
    }

    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    async get(url, options = {}) {
        let lastError;
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const instance = this.createInstance(options);
                return await instance.get(url, options);
            } catch (error) {
                lastError = error;
                console.log(`⚠️ [HTTP] Retry ${attempt}/${this.maxRetries} for ${url} - Reason: ${error.message}`);
                if (attempt < this.maxRetries) {
                    await new Promise(r => setTimeout(r, this.retryDelay * attempt));
                }
            }
        }
        throw lastError;
    }

    async post(url, data, options = {}) {
        let lastError;
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const instance = this.createInstance(options);
                return await instance.post(url, data, options);
            } catch (error) {
                lastError = error;
                if (attempt < this.maxRetries) {
                    await new Promise(r => setTimeout(r, this.retryDelay * attempt));
                }
            }
        }
        throw lastError;
    }

    createInstance(options = {}) {
        const headers = {
            'User-Agent': this.getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            ...options.headers
        };

        const config = {
            timeout: options.timeout || 30000,
            headers
        };

        if (proxyConfig.enabled && proxyConfig.list.length > 0) {
            const proxy = proxyConfig.list[Math.floor(Math.random() * proxyConfig.list.length)];
            const agent = new HttpsProxyAgent(proxy);
            config.httpsAgent = agent;
            config.proxy = false; // Disable axios default proxy handling when using agent
            console.log(`🌐 [HTTP] Using Proxy: ${proxy.split('@').pop()}`);
        }

        return axios.create(config);
    }
}

export const http = new PersistentHTTP();
export default PersistentHTTP;
