/**
 * Proxy Configuration
 * Proxies should be defined in the format: http://user:pass@host:port
 */
export const proxyConfig = {
    enabled: process.env.USE_PROXIES === 'true',
    list: (process.env.PROXY_LIST || '').split(',').filter(p => p.trim())
};
