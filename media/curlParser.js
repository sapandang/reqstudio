/**
 * cURL Command Parser for REQ Studio
 */

export function tokenizeCurl(cmd) {
    // Normalize line continuations (bash \ and Windows cmd ^)
    const normalized = (cmd || '')
        .replace(/\\\r?\n/g, ' ')
        .replace(/\^\r?\n/g, ' ');

    const tokens = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;
    let escaped = false;

    for (let i = 0; i < normalized.length; i++) {
        const char = normalized[i];

        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }

        if (char === '\\' && !inSingle) {
            escaped = true;
            continue;
        }

        if (char === "'" && !inDouble) {
            inSingle = !inSingle;
            continue;
        }

        if (char === '"' && !inSingle) {
            inDouble = !inDouble;
            continue;
        }

        if (/\s/.test(char) && !inSingle && !inDouble) {
            if (current.length > 0) {
                tokens.push(current);
                current = '';
            }
            continue;
        }

        current += char;
    }

    if (current.length > 0) {
        tokens.push(current);
    }

    // Strip leading 'curl' if present
    if (tokens.length > 0 && tokens[0].toLowerCase() === 'curl') {
        tokens.shift();
    }

    return tokens;
}

export function parseCurl(curlString) {
    if (!curlString || typeof curlString !== 'string') {
        throw new Error('Please enter a valid cURL command.');
    }

    const tokens = tokenizeCurl(curlString);
    if (tokens.length === 0) {
        throw new Error('No valid tokens found in cURL command.');
    }

    let method = null;
    let rawUrl = '';
    let basicAuthUser = '';
    const headersList = [];
    const dataPayloads = [];
    const urlEncodedPayloads = [];
    const formPayloads = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        // Method flags (-X POST, --request POST, --request=POST, -XPOST, -X=POST, -I, --head)
        if (token === '-X' || token === '--request') {
            if (i + 1 < tokens.length) {
                method = tokens[++i].toUpperCase();
            }
            continue;
        }
        if (token.startsWith('--request=')) {
            method = token.substring(10).trim().toUpperCase();
            continue;
        }
        if (token.startsWith('-X') && token.length > 2) {
            let m = token.substring(2).trim();
            if (m.startsWith('=')) m = m.substring(1).trim();
            if (m) method = m.toUpperCase();
            continue;
        }
        if (token === '-I' || token === '--head') {
            method = 'HEAD';
            continue;
        }

        // Header flags
        if (token === '-H' || token === '--header') {
            if (i + 1 < tokens.length) {
                const headerStr = tokens[++i];
                const colonIdx = headerStr.indexOf(':');
                if (colonIdx !== -1) {
                    const key = headerStr.slice(0, colonIdx).trim();
                    const value = headerStr.slice(colonIdx + 1).trim();
                    if (key) {
                        headersList.push({ key, value, enabled: true });
                    }
                }
            }
            continue;
        }

        // Cookie flags (-b, --cookie)
        if (token === '-b' || token === '--cookie') {
            if (i + 1 < tokens.length) {
                const cookieVal = tokens[++i];
                if (cookieVal) {
                    headersList.push({ key: 'Cookie', value: cookieVal, enabled: true });
                }
            }
            continue;
        }
        if (token.startsWith('--cookie=')) {
            const cookieVal = token.substring(9).trim();
            if (cookieVal) {
                headersList.push({ key: 'Cookie', value: cookieVal, enabled: true });
            }
            continue;
        }
        if (token.startsWith('-b') && token.length > 2) {
            const cookieVal = token.substring(2).trim();
            if (cookieVal) {
                headersList.push({ key: 'Cookie', value: cookieVal, enabled: true });
            }
            continue;
        }

        // Basic Auth flag
        if (token === '-u' || token === '--user') {
            if (i + 1 < tokens.length) {
                basicAuthUser = tokens[++i];
            }
            continue;
        }

        // Data / Body flags
        if (['-d', '--data', '--data-raw', '--data-binary', '--data-ascii'].includes(token)) {
            if (i + 1 < tokens.length) {
                dataPayloads.push(tokens[++i]);
            }
            continue;
        }

        if (token === '--data-urlencode') {
            if (i + 1 < tokens.length) {
                urlEncodedPayloads.push(tokens[++i]);
            }
            continue;
        }

        // Multipart form flags
        if (token === '-F' || token === '--form') {
            if (i + 1 < tokens.length) {
                formPayloads.push(tokens[++i]);
            }
            continue;
        }

        // URL flag or positional argument
        if (token === '--url' || token === '--location') {
            if (token === '--url' && i + 1 < tokens.length) {
                rawUrl = tokens[++i];
            }
            continue;
        }

        // Ignore boolean / parameterless flags
        if (token.startsWith('-')) {
            // Check if next token looks like an option value or flag
            if (token === '-L' || token === '-k' || token === '--insecure' || token === '-s' || token === '--silent' || token === '-v' || token === '--verbose' || token === '-i' || token === '--include') {
                continue;
            }
            // Skip unrecognized option with argument
            if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
                i++;
            }
            continue;
        }

        // Unflagged string -> candidate for URL
        if (!rawUrl) {
            rawUrl = token;
        }
    }

    if (!rawUrl) {
        throw new Error('Could not find a target URL in the cURL command.');
    }

    // Parse URL & Query Parameters
    let cleanUrl = rawUrl;
    const paramsList = [];

    const qIdx = rawUrl.indexOf('?');
    if (qIdx !== -1) {
        cleanUrl = rawUrl.slice(0, qIdx);
        const queryString = rawUrl.slice(qIdx + 1);
        const searchParams = new URLSearchParams(queryString);
        searchParams.forEach((value, key) => {
            paramsList.push({ key, value, enabled: true });
        });
    }

    if (paramsList.length === 0) {
        paramsList.push({ key: '', value: '', enabled: true });
    }

    if (headersList.length === 0) {
        headersList.push({ key: '', value: '', enabled: true });
    }

    // Determine Body Type & Payload
    let bodyType = 'none';
    let bodyText = '';
    const bodyUrlEncoded = [{ key: '', value: '', enabled: true }];
    const bodyMultipart = [{ key: '', value: '', type: 'text', enabled: true }];

    const contentTypeHeader = headersList.find(h => h.key.toLowerCase() === 'content-type')?.value?.toLowerCase() || '';

    if (formPayloads.length > 0) {
        bodyType = 'multipart/form-data';
        bodyMultipart.length = 0;
        formPayloads.forEach(part => {
            const eqIdx = part.indexOf('=');
            if (eqIdx !== -1) {
                const key = part.slice(0, eqIdx).trim();
                const val = part.slice(eqIdx + 1).trim();
                if (val.startsWith('@')) {
                    bodyMultipart.push({ key, value: null, type: 'file', enabled: true });
                } else {
                    bodyMultipart.push({ key, value: val, type: 'text', enabled: true });
                }
            } else {
                bodyMultipart.push({ key: part, value: '', type: 'text', enabled: true });
            }
        });
        if (bodyMultipart.length === 0) {
            bodyMultipart.push({ key: '', value: '', type: 'text', enabled: true });
        }
    } else if (urlEncodedPayloads.length > 0) {
        bodyType = 'application/x-www-form-urlencoded';
        bodyUrlEncoded.length = 0;
        urlEncodedPayloads.forEach(part => {
            const eqIdx = part.indexOf('=');
            if (eqIdx !== -1) {
                const key = part.slice(0, eqIdx).trim();
                const value = part.slice(eqIdx + 1).trim();
                bodyUrlEncoded.push({ key, value, enabled: true });
            } else {
                bodyUrlEncoded.push({ key: part, value: '', enabled: true });
            }
        });
        if (bodyUrlEncoded.length === 0) {
            bodyUrlEncoded.push({ key: '', value: '', enabled: true });
        }
    } else if (dataPayloads.length > 0) {
        const combinedData = dataPayloads.join('\n');
        bodyText = combinedData;

        if (contentTypeHeader.includes('application/json')) {
            bodyType = 'application/json';
        } else if (contentTypeHeader.includes('application/x-www-form-urlencoded')) {
            bodyType = 'application/x-www-form-urlencoded';
            bodyUrlEncoded.length = 0;
            const searchParams = new URLSearchParams(combinedData);
            searchParams.forEach((value, key) => {
                bodyUrlEncoded.push({ key, value, enabled: true });
            });
            if (bodyUrlEncoded.length === 0) {
                bodyUrlEncoded.push({ key: '', value: '', enabled: true });
            }
        } else if (contentTypeHeader.includes('xml')) {
            bodyType = 'application/xml';
        } else if (contentTypeHeader.includes('text/plain')) {
            bodyType = 'text/plain';
        } else {
            // Fallback content-type detection based on data string syntax
            try {
                JSON.parse(combinedData);
                bodyType = 'application/json';
            } catch {
                bodyType = 'raw';
            }
        }
    }

    // Extract Auth setting if present in headersList or basicAuthUser
    let auth = {
        type: 'none',
        bearer: { token: '' },
        basic: { username: '', password: '' },
        apiKey: { key: '', value: '', addTo: 'header' }
    };

    if (basicAuthUser) {
        auth.type = 'basic';
        const colonIdx = basicAuthUser.indexOf(':');
        if (colonIdx !== -1) {
            auth.basic.username = basicAuthUser.slice(0, colonIdx);
            auth.basic.password = basicAuthUser.slice(colonIdx + 1);
        } else {
            auth.basic.username = basicAuthUser;
        }
    } else {
        const authHeaderIdx = headersList.findIndex(h => h.key.toLowerCase() === 'authorization');
        if (authHeaderIdx !== -1) {
            const authVal = headersList[authHeaderIdx].value;
            if (authVal.toLowerCase().startsWith('bearer ')) {
                auth.type = 'bearer';
                auth.bearer.token = authVal.slice(7).trim();
                headersList.splice(authHeaderIdx, 1);
            } else if (authVal.toLowerCase().startsWith('basic ')) {
                auth.type = 'basic';
                try {
                    const decoded = atob(authVal.slice(6).trim());
                    const colonIdx = decoded.indexOf(':');
                    if (colonIdx !== -1) {
                        auth.basic.username = decoded.slice(0, colonIdx);
                        auth.basic.password = decoded.slice(colonIdx + 1);
                    } else {
                        auth.basic.username = decoded;
                    }
                    headersList.splice(authHeaderIdx, 1);
                } catch {
                    /* ignore */
                }
            }
        }
    }

    // Infer HTTP method if not explicitly specified by -X / --request
    if (!method) {
        if (dataPayloads.length > 0 || formPayloads.length > 0 || urlEncodedPayloads.length > 0) {
            method = 'POST';
        } else {
            method = 'GET';
        }
    }

    // Extract Cookie header into importedCookies if present
    const importedCookies = [];
    const cookieHeaders = headersList.filter(h => h.key.toLowerCase() === 'cookie');
    for (const cookieHeader of cookieHeaders) {
        const cookieVal = cookieHeader.value;
        let hostname = '';
        try { hostname = new URL(cleanUrl).hostname; } catch {}
        for (const pair of cookieVal.split(';')) {
            const eqIdx = pair.indexOf('=');
            if (eqIdx !== -1) {
                const name = pair.substring(0, eqIdx).trim();
                const value = pair.substring(eqIdx + 1).trim();
                if (name) {
                    importedCookies.push({
                        name,
                        value,
                        domain: hostname || 'localhost',
                        path: '/',
                        createdAt: Date.now()
                    });
                }
            }
        }
    }

    return {
        description: '',
        method,
        url: cleanUrl,
        params: paramsList,
        headers: headersList,
        bodyType,
        bodyText,
        bodyUrlEncoded,
        bodyMultipart,
        auth,
        importedCookies
    };
}
