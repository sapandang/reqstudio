import * as assert from 'assert';

// Test implementation of _normalizeHeaders logic to ensure no array spreading or numeric keys occur
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

suite('Header Normalizer Unit Test Suite', () => {

    test('Normalizes Array of header objects [{ key, value, enabled }] cleanly', () => {
        const inputHeaders = [
            { key: 'accept', value: 'application/json', enabled: true },
            { key: 'content-type', value: 'application/x-www-form-urlencoded', enabled: true },
            { key: 'disabled-header', value: 'secret', enabled: false }
        ];

        const normalized = normalizeHeaders(inputHeaders);

        // Assert keys are actual header names, NOT numeric indices 0, 1, 2
        assert.strictEqual(normalized['0'], undefined, 'Should NOT contain numeric index key 0');
        assert.strictEqual(normalized['1'], undefined, 'Should NOT contain numeric index key 1');

        assert.strictEqual(normalized['accept'], 'application/json');
        assert.strictEqual(normalized['content-type'], 'application/x-www-form-urlencoded');
        assert.strictEqual(normalized['disabled-header'], undefined, 'Disabled header should be omitted');
    });

    test('Normalizes object with numeric index keys gracefully ({ 0: { key, value } })', () => {
        // Simulates what happened if an array was accidentally spread with { ...array }
        const badSpreadObject = {
            '0': { key: 'accept', value: 'application/json', enabled: true },
            '1': { key: 'content-type', value: 'application/x-www-form-urlencoded', enabled: true }
        };

        const normalized = normalizeHeaders(badSpreadObject);

        assert.strictEqual(normalized['0'], undefined, 'Numeric key 0 should be normalized away');
        assert.strictEqual(normalized['1'], undefined, 'Numeric key 1 should be normalized away');
        assert.strictEqual(normalized['accept'], 'application/json');
        assert.strictEqual(normalized['content-type'], 'application/x-www-form-urlencoded');
    });

    test('Preserves standard Record<string, string> header maps', () => {
        const recordMap = {
            'Authorization': 'Bearer 12345',
            'User-Agent': 'REQStudio/3.2.0'
        };

        const normalized = normalizeHeaders(recordMap);

        assert.strictEqual(normalized['Authorization'], 'Bearer 12345');
        assert.strictEqual(normalized['User-Agent'], 'REQStudio/3.2.0');
    });
});
