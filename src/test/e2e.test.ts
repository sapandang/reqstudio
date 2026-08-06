import * as assert from 'assert';
import * as http from 'http';
import fetch from 'node-fetch';

function normalizeHeaders(headers: any): Record<string, string> {
    const normalized: Record<string, string> = {};
    if (!headers) return normalized;

    if (Array.isArray(headers)) {
        for (const h of headers) {
            if (h && typeof h === 'object' && h.key && h.enabled !== false) {
                normalized[String(h.key)] = String(h.value ?? '');
            }
        }
    } else if (typeof headers === 'object') {
        for (const [k, v] of Object.entries(headers)) {
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                normalized[k] = String(v);
            } else if (v && typeof v === 'object') {
                const hObj = v as any;
                if (hObj.key && hObj.enabled !== false) {
                    normalized[String(hObj.key)] = String(hObj.value ?? '');
                }
            }
        }
    }
    return normalized;
}

suite('End-to-End HTTP Wire Test Suite', function () {
    this.timeout(10000);

    let server: http.Server | null = null;
    const SERVER_URL = 'http://localhost:3456/api/echo';

    suiteSetup((done) => {
        server = http.createServer((req, res) => {
            let bodyStr = '';
            req.on('data', chunk => { bodyStr += chunk; });
            req.on('end', () => {
                const queryParams: Record<string, string> = {};
                if (req.url && req.url.includes('?')) {
                    const search = new URLSearchParams(req.url.split('?')[1]);
                    search.forEach((v, k) => { queryParams[k] = v; });
                }

                const bodyParams: Record<string, string> = {};
                if (bodyStr) {
                    const search = new URLSearchParams(bodyStr);
                    search.forEach((v, k) => { bodyParams[k] = v; });
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    method: req.method,
                    headers: req.headers,
                    body: bodyParams,
                    query: queryParams,
                    cookies: req.headers.cookie || ''
                }));
            });
        });

        server.listen(3456, () => done());
    });

    suiteTeardown((done) => {
        if (server) {
            server.close(() => done());
        } else {
            done();
        }
    });

    test('Transmits form-encoded POST requests with clean headers and parsed body to server', async () => {
        const inputHeaders = [
            { key: 'accept', value: 'application/json', enabled: true },
            { key: 'content-type', value: 'application/x-www-form-urlencoded', enabled: true },
            { key: 'Cookie', value: 'XSRF-TOKEN=test_token_123', enabled: true },
            { key: 'User-Agent', value: 'REQStudio-E2E-Tester', enabled: true }
        ];

        const cleanHeaders = normalizeHeaders(inputHeaders);

        const urlParams = new URLSearchParams();
        urlParams.append('j_username', 'admin');
        urlParams.append('j_password', '0b57a33fb88006eac0c3e0ea3b5e15c43aeb3620b8b88b8401d2e796b42ca138');
        urlParams.append('remember-me', 'false');
        urlParams.append('submit', 'Login');

        const body = urlParams.toString();

        const res = await fetch(SERVER_URL, {
            method: 'POST',
            headers: cleanHeaders,
            body
        });

        assert.strictEqual(res.status, 200);

        const data: any = await res.json();

        // 1. Verify headers received on server have no 0, 1, 2 [object Object] keys
        assert.strictEqual(data.headers['0'], undefined, 'Server should NOT receive header "0"');
        assert.strictEqual(data.headers['1'], undefined, 'Server should NOT receive header "1"');
        assert.strictEqual(data.headers['content-type'], 'application/x-www-form-urlencoded');
        assert.strictEqual(data.headers['user-agent'], 'REQStudio-E2E-Tester');
        assert.strictEqual(data.cookies, 'XSRF-TOKEN=test_token_123');

        // 2. Verify body fields were correctly parsed by server Express body parser
        assert.ok(data.body, 'Server should parse body');
        assert.strictEqual(data.body.j_username, 'admin');
        assert.strictEqual(data.body.j_password, '0b57a33fb88006eac0c3e0ea3b5e15c43aeb3620b8b88b8401d2e796b42ca138');
        assert.strictEqual(data.body['remember-me'], 'false');
        assert.strictEqual(data.body.submit, 'Login');
    });
});
