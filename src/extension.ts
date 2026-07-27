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

        message.url = this._substituteEnvVars(message.url, env);

        const newHeaders: Record<string, string> = {};
        for (const [hKey, hVal] of Object.entries(message.headers ?? {})) {
            newHeaders[this._substituteEnvVars(hKey, env)] = this._substituteEnvVars(hVal as string, env);
        }
        message.headers = newHeaders;

        if (typeof message.body === 'string') {
            message.body = this._substituteEnvVars(message.body, env);
        } else if (message.body && typeof message.body === 'object' && message.body.type === 'multipart/form-data') {
            for (const part of message.body.data ?? []) {
                part.key = this._substituteEnvVars(part.key, env);
                if (part.type === 'text' && typeof part.value === 'string') {
                    part.value = this._substituteEnvVars(part.value, env);
                }
            }
        }

        if (Array.isArray(message.params)) {
            const activeParams = message.params
                .filter((p: any) => p.enabled && p.key)
                .map((p: any) => [
                    this._substituteEnvVars(p.key, env),
                    this._substituteEnvVars(p.value, env)
                ]);
            if (activeParams.length > 0) {
                const qs = new URLSearchParams(activeParams).toString();
                message.url += (message.url.includes('?') ? '&' : '?') + qs;
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
        const { headers, body } = message;
        let processedBody: any = body;
        let finalHeaders: any = { ...headers };

        if (body && typeof body === 'object') {
            if (body.type === 'application/octet-stream') {
                processedBody = Buffer.from(body.data.base64content, 'base64');
            } else if (body.type === 'multipart/form-data') {
                const form = new FormData();
                for (const part of body.data) {
                    if (part.enabled) {
                        if (part.type === 'file' && part.value?.base64content) {
                            const buffer = Buffer.from(part.value.base64content, 'base64');
                            form.append(part.key, buffer, { filename: part.value.name });
                        } else if (part.type === 'text') {
                            form.append(part.key, part.value);
                        }
                    }
                }
                // Remove any user-set Content-Type so the generated boundary wins
                const cleanedHeaders: Record<string, string> = {};
                for (const [k, v] of Object.entries(headers ?? {})) {
                    if (k.toLowerCase() !== 'content-type') {
                        cleanedHeaders[k] = v as string;
                    }
                }
                finalHeaders = { ...cleanedHeaders, ...form.getHeaders() };
                processedBody = await form.getBuffer();
            }
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

                    // Inject Cookies from Selected Cookie Jar
                    const jarName = message.cookieJarName || 'Default Jar';
                    if (jarName !== 'none') {
                        const cookieHeader = this._getCookiesForUrl(jarName, message.url);
                        if (cookieHeader) {
                            const existingCookie = Object.keys(finalHeaders).find(k => k.toLowerCase() === 'cookie');
                            if (existingCookie) {
                                finalHeaders[existingCookie] = `${finalHeaders[existingCookie]}; ${cookieHeader}`;
                            } else {
                                finalHeaders['Cookie'] = cookieHeader;
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