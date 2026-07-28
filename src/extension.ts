import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import FormData from 'form-data';
import fetch, { Response } from 'node-fetch';

// ReqDocument Class (No changes)
class ReqDocument implements vscode.CustomDocument {
    public readonly uri: vscode.Uri;
    private _documentData: any;

    constructor(uri: vscode.Uri, initialContent: Uint8Array) {
        this.uri = uri;
        const fileContent = Buffer.from(initialContent).toString('utf8');
        try {
            this._documentData = fileContent ? JSON.parse(fileContent) : {};
        } catch (e) {
            console.error(`[REQ-STUDIO] Error parsing JSON for ${uri.fsPath}`, e);
            this._documentData = { error: 'Invalid JSON content in the source file.' };
        }
    }

    public get documentData(): any { return this._documentData; }
    public update(newData: any): void { this._documentData = newData; }
    dispose(): void { }
}

// The Custom Editor Provider
class ReqCustomEditorProvider implements vscode.CustomEditorProvider<ReqDocument> {

    private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<ReqDocument>>();
    public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

    private readonly _activeControllers = new Map<vscode.WebviewPanel, AbortController>();
    private readonly _requestGenerations = new Map<vscode.WebviewPanel, number>();
    private readonly _panelEnvs = new Map<vscode.WebviewPanel, string>();

    constructor(private readonly context: vscode.ExtensionContext) { }

    private _cancelPendingRequest(panel: vscode.WebviewPanel): void {
        const controller = this._activeControllers.get(panel);
        if (controller) {
            controller.abort();
            this._activeControllers.delete(panel);
        }
    }

    private _nextGeneration(panel: vscode.WebviewPanel): number {
        const next = (this._requestGenerations.get(panel) || 0) + 1;
        this._requestGenerations.set(panel, next);
        return next;
    }

    private _isStale(panel: vscode.WebviewPanel, generation: number): boolean {
        return (this._requestGenerations.get(panel) || 0) !== generation;
    }

    private async _scanEnvFiles(reqUri: vscode.Uri): Promise<{ name: string; file: string }[]> {
        const envMap = new Map<string, { name: string; file: string }>();
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(reqUri);
        const rootDir = workspaceFolder ? workspaceFolder.uri.fsPath : undefined;
        const reqDir = path.dirname(reqUri.fsPath);

        const scanDir = async (dirPath: string) => {
            try {
                const files = await fs.promises.readdir(dirPath);
                for (const file of files) {
                    if (file.endsWith('.reqenv')) {
                        const name = file === '.reqenv' ? 'default' : file.replace(/\.reqenv$/, '');
                        envMap.set(name, { name, file: path.join(dirPath, file) });
                    }
                }
            } catch {
                /* ignore read errors */
            }
        };

        if (rootDir && rootDir !== reqDir) {
            await scanDir(rootDir);
        }
        await scanDir(reqDir);

        return Array.from(envMap.values());
    }

    // --- Cookie Jar Workspace Persistence & Helpers ---
    private _getCookieJarStore(): { activeJar: string; jars: Record<string, any[]> } {
        const store = this.context.workspaceState.get<{ activeJar: string; jars: Record<string, any[]> }>('reqstudio.cookieJars');
        if (!store || !store.jars) {
            return {
                activeJar: 'Default Jar',
                jars: { 'Default Jar': [] }
            };
        }
        return store;
    }

    private async _saveCookieJarStore(store: { activeJar: string; jars: Record<string, any[]> }): Promise<void> {
        await this.context.workspaceState.update('reqstudio.cookieJars', store);
    }

    private _parseSetCookie(setCookieStr: string, defaultDomain: string): any {
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
        let expires: string | null = null;
        let maxAge: number | null = null;
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

        return { name, value, domain: domain.toLowerCase(), path, expires, maxAge, httpOnly, secure, createdAt: Date.now() };
    }

    private _matchDomain(cookieDomain: string, targetHostname: string): boolean {
        if (!cookieDomain || !targetHostname) return true;
        const cd = cookieDomain.toLowerCase();
        const th = targetHostname.toLowerCase();
        return cd === th || th.endsWith('.' + cd);
    }

    private _getCookiesForUrl(jarName: string, requestUrl: string): string {
        if (!jarName || jarName === 'none') return '';
        const store = this._getCookieJarStore();
        const jar = store.jars[jarName] || [];
        if (jar.length === 0) return '';

        let hostname = '';
        try {
            hostname = new URL(requestUrl).hostname;
        } catch {
            return '';
        }

        const matching = jar.filter(c => this._matchDomain(c.domain, hostname));
        if (matching.length === 0) return '';

        return matching.map(c => `${c.name}=${c.value}`).join('; ');
    }

    private _mergeCookieHeader(explicitCookieHeader: string, jarCookieHeader: string): string {
        const map = new Map<string, string>();

        if (jarCookieHeader) {
            for (const pair of jarCookieHeader.split(';')) {
                const eqIdx = pair.indexOf('=');
                if (eqIdx !== -1) {
                    map.set(pair.substring(0, eqIdx).trim(), pair.substring(eqIdx + 1).trim());
                }
            }
        }

        if (explicitCookieHeader) {
            for (const pair of explicitCookieHeader.split(';')) {
                const eqIdx = pair.indexOf('=');
                if (eqIdx !== -1) {
                    map.set(pair.substring(0, eqIdx).trim(), pair.substring(eqIdx + 1).trim());
                }
            }
        }

        const merged: string[] = [];
        for (const [k, v] of map.entries()) {
            merged.push(`${k}=${v}`);
        }
        return merged.join('; ');
    }

    private _substituteEnvVars(text: string, env: Record<string, string>): string {
        if (!text) { return text; }
        return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => env[key.trim()] ?? match);
    }

    private _parseEnvContent(content: string): Record<string, string> {
        // Try JSON first
        try {
            return JSON.parse(content);
        } catch {
            /* ignore, fall through to dotenv parsing */
        }

        const env: Record<string, string> = {};
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) { continue; }
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) { continue; }
            const key = trimmed.slice(0, eqIdx).trim();
            const value = trimmed.slice(eqIdx + 1).trim();
            if (key) { env[key] = value; }
        }
        return env;
    }

    private async _readEnvFile(filePath: string): Promise<Record<string, string>> {
        if (!filePath) { return {}; }
        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            return this._parseEnvContent(content);
        } catch {
            return {};
        }
    }

    private _stripJsonComments(jsoncText: string): string {
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

    private async _applyEnvToMessage(message: any): Promise<void> {
        const envFile = message.envFile as string | undefined;
        if (!envFile) { return; }

        let env: Record<string, string> = {};
        try {
            const content = await fs.promises.readFile(envFile, 'utf8');
            env = this._parseEnvContent(content);
        } catch {
            return;
        }

        const sub = (text: any) => typeof text === 'string' ? this._substituteEnvVars(text, env) : text;

        // 1. Substitute URL
        if (message.url) {
            message.url = sub(message.url);
        }

        // 2. Substitute Query Params Array
        if (Array.isArray(message.params)) {
            for (const p of message.params) {
                if (p) {
                    p.key = sub(p.key);
                    p.value = sub(p.value);
                }
            }
        }

        // 3. Substitute Headers Array or Object
        const processedHeaders: Record<string, string> = {};
        if (Array.isArray(message.headers)) {
            for (const h of message.headers) {
                if (h && h.enabled && h.key) {
                    processedHeaders[sub(h.key)] = sub(h.value ?? '');
                }
            }
        } else if (message.headers && typeof message.headers === 'object') {
            for (const [hKey, hVal] of Object.entries(message.headers)) {
                processedHeaders[sub(hKey)] = sub(hVal as string);
            }
        }

        // 4. Substitute Auth Credentials & Inject Headers/Query
        if (message.auth) {
            const authType = message.auth.type;
            if (authType === 'bearer' && message.auth.bearer?.token) {
                const token = sub(message.auth.bearer.token);
                processedHeaders['Authorization'] = `Bearer ${token}`;
            } else if (authType === 'basic' && (message.auth.basic?.username || message.auth.basic?.password)) {
                const username = sub(message.auth.basic.username || '');
                const password = sub(message.auth.basic.password || '');
                try {
                    const b64 = Buffer.from(`${username}:${password}`).toString('base64');
                    processedHeaders['Authorization'] = `Basic ${b64}`;
                } catch {}
            } else if (authType === 'apiKey' && message.auth.apiKey?.key && message.auth.apiKey?.value) {
                const key = sub(message.auth.apiKey.key);
                const val = sub(message.auth.apiKey.value);
                if (message.auth.apiKey.addTo === 'query') {
                    if (!Array.isArray(message.params)) message.params = [];
                    message.params.push({ key, value: val, enabled: true });
                } else {
                    processedHeaders[key] = val;
                }
            }
        }

        message.headers = processedHeaders;

        // 5. Append Query Params to URL
        if (Array.isArray(message.params)) {
            const activeParams = message.params
                .filter((p: any) => p && p.enabled && p.key)
                .map((p: any) => [sub(p.key), sub(p.value)]);
            if (activeParams.length > 0) {
                const qs = new URLSearchParams(activeParams).toString();
                message.url += (message.url.includes('?') ? '&' : '?') + qs;
            }
        }

        // 6. Substitute Body Payloads
        const bodyType = message.bodyType || 'none';
        if (['raw', 'text/plain', 'application/json', 'application/xml'].includes(bodyType)) {
            if (typeof message.bodyText === 'string') {
                message.bodyText = sub(message.bodyText);
            }
            const hasContentType = Object.keys(processedHeaders).some(h => h.toLowerCase() === 'content-type');
            if (!hasContentType && bodyType !== 'raw') {
                processedHeaders['Content-Type'] = bodyType;
            }
        } else if (bodyType === 'application/x-www-form-urlencoded' && Array.isArray(message.bodyUrlEncoded)) {
            for (const item of message.bodyUrlEncoded) {
                if (item) {
                    item.key = sub(item.key);
                    item.value = sub(item.value);
                }
            }
            const hasContentType = Object.keys(processedHeaders).some(h => h.toLowerCase() === 'content-type');
            if (!hasContentType) {
                processedHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
            }
        } else if (bodyType === 'multipart/form-data' && Array.isArray(message.bodyMultipart)) {
            for (const part of message.bodyMultipart) {
                if (part) {
                    part.key = sub(part.key);
                    if (part.type === 'text' && typeof part.value === 'string') {
                        part.value = sub(part.value);
                    }
                }
            }
        }
    }
    
    // saveCustomDocumentAs, revertCustomDocument, backupCustomDocument, openCustomDocument (No changes)
    async saveCustomDocumentAs(document: ReqDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
        const content = JSON.stringify(document.documentData, null, 2);
        await fs.promises.writeFile(destination.fsPath, content, 'utf8');
    }
    async revertCustomDocument(document: ReqDocument, cancellation: vscode.CancellationToken): Promise<void> {
        const fileContent = await fs.promises.readFile(document.uri.fsPath);
        document.update(JSON.parse(fileContent.toString('utf8')));
    }
    async backupCustomDocument(document: ReqDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Promise<{ id: string; delete: () => void; }> {
        const content = JSON.stringify(document.documentData, null, 2);
        await fs.promises.writeFile(context.destination.fsPath, content, 'utf8');
        return {
            id: context.destination.fsPath,
            delete: async () => { try { await fs.promises.unlink(context.destination.fsPath); } catch { /* ignore */ } }
        };
    }
    async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): Promise<ReqDocument> {
        const fileContent = openContext.backupId ? await fs.promises.readFile(openContext.backupId) : await fs.promises.readFile(uri.fsPath);
        return new ReqDocument(uri, fileContent);
    }

    // prepareBodyAndHeaders (No changes)
    private async prepareBodyAndHeaders(message: any) {
        const { headers, bodyType, bodyText, bodyUrlEncoded, bodyMultipart, bodyBinaryFile } = message;
        let processedBody: any = undefined;
        let finalHeaders: any = { ...headers };

        if (bodyType === 'application/x-www-form-urlencoded' && Array.isArray(bodyUrlEncoded)) {
            const urlParams = new URLSearchParams();
            for (const item of bodyUrlEncoded) {
                if (item && item.enabled && item.key) {
                    urlParams.append(item.key, item.value || '');
                }
            }
            processedBody = urlParams.toString();
        } else if (bodyType === 'multipart/form-data' && Array.isArray(bodyMultipart)) {
            const form = new FormData();
            for (const part of bodyMultipart) {
                if (part && part.enabled && part.key) {
                    if (part.type === 'file' && part.value?.base64content) {
                        const buffer = Buffer.from(part.value.base64content, 'base64');
                        form.append(part.key, buffer, { filename: part.value.name });
                    } else if (part.type === 'text') {
                        form.append(part.key, part.value || '');
                    }
                }
            }
            const cleanedHeaders: Record<string, string> = {};
            for (const [k, v] of Object.entries(headers ?? {})) {
                if (k.toLowerCase() !== 'content-type') {
                    cleanedHeaders[k] = v as string;
                }
            }
            finalHeaders = { ...cleanedHeaders, ...form.getHeaders() };
            processedBody = await form.getBuffer();
        } else if (bodyType === 'application/octet-stream' && bodyBinaryFile?.base64content) {
            processedBody = Buffer.from(bodyBinaryFile.base64content, 'base64');
        } else if (['raw', 'text/plain', 'application/json', 'application/xml'].includes(bodyType)) {
            let payload = bodyText || '';
            if (bodyType === 'application/json' || payload.trim().startsWith('{') || payload.trim().startsWith('[')) {
                payload = this._stripJsonComments(payload);
            }
            processedBody = payload;
        }

        return { body: processedBody, headers: finalHeaders };
    }


    async resolveCustomEditor(
        document: ReqDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media', 'dist')]
        };

        const distDir = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'dist');
        const indexHtmlUri = vscode.Uri.joinPath(distDir, 'index.html');
        let html = await fs.promises.readFile(indexHtmlUri.fsPath, 'utf8');

        html = html.replace(/(src|href)="\.\/(.*?)"/g, (_, attr, path) => `${attr}="${webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(distDir, path)).toString()}"`);
        html = html.replace(/(src|href)="\/(.*?)"/g, (_, attr, path) => `${attr}="${webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(distDir, path)).toString()}"`);
        webviewPanel.webview.html = html;

        webviewPanel.webview.postMessage({ command: 'load-request', data: document.documentData });

        const envList = await this._scanEnvFiles(document.uri);
        const defaultEnv = envList.find(e => e.name === 'default');
        const defaultFile = defaultEnv?.file || '';
        let envData: Record<string, string> = {};
        if (defaultFile) {
            this._panelEnvs.set(webviewPanel, defaultFile);
            envData = await this._readEnvFile(defaultFile);
        }
        webviewPanel.webview.postMessage({ command: 'load-environments', environments: envList, defaultFile, envData });

        // Load Cookie Jars
        const cookieStore = this._getCookieJarStore();
        webviewPanel.webview.postMessage({ command: 'cookie-jars-updated', store: cookieStore });

        webviewPanel.onDidDispose(() => {
            this._cancelPendingRequest(webviewPanel);
            this._requestGenerations.delete(webviewPanel);
            this._panelEnvs.delete(webviewPanel);
        });

        webviewPanel.webview.onDidReceiveMessage(async (message) => {
            console.log('[REQ-STUDIO] Received message:', message);
            if (message.command === 'send-request') {
                const { method, url } = message;

                const generation = this._nextGeneration(webviewPanel);
                this._cancelPendingRequest(webviewPanel);

                await this._applyEnvToMessage(message);

                const controller = new AbortController();
                this._activeControllers.set(webviewPanel, controller);

                const timeoutMs = vscode.workspace.getConfiguration('reqstudio').get<number>('requestTimeout', 30000);
                let timedOut = false;
                const timeoutId = setTimeout(() => {
                    timedOut = true;
                    controller.abort();
                }, timeoutMs);

                try {
                    const { body: processedBody, headers: finalHeaders } = await this.prepareBodyAndHeaders(message);

                    // Inject & Deduplicate Cookies from Selected Cookie Jar (Explicit Request Headers Win)
                    const jarName = message.cookieJarName || 'Default Jar';
                    if (jarName !== 'none') {
                        const jarCookieHeader = this._getCookiesForUrl(jarName, message.url);
                        const existingCookieKey = Object.keys(finalHeaders).find(k => k.toLowerCase() === 'cookie');
                        const explicitCookieHeader = existingCookieKey ? finalHeaders[existingCookieKey] : '';
                        
                        const mergedCookieHeader = this._mergeCookieHeader(explicitCookieHeader, jarCookieHeader);
                        if (mergedCookieHeader) {
                            if (existingCookieKey) {
                                finalHeaders[existingCookieKey] = mergedCookieHeader;
                            } else {
                                finalHeaders['Cookie'] = mergedCookieHeader;
                            }
                        }
                    }

                    const rejectUnauthorized = message.rejectUnauthorized !== false;
                    const agent = message.url.startsWith('https:') ? new https.Agent({ rejectUnauthorized }) : undefined;

                    const res = await fetch(message.url, {
                        method,
                        headers: finalHeaders,
                        body: (method === 'GET' || method === 'HEAD') ? undefined : processedBody,
                        signal: controller.signal,
                        agent
                    }) as Response;

                    // Parse & Save Set-Cookie Headers to Selected Cookie Jar
                    if (jarName !== 'none') {
                        const rawSetCookies = res.headers.raw()['set-cookie'] || [];
                        if (rawSetCookies.length > 0) {
                            let requestHostname = '';
                            try { requestHostname = new URL(message.url).hostname; } catch {}
                            const store = this._getCookieJarStore();
                            const currentJar = store.jars[jarName] || [];

                            for (const rawStr of rawSetCookies) {
                                const parsed = this._parseSetCookie(rawStr, requestHostname);
                                if (parsed) {
                                    const existingIdx = currentJar.findIndex(c => c.name === parsed.name && c.domain === parsed.domain);
                                    if (existingIdx !== -1) {
                                        currentJar[existingIdx] = parsed;
                                    } else {
                                        currentJar.push(parsed);
                                    }
                                }
                            }
                            store.jars[jarName] = currentJar;
                            store.activeJar = jarName;
                            await this._saveCookieJarStore(store);
                            webviewPanel.webview.postMessage({ command: 'cookie-jars-updated', store });
                        }
                    }

                    if (this._isStale(webviewPanel, generation)) { return; }

                    webviewPanel.webview.postMessage({ command: 'response-start', status: res.status, statusText: res.statusText, headers: Object.fromEntries(res.headers.entries()) });

                    if (res.body) {
                        for await (const chunk of res.body) {
                            if (this._isStale(webviewPanel, generation)) { return; }
                            webviewPanel.webview.postMessage({ command: 'response-chunk', chunk: (chunk as Buffer).toString('base64') });
                        }
                    }

                    if (this._isStale(webviewPanel, generation)) { return; }
                    webviewPanel.webview.postMessage({ command: 'response-end' });

                } catch (err: any) {
                    if (this._isStale(webviewPanel, generation)) { return; }

                    console.error('[REQ-STUDIO] Fetch Error:', err);
                    if (err.name === 'AbortError') {
                        if (timedOut) {
                            webviewPanel.webview.postMessage({ command: 'response-error', message: `Request timed out after ${timeoutMs / 1000} seconds.` });
                        } else {
                            webviewPanel.webview.postMessage({ command: 'response-cancelled' });
                        }
                    } else {
                        webviewPanel.webview.postMessage({ command: 'response-error', message: 'Error: ' + err.message });
                    }
                } finally {
                    clearTimeout(timeoutId);
                    if (!this._isStale(webviewPanel, generation)) {
                        this._activeControllers.delete(webviewPanel);
                    }
                }
            } else if (message.command === 'cancel-request') {
                this._cancelPendingRequest(webviewPanel);
            } else if (message.command === 'env-changed') {
                if (message.file) {
                    this._panelEnvs.set(webviewPanel, message.file);
                    const envData = await this._readEnvFile(message.file);
                    webviewPanel.webview.postMessage({ command: 'env-data', file: message.file, envData });
                } else {
                    this._panelEnvs.delete(webviewPanel);
                    webviewPanel.webview.postMessage({ command: 'env-data', file: '', envData: {} });
                }
            } else if (message.command === 'save-request') {
                document.update(message.data);
                this._onDidChangeCustomDocument.fire({ document, undo: () => {}, redo: () => {} });
                vscode.commands.executeCommand('workbench.action.files.save');
                webviewPanel.webview.postMessage({ command: 'save-status', ok: true });
            } else if (message.command === 'document-changed') {
                document.update(message.data);
                this._onDidChangeCustomDocument.fire({ document, undo: () => {}, redo: () => {} });
            } else if (message.command === 'get-cookie-jars') {
                const store = this._getCookieJarStore();
                webviewPanel.webview.postMessage({ command: 'cookie-jars-updated', store });
            } else if (message.command === 'save-cookie-jars') {
                if (message.store) {
                    await this._saveCookieJarStore(message.store);
                    webviewPanel.webview.postMessage({ command: 'cookie-jars-updated', store: message.store });
                }
            }
        });
    }

    // saveCustomDocument (No changes)
    async saveCustomDocument(document: ReqDocument, cancellation: vscode.CancellationToken): Promise<void> {
        const content = JSON.stringify(document.documentData, null, 2);
        await fs.promises.writeFile(document.uri.fsPath, content, 'utf8');
    }
}

// activate and deactivate functions (No changes)
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            'req-studio-ui.reqCustomEditor',
            new ReqCustomEditorProvider(context),
            {
                webviewOptions: { retainContextWhenHidden: true },
                supportsMultipleEditorsPerDocument: false
            }
        )
    );
}

export function deactivate() { }