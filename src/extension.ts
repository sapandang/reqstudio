import * as vscode from 'vscode';
import * as fs from 'fs';
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

    constructor(private readonly context: vscode.ExtensionContext) { }
    
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

        webviewPanel.webview.onDidReceiveMessage(async (message) => {
            console.log('[REQ-STUDIO] Received message:', message);
            if (message.command === 'send-request') {
                const { method, url } = message;
                try {
                    const { body: processedBody, headers: finalHeaders } = await this.prepareBodyAndHeaders(message);
                    
                    const res = await fetch(url, {
                        method,
                        headers: finalHeaders,
                        body: method === 'GET' ? undefined : processedBody
                    }) as Response;
                    
                    webviewPanel.webview.postMessage({ command: 'response-start', status: res.status, statusText: res.statusText, headers: Object.fromEntries(res.headers.entries()) });

                    if (res.body) {
                        for await (const chunk of res.body) {
                            webviewPanel.webview.postMessage({ command: 'response-chunk', chunk: (chunk as Buffer).toString('base64') });
                        }
                    }
                    
                    webviewPanel.webview.postMessage({ command: 'response-end' });

                } catch (err: any) {
                    console.error('[REQ-STUDIO] Fetch Error:', err);
                    // ** THE FIX IS HERE **
                    webviewPanel.webview.postMessage({ command: 'response', response: 'Error: ' + err.message, status: 0, statusText: 'Error' });
                }
            } else if (message.command === 'save-request') {
                document.update(message.data);
                this._onDidChangeCustomDocument.fire({ document, undo: () => {}, redo: () => {} });
                vscode.commands.executeCommand('workbench.action.files.save');
                webviewPanel.webview.postMessage({ command: 'save-status', ok: true });
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