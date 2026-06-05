import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
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
        const results: { name: string; file: string }[] = [];
        const dir = path.dirname(reqUri.fsPath);
        try {
            const files = await fs.promises.readdir(dir);
            for (const file of files) {
                if (file.endsWith('.reqenv')) {
                    const name = file === '.reqenv' ? 'default' : file.replace(/\.reqenv$/, '');
                    results.push({ name, file: path.join(dir, file) });
                }
            }
        } catch {
            /* ignore read errors */
        }
        return results;
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
                finalHeaders = { ...headers, ...form.getHeaders() };
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
        if (defaultFile) {
            this._panelEnvs.set(webviewPanel, defaultFile);
        }
        webviewPanel.webview.postMessage({ command: 'load-environments', environments: envList, defaultFile });

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

                    const res = await fetch(message.url, {
                        method,
                        headers: finalHeaders,
                        body: method === 'GET' ? undefined : processedBody,
                        signal: controller.signal
                    }) as Response;

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
                } else {
                    this._panelEnvs.delete(webviewPanel);
                }
            } else if (message.command === 'save-request') {
                document.update(message.data);
                this._onDidChangeCustomDocument.fire({ document, undo: () => {}, redo: () => {} });
                vscode.commands.executeCommand('workbench.action.files.save');
                webviewPanel.webview.postMessage({ command: 'save-status', ok: true });
            } else if (message.command === 'document-changed') {
                document.update(message.data);
                this._onDidChangeCustomDocument.fire({ document, undo: () => {}, redo: () => {} });
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