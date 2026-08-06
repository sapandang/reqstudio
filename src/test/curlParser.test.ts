import * as assert from 'assert';
import { parseCurl, tokenizeCurl } from '../../media/curlParser.js';

suite('cURL Parser Unit Test Suite', () => {

    test('Parses -b and --cookie flags into headers and importedCookies', () => {
        const cmd = `curl --url 'https://api.example.com/login' \\
          -H 'content-type: application/x-www-form-urlencoded' \\
          -b '_ga=GA1.1.123; XSRF-TOKEN=8a2bb17c-be2d-4d5e-9249-491f942db359' \\
          --data-raw 'j_username=admin&j_password=12345'`;

        const parsed = parseCurl(cmd);

        assert.strictEqual(parsed.method, 'POST');
        assert.strictEqual(parsed.url, 'https://api.example.com/login');
        assert.strictEqual(parsed.bodyType, 'application/x-www-form-urlencoded');

        // Check Cookie header present in headers array
        const cookieHeader = parsed.headers.find((h: any) => h.key.toLowerCase() === 'cookie');
        assert.ok(cookieHeader, 'Cookie header should be present in headers list');
        assert.ok(cookieHeader.value.includes('XSRF-TOKEN=8a2bb17c-be2d-4d5e-9249-491f942db359'));

        // Check importedCookies array
        assert.ok(parsed.importedCookies.length >= 2, 'Should extract cookies into importedCookies');
        const xsrfCookie = parsed.importedCookies.find((c: any) => c.name === 'XSRF-TOKEN');
        assert.ok(xsrfCookie, 'XSRF-TOKEN cookie should be in importedCookies');
        assert.strictEqual(xsrfCookie.value, '8a2bb17c-be2d-4d5e-9249-491f942db359');
        assert.strictEqual(xsrfCookie.domain, 'api.example.com');
    });

    test('Parses --data-raw form-encoded payloads into bodyUrlEncoded array', () => {
        const cmd = `curl -X POST 'https://api.example.com/login' \\
          -H 'content-type: application/x-www-form-urlencoded' \\
          --data-raw 'username=admin&password=secret%20123&remember=true'`;

        const parsed = parseCurl(cmd);

        assert.strictEqual(parsed.method, 'POST');
        assert.strictEqual(parsed.bodyType, 'application/x-www-form-urlencoded');
        assert.strictEqual(parsed.bodyUrlEncoded.length, 3);
        assert.strictEqual(parsed.bodyUrlEncoded[0].key, 'username');
        assert.strictEqual(parsed.bodyUrlEncoded[0].value, 'admin');
        assert.strictEqual(parsed.bodyUrlEncoded[1].key, 'password');
        assert.strictEqual(parsed.bodyUrlEncoded[1].value, 'secret 123');
    });

    test('Parses -F / --form multipart fields', () => {
        const cmd = `curl -X POST 'https://api.example.com/upload' \\
          -F 'title=Profile Avatar' \\
          -F 'avatar=@/path/to/image.png'`;

        const parsed = parseCurl(cmd);

        assert.strictEqual(parsed.method, 'POST');
        assert.strictEqual(parsed.bodyType, 'multipart/form-data');
        assert.strictEqual(parsed.bodyMultipart.length, 2);

        const titlePart = parsed.bodyMultipart.find((p: any) => p.key === 'title');
        assert.ok(titlePart);
        assert.strictEqual(titlePart.type, 'text');
        assert.strictEqual(titlePart.value, 'Profile Avatar');

        const filePart = parsed.bodyMultipart.find((p: any) => p.key === 'avatar');
        assert.ok(filePart);
        assert.strictEqual(filePart.type, 'file');
        assert.strictEqual(filePart.value, null); // Files have null value in disk schema
    });

    test('Parses complex headers with quotes, spaces, and semicolons', () => {
        const cmd = `curl --url 'https://example.com' \\
          -H 'sec-ch-ua: "Not=A?Brand";v="99", "Google Chrome";v="151"' \\
          -H 'user-agent: Mozilla/5.0 (X11; Linux x86_64)'`;

        const parsed = parseCurl(cmd);

        const secHeader = parsed.headers.find((h: any) => h.key === 'sec-ch-ua');
        assert.ok(secHeader);
        assert.strictEqual(secHeader.value, '"Not=A?Brand";v="99", "Google Chrome";v="151"');
    });

    test('Parses Basic Auth -u flag', () => {
        const cmd = `curl -u 'admin:pass123' 'https://example.com/api'`;

        const parsed = parseCurl(cmd);

        assert.strictEqual(parsed.auth.type, 'basic');
        assert.strictEqual(parsed.auth.basic.username, 'admin');
        assert.strictEqual(parsed.auth.basic.password, 'pass123');
    });
});
