/**
 * cookieHelper.js - Cookie Parsing and Domain Matching Utilities
 */

/**
 * Parses a Set-Cookie header string into a structured cookie object.
 * @param {string} setCookieStr - Raw Set-Cookie header value
 * @param {string} defaultDomain - Domain from request URL
 * @returns {object|null} Structured cookie object
 */
export function parseSetCookie(setCookieStr, defaultDomain = '') {
    if (!setCookieStr || typeof setCookieStr !== 'string') return null;

    const parts = setCookieStr.split(';').map(p => p.trim());
    if (parts.length === 0 || !parts[0]) return null;

    const firstEq = parts[0].indexOf('=');
    if (firstEq === -1) return null;

    const name = parts[0].substring(0, firstEq).trim();
    const value = parts[0].substring(firstEq + 1).trim();
    if (!name) return null;

    let domain = defaultDomain;
    let path = '/';
    let expires = null;
    let maxAge = null;
    let httpOnly = false;
    let secure = false;

    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        const eqIdx = part.indexOf('=');
        const key = (eqIdx !== -1 ? part.substring(0, eqIdx) : part).toLowerCase().trim();
        const val = eqIdx !== -1 ? part.substring(eqIdx + 1).trim() : '';

        if (key === 'domain' && val) {
            domain = val.startsWith('.') ? val.substring(1) : val;
        } else if (key === 'path' && val) {
            path = val;
        } else if (key === 'expires' && val) {
            expires = val;
        } else if (key === 'max-age' && val) {
            maxAge = parseInt(val, 10);
        } else if (key === 'httponly') {
            httpOnly = true;
        } else if (key === 'secure') {
            secure = true;
        }
    }

    return {
        name,
        value,
        domain: domain.toLowerCase(),
        path,
        expires,
        maxAge,
        httpOnly,
        secure,
        createdAt: Date.now()
    };
}

/**
 * Checks if a cookie domain matches a target hostname.
 */
export function matchDomain(cookieDomain, targetHostname) {
    if (!cookieDomain || !targetHostname) return true;
    const cd = cookieDomain.toLowerCase();
    const th = targetHostname.toLowerCase();
    if (cd === th) return true;
    if (th.endsWith('.' + cd)) return true;
    return false;
}

/**
 * Formats matching cookies into a single HTTP 'Cookie' header string.
 */
export function formatCookieHeader(cookies, targetUrl) {
    if (!Array.isArray(cookies) || cookies.length === 0 || !targetUrl) return '';
    
    let hostname = '';
    try {
        const u = new URL(targetUrl);
        hostname = u.hostname;
    } catch {
        return '';
    }

    const matching = cookies.filter(c => matchDomain(c.domain, hostname));
    if (matching.length === 0) return '';

    return matching.map(c => `${c.name}=${c.value}`).join('; ');
}
