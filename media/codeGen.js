/**
 * Code Snippet Generator for REQ Studio
 */

export function buildFullUrl(baseUrl, params) {
    if (!baseUrl) return '';
    const activeParams = (params || [])
        .filter(p => p && p.enabled && p.key)
        .map(p => [p.key, p.value || '']);
    
    if (activeParams.length === 0) return baseUrl;
    
    const qs = new URLSearchParams(activeParams).toString();
    return baseUrl + (baseUrl.includes('?') ? '&' : '?') + qs;
}

export function stripJsonComments(jsoncText) {
    if (!jsoncText || typeof jsoncText !== 'string') return jsoncText;
    
    let insideString = false;
    let stringChar = '';
    let escaped = false;
    let result = '';

    for (let i = 0; i < jsoncText.length; i++) {
        const char = jsoncText[i];
        const nextChar = jsoncText[i + 1] || '';

        if (escaped) {
            result += char;
            escaped = false;
            continue;
        }

        if (char === '\\' && insideString) {
            result += char;
            escaped = true;
            continue;
        }

        if ((char === '"' || char === "'") && !insideString) {
            insideString = true;
            stringChar = char;
            result += char;
            continue;
        }

        if (char === stringChar && insideString) {
            insideString = false;
            stringChar = '';
            result += char;
            continue;
        }

        if (!insideString) {
            if (char === '/' && nextChar === '/') {
                while (i < jsoncText.length && jsoncText[i] !== '\n') {
                    i++;
                }
                continue;
            }
            if (char === '/' && nextChar === '*') {
                i += 2;
                while (i < jsoncText.length && !(jsoncText[i] === '*' && jsoncText[i + 1] === '/')) {
                    i++;
                }
                i++;
                continue;
            }
        }

        result += char;
    }

    return result.replace(/,\s*([}\]])/g, '$1');
}

export function buildHeaders(headers, bodyType) {
    const headerMap = {};
    (headers || []).forEach(h => {
        if (h && h.enabled && h.key) {
            headerMap[h.key] = h.value || '';
        }
    });

    // Auto-inject Content-Type if not set and bodyType requires it
    const hasContentType = Object.keys(headerMap).some(k => k.toLowerCase() === 'content-type');
    if (!hasContentType) {
        if (bodyType === 'application/json') {
            headerMap['Content-Type'] = 'application/json';
        } else if (bodyType === 'text/plain') {
            headerMap['Content-Type'] = 'text/plain';
        } else if (bodyType === 'application/x-www-form-urlencoded') {
            headerMap['Content-Type'] = 'application/x-www-form-urlencoded';
        } else if (bodyType === 'application/xml') {
            headerMap['Content-Type'] = 'application/xml';
        } else if (bodyType === 'multipart/form-data') {
            headerMap['Content-Type'] = 'multipart/form-data';
        }
    }

    return headerMap;
}

function getBodyContent(reqData) {
    const { bodyType, bodyText, bodyUrlEncoded, bodyMultipart } = reqData;
    
    if (!bodyType || bodyType === 'none') return null;

    if (['raw', 'text/plain', 'application/json', 'application/xml'].includes(bodyType)) {
        let content = bodyText || '';
        if (bodyType === 'application/json' || content.trim().startsWith('{') || content.trim().startsWith('[')) {
            content = stripJsonComments(content);
        }
        return content;
    }

    if (bodyType === 'application/x-www-form-urlencoded') {
        const active = (bodyUrlEncoded || []).filter(item => item && item.enabled && item.key);
        return new URLSearchParams(active.map(item => [item.key, item.value || ''])).toString();
    }

    if (bodyType === 'multipart/form-data') {
        const active = (bodyMultipart || []).filter(item => item && item.enabled && item.key);
        return active.map(item => `${item.key}=${item.value || ''}`).join('&');
    }

    return null;
}

export function generateCurl(reqData) {
    const method = (reqData.method || 'GET').toUpperCase();
    const fullUrl = buildFullUrl(reqData.url, reqData.params);
    const headers = buildHeaders(reqData.headers, reqData.bodyType);
    const body = getBodyContent(reqData);

    const parts = [`curl --location --request ${method} '${fullUrl}'`];

    Object.entries(headers).forEach(([key, val]) => {
        parts.push(`  --header '${key}: ${val.replace(/'/g, "\\'")}'`);
    });

    if (body && method !== 'GET' && method !== 'HEAD') {
        if (body.includes('\n')) {
            parts.push(`  --data '${body.replace(/'/g, "\\'")}'`);
        } else {
            parts.push(`  --data '${body.replace(/'/g, "\\'")}'`);
        }
    }

    return parts.join(' \\\n');
}

export function generateJsFetch(reqData) {
    const method = (reqData.method || 'GET').toUpperCase();
    const fullUrl = buildFullUrl(reqData.url, reqData.params);
    const headers = buildHeaders(reqData.headers, reqData.bodyType);
    const body = getBodyContent(reqData);

    let code = `const myHeaders = new Headers();\n`;
    Object.entries(headers).forEach(([key, val]) => {
        code += `myHeaders.append("${key}", "${val.replace(/"/g, '\\"')}");\n`;
    });

    let bodyDecl = '';
    if (body && method !== 'GET' && method !== 'HEAD') {
        if (reqData.bodyType === 'application/json') {
            try {
                const parsed = JSON.parse(body);
                bodyDecl = `\nconst raw = JSON.stringify(${JSON.stringify(parsed, null, 2)});\n`;
            } catch {
                bodyDecl = `\nconst raw = ${JSON.stringify(body)};\n`;
            }
        } else {
            bodyDecl = `\nconst raw = ${JSON.stringify(body)};\n`;
        }
    }

    code += bodyDecl;
    code += `\nconst requestOptions = {\n`;
    code += `  method: "${method}",\n`;
    code += `  headers: myHeaders,\n`;
    if (bodyDecl) {
        code += `  body: raw,\n`;
    }
    code += `  redirect: "follow"\n`;
    code += `};\n\n`;

    code += `fetch("${fullUrl}", requestOptions)\n`;
    code += `  .then((response) => response.text())\n`;
    code += `  .then((result) => console.log(result))\n`;
    code += `  .catch((error) => console.error(error));\n`;

    return code;
}

export function generateJsAxios(reqData) {
    const method = (reqData.method || 'GET').toLowerCase();
    const fullUrl = buildFullUrl(reqData.url, reqData.params);
    const headers = buildHeaders(reqData.headers, reqData.bodyType);
    const body = getBodyContent(reqData);

    let code = `const axios = require('axios');\n`;

    if (body && method !== 'get' && method !== 'head') {
        if (reqData.bodyType === 'application/json') {
            try {
                const parsed = JSON.parse(body);
                code += `let data = JSON.stringify(${JSON.stringify(parsed, null, 2)});\n\n`;
            } catch {
                code += `let data = ${JSON.stringify(body)};\n\n`;
            }
        } else {
            code += `let data = ${JSON.stringify(body)};\n\n`;
        }
    } else {
        code += `let data = '';\n\n`;
    }

    code += `let config = {\n`;
    code += `  method: '${method}',\n`;
    code += `  maxBodyLength: Infinity,\n`;
    code += `  url: '${fullUrl}',\n`;
    code += `  headers: {\n`;
    const headerEntries = Object.entries(headers);
    headerEntries.forEach(([key, val], idx) => {
        const comma = idx < headerEntries.length - 1 ? ',' : '';
        code += `    '${key}': '${val.replace(/'/g, "\\'")}'${comma}\n`;
    });
    code += `  }`;
    if (body && method !== 'get' && method !== 'head') {
        code += `,\n  data : data\n`;
    } else {
        code += `\n`;
    }
    code += `};\n\n`;

    code += `axios.request(config)\n`;
    code += `.then((response) => {\n`;
    code += `  console.log(JSON.stringify(response.data));\n`;
    code += `})\n`;
    code += `.catch((error) => {\n`;
    code += `  console.log(error);\n`;
    code += `});\n`;

    return code;
}

export function generatePythonRequests(reqData) {
    const method = (reqData.method || 'GET').toUpperCase();
    const fullUrl = buildFullUrl(reqData.url, reqData.params);
    const headers = buildHeaders(reqData.headers, reqData.bodyType);
    const body = getBodyContent(reqData);

    let code = `import requests\n`;
    if (reqData.bodyType === 'application/json' && body) {
        code += `import json\n`;
    }
    code += `\nurl = "${fullUrl}"\n\n`;

    if (body && method !== 'GET' && method !== 'HEAD') {
        if (reqData.bodyType === 'application/json') {
            try {
                const parsed = JSON.parse(body);
                code += `payload = json.dumps(${JSON.stringify(parsed, null, 4)})\n`;
            } catch {
                code += `payload = ${JSON.stringify(body)}\n`;
            }
        } else {
            code += `payload = ${JSON.stringify(body)}\n`;
        }
    } else {
        code += `payload = {}\n`;
    }

    code += `headers = {\n`;
    const headerEntries = Object.entries(headers);
    headerEntries.forEach(([key, val], idx) => {
        const comma = idx < headerEntries.length - 1 ? ',' : '';
        code += `  '${key}': '${val.replace(/'/g, "\\'")}'${comma}\n`;
    });
    code += `}\n\n`;

    if (body && method !== 'GET' && method !== 'HEAD') {
        code += `response = requests.request("${method}", url, headers=headers, data=payload)\n\n`;
    } else {
        code += `response = requests.request("${method}", url, headers=headers)\n\n`;
    }
    code += `print(response.text)\n`;

    return code;
}

export function generateGo(reqData) {
    const method = (reqData.method || 'GET').toUpperCase();
    const fullUrl = buildFullUrl(reqData.url, reqData.params);
    const headers = buildHeaders(reqData.headers, reqData.bodyType);
    const body = getBodyContent(reqData);

    let code = `package main\n\n`;
    code += `import (\n`;
    code += `  "fmt"\n`;
    if (body && method !== 'GET' && method !== 'HEAD') {
        code += `  "strings"\n`;
    }
    code += `  "net/http"\n`;
    code += `  "io"\n`;
    code += `)\n\n`;

    code += `func main() {\n\n`;
    code += `  url := "${fullUrl}"\n`;
    code += `  method := "${method}"\n\n`;

    if (body && method !== 'GET' && method !== 'HEAD') {
        code += `  payload := strings.NewReader(\`${body.replace(/`/g, '` + "`" + `')}\`)\n\n`;
        code += `  client := &http.Client {}\n`;
        code += `  req, err := http.NewRequest(method, url, payload)\n\n`;
    } else {
        code += `  client := &http.Client {}\n`;
        code += `  req, err := http.NewRequest(method, url, nil)\n\n`;
    }

    code += `  if err != nil {\n    fmt.Println(err)\n    return\n  }\n`;

    Object.entries(headers).forEach(([key, val]) => {
        code += `  req.Header.Add("${key}", "${val.replace(/"/g, '\\"')}")\n`;
    });

    code += `\n  res, err := client.Do(req)\n`;
    code += `  if err != nil {\n    fmt.Println(err)\n    return\n  }\n`;
    code += `  defer res.Body.Close()\n\n`;
    code += `  body, err := io.ReadAll(res.Body)\n`;
    code += `  if err != nil {\n    fmt.Println(err)\n    return\n  }\n`;
    code += `  fmt.Println(string(body))\n`;
    code += `}\n`;

    return code;
}

export function generateJava(reqData) {
    const method = (reqData.method || 'GET').toUpperCase();
    const fullUrl = buildFullUrl(reqData.url, reqData.params);
    const headers = buildHeaders(reqData.headers, reqData.bodyType);
    const body = getBodyContent(reqData);

    let code = `import java.net.URI;\n`;
    code += `import java.net.http.HttpClient;\n`;
    code += `import java.net.http.HttpRequest;\n`;
    code += `import java.net.http.HttpResponse;\n\n`;
    code += `public class Main {\n`;
    code += `    public static void main(String[] args) throws Exception {\n`;
    code += `        HttpClient client = HttpClient.newHttpClient();\n`;
    code += `        HttpRequest request = HttpRequest.newBuilder()\n`;
    code += `            .uri(URI.create("${fullUrl}"))\n`;

    Object.entries(headers).forEach(([key, val]) => {
        code += `            .header("${key}", "${val.replace(/"/g, '\\"')}")\n`;
    });

    if (body && method !== 'GET' && method !== 'HEAD') {
        const escapedBody = JSON.stringify(body);
        code += `            .method("${method}", HttpRequest.BodyPublishers.ofString(${escapedBody}))\n`;
    } else {
        code += `            .method("${method}", HttpRequest.BodyPublishers.noBody())\n`;
    }

    code += `            .build();\n\n`;
    code += `        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());\n`;
    code += `        System.out.println(response.body());\n`;
    code += `    }\n`;
    code += `}\n`;

    return code;
}

export function substituteEnvVars(text, env) {
    if (!text || !env) return text;
    return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        const trimmed = key.trim();
        return env[trimmed] !== undefined ? env[trimmed] : match;
    });
}

function applyEnvToReqData(reqData, env) {
    if (!env || Object.keys(env).length === 0) return reqData;

    const sub = (val) => (typeof val === 'string' ? substituteEnvVars(val, env) : val);

    return {
        ...reqData,
        url: sub(reqData.url),
        params: (reqData.params || []).map(p => ({
            ...p,
            key: sub(p.key),
            value: sub(p.value)
        })),
        headers: (reqData.headers || []).map(h => ({
            ...h,
            key: sub(h.key),
            value: sub(h.value)
        })),
        bodyText: sub(reqData.bodyText),
        bodyUrlEncoded: (reqData.bodyUrlEncoded || []).map(item => ({
            ...item,
            key: sub(item.key),
            value: sub(item.value)
        })),
        bodyMultipart: (reqData.bodyMultipart || []).map(item => ({
            ...item,
            key: sub(item.key),
            value: item.type === 'text' ? sub(item.value) : item.value
        }))
    };
}

function processAuthForReqData(rawReqData) {
    if (!rawReqData || !rawReqData.auth || rawReqData.auth.type === 'none') {
        return rawReqData;
    }

    const { type, bearer, basic, apiKey } = rawReqData.auth;
    const reqData = {
        ...rawReqData,
        headers: [...(rawReqData.headers || [])],
        params: [...(rawReqData.params || [])]
    };

    if (type === 'bearer' && bearer?.token) {
        reqData.headers.push({ key: 'Authorization', value: `Bearer ${bearer.token}`, enabled: true });
    } else if (type === 'basic' && (basic?.username || basic?.password)) {
        const u = basic?.username || '';
        const p = basic?.password || '';
        try {
            const b64 = typeof btoa === 'function' ? btoa(`${u}:${p}`) : Buffer.from(`${u}:${p}`).toString('base64');
            reqData.headers.push({ key: 'Authorization', value: `Basic ${b64}`, enabled: true });
        } catch {
            /* ignore */
        }
    } else if (type === 'apiKey' && apiKey?.key && apiKey?.value) {
        if (apiKey.addTo === 'query') {
            reqData.params.push({ key: apiKey.key, value: apiKey.value, enabled: true });
        } else {
            reqData.headers.push({ key: apiKey.key, value: apiKey.value, enabled: true });
        }
    }

    return reqData;
}

export function generateCode(rawReqData, target, env = {}) {
    const withAuth = processAuthForReqData(rawReqData);
    const reqData = applyEnvToReqData(withAuth, env);
    switch (target) {
        case 'curl': return generateCurl(reqData);
        case 'js-fetch': return generateJsFetch(reqData);
        case 'js-axios': return generateJsAxios(reqData);
        case 'python-requests': return generatePythonRequests(reqData);
        case 'go': return generateGo(reqData);
        case 'java': return generateJava(reqData);
        default: return generateCurl(reqData);
    }
}
