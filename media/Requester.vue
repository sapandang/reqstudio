<template>
    <div class="h-screen w-full p-2 flex flex-col">
        <div class="flex justify-end mb-2">
            <vscode-button @click="saveRequest">Save</vscode-button>
        </div>
        <vscode-split-layout class="h-full grow">
            <div slot="start" class="flex flex-col gap-2">

                <div class="flex gap-1 p-2">
                    <vscode-single-select v-model="method" class="w-32">
                        <vscode-option value="GET">GET</vscode-option>
                        <vscode-option value="POST">POST</vscode-option>
                        <vscode-option value="PUT">PUT</vscode-option>
                        <vscode-option value="DELETE">DELETE</vscode-option>
                    </vscode-single-select>
                    <vscode-textfield v-model="url" placeholder="http://localhost:3000" class="grow"></vscode-textfield>
                    <vscode-button @click="sendRequest">Send</vscode-button>
                </div>

                <div class="flex flex-row h-full">
                    <vscode-tabs selected-index="1" class="w-full h-full grow">
                        <vscode-tab-header slot="header">Parameters</vscode-tab-header>
                        <vscode-tab-panel>
                            <div v-for="(param, idx) in params" :key="idx" class="flex gap-1 px-2 py-1 items-center">
                                <vscode-checkbox :checked="param.enabled" @change="param.enabled = $event.target.checked"></vscode-checkbox>
                                <vscode-textfield v-model="param.key" placeholder="Key" class="grow"></vscode-textfield>
                                <vscode-textfield v-model="param.value" placeholder="Value" class="grow"></vscode-textfield>
                                <vscode-button appearance="icon" @click="removeParam(idx)">-</vscode-button>
                            </div>
                            <vscode-button @click="addParam" class="ml-8">Add Parameter</vscode-button>
                        </vscode-tab-panel>

                        <vscode-tab-header slot="header">Body</vscode-tab-header>
                        <vscode-tab-panel class="h-full flex flex-col">
                            <div class="px-2 py-1">
                                <vscode-single-select v-model="bodyType" id="bodytype">
                                    <vscode-option value="none">none</vscode-option>
                                    <vscode-option value="raw">raw</vscode-option>
                                    <vscode-option value="text/plain">text</vscode-option>
                                    <vscode-option value="application/json">JSON</vscode-option>
                                    <vscode-option value="application/x-www-form-urlencoded">x-www-form-urlencoded</vscode-option>
                                    <vscode-option value="multipart/form-data">multipart/form-data</vscode-option>
                                    <vscode-option value="application/xml">XML</vscode-option>
                                    <vscode-option value="application/octet-stream">Binary (File)</vscode-option>
                                </vscode-single-select>
                            </div>
                            
                            <div class="grow px-2 py-1 h-full">
                                <vscode-textarea v-if="['raw', 'text/plain', 'application/json', 'application/xml'].includes(bodyType)"
                                    v-model="bodyText" class="w-full h-full" rows="6" placeholder="Request body..."></vscode-textarea>

                                <div v-if="bodyType === 'application/x-www-form-urlencoded'">
                                    <div v-for="(item, idx) in bodyUrlEncoded" :key="idx" class="flex gap-1 py-1 items-center">
                                        <vscode-checkbox :checked="item.enabled" @change="item.enabled = $event.target.checked"></vscode-checkbox>
                                        <vscode-textfield v-model="item.key" placeholder="Key" class="grow"></vscode-textfield>
                                        <vscode-textfield v-model="item.value" placeholder="Value" class="grow"></vscode-textfield>
                                        <vscode-button appearance="icon" @click="removeUrlEncoded(idx)">-</vscode-button>
                                    </div>
                                    <vscode-button @click="addUrlEncoded" class="ml-8">Add Field</vscode-button>
                                </div>
                                
                                <div v-if="bodyType === 'multipart/form-data'">
                                    <div v-for="(item, idx) in bodyMultipart" :key="idx" class="flex gap-1 py-1 items-center">
                                        <vscode-checkbox :checked="item.enabled" @change="item.enabled = $event.target.checked"></vscode-checkbox>
                                        <vscode-textfield v-model="item.key" placeholder="Key" class="w-1/3"></vscode-textfield>
                                        <vscode-single-select v-model="item.type" class="w-24">
                                            <vscode-option value="text">Text</vscode-option>
                                            <vscode-option value="file">File</vscode-option>
                                        </vscode-single-select>
                                        <vscode-textfield v-if="item.type === 'text'" v-model="item.value" placeholder="Value" class="grow"></vscode-textfield>
                                        <input v-if="item.type === 'file'" type="file" @change="e => handleMultipartFileChange(e, idx)" class="grow">
                                        <vscode-button appearance="icon" @click="removeMultipart(idx)">-</vscode-button>
                                    </div>
                                    <vscode-button @click="addMultipart" class="ml-8">Add Field</vscode-button>
                                </div>

                                <div v-if="bodyType === 'application/octet-stream'">
                                    <div class="flex gap-2 items-center">
                                        <input type="file" @change="handleBinaryFileChange">
                                        <span v-if="bodyBinaryFile?.name">{{ bodyBinaryFile.name }} ({{ bodyBinaryFile.size }} bytes)</span>
                                    </div>
                                </div>
                            </div>
                        </vscode-tab-panel>

                        <vscode-tab-header slot="header">Headers</vscode-tab-header>
                        <vscode-tab-panel>
                            <div v-for="(header, idx) in headers" :key="idx" class="flex gap-1 px-2 py-1 items-center">
                                <vscode-checkbox :checked="header.enabled" @change="header.enabled = $event.target.checked"></vscode-checkbox>
                                <vscode-textfield v-model="header.key" placeholder="Header" class="grow"></vscode-textfield>
                                <vscode-textfield v-model="header.value" placeholder="Value" class="grow"></vscode-textfield>
                                <vscode-button appearance="icon" @click="removeHeader(idx)">-</vscode-button>
                            </div>
                            <vscode-button @click="addHeader" class="ml-8">Add Header</vscode-button>
                        </vscode-tab-panel>
                    </vscode-tabs>
                </div>
            </div>

            <div slot="end">
                <div class="flex flex-row gap-4 items-center mb-2 p-2">
                    <span v-if="statusCode !== null">Status: <span :class="statusCodeClass">{{ statusCode }}</span></span>
                    <span v-if="responseTime !== null">Time: {{ responseTime }} ms</span>
                </div>
                <vscode-tabs selected-index="0" class="w-full h-full grow p-2">
                    <vscode-tab-header slot="header">Response Body</vscode-tab-header>
                    <vscode-tab-panel class="h-full">
                        <vscode-textarea :value="responseBody" readonly class="w-full h-full"></vscode-textarea>
                    </vscode-tab-panel>
                    <vscode-tab-header slot="header">Response Headers</vscode-tab-header>
                    <vscode-tab-panel>
                        <div v-if="responseHeaders">
                            <div v-for="(val, key) in responseHeaders" :key="key" class="flex gap-2">
                                <span class="font-bold">{{ key }}:</span> <span>{{ val }}</span>
                            </div>
                        </div>
                        <div v-else>No headers</div>
                    </vscode-tab-panel>
                </vscode-tabs>
            </div>
        </vscode-split-layout>
    </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import '@vscode-elements/elements';

// =========================================================================
//  STATE, REFS, AND VARIABLES
// =========================================================================
const method = ref('GET');
const url = ref('');
const params = ref([{ key: '', value: '', enabled: true }]);
const headers = ref([{ key: '', value: '', enabled: true }]);

// New state for different body types
const bodyType = ref('none');
const bodyText = ref('');
const bodyUrlEncoded = ref([{ key: '', value: '', enabled: true }]);
const bodyMultipart = ref([{ key: '', value: '', type: 'text', enabled: true }]);
const bodyBinaryFile = ref(null); // Will hold { name, size, base64content }

const responseBody = ref('');
const responseHeaders = ref(null);
const statusCode = ref(null);
const responseTime = ref(null);

let vscode;
let requestStartTime = null;
let chunkBuffers = [];

const statusCodeClass = computed(() => {
    if (statusCode.value == null) return '';
    if (statusCode.value >= 200 && statusCode.value < 300) return 'text-green-600';
    if (statusCode.value >= 400) return 'text-red-600';
    return 'text-yellow-600';
});

// =========================================================================
//  LIFECYCLE HOOKS
// =========================================================================
onMounted(() => {
    if (window.acquireVsCodeApi) {
        vscode = window.acquireVsCodeApi();
    }
    // Message listener logic remains the same...
    window.addEventListener('message', (event) => {
        const message = event.data;
        switch (message.command) {
            case 'load-request': setRequestData(message.data); break;
            case 'save-status': console.log(message.ok ? 'Request saved!' : 'Save failed.'); break;
            case 'response-start':
                chunkBuffers = [];
                statusCode.value = message.status;
                responseHeaders.value = message.headers;
                responseBody.value = 'Receiving...';
                break;
            case 'response-chunk':
                chunkBuffers.push(base64ToUint8Array(message.chunk));
                responseBody.value = `Receiving... (${chunkBuffers.length} chunks)`;
                break;
            case 'response-end':
                const all = new Uint8Array(chunkBuffers.reduce((sum, arr) => sum + arr.length, 0));
                let offset = 0;
                for (const arr of chunkBuffers) { all.set(arr, offset); offset += arr.length; }
                responseBody.value = tryDecodeToString(all);
                if (requestStartTime) { responseTime.value = Math.round(performance.now() - requestStartTime); }
                break;
            case 'response':
                statusCode.value = message.status;
                responseBody.value = message.response;
                responseHeaders.value = message.headers || null;
                if (requestStartTime) { responseTime.value = Math.round(performance.now() - requestStartTime); }
                break;
        }
    });
});

// =========================================================================
//  METHODS
// =========================================================================

// --- File Reading Helpers ---
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

async function handleBinaryFileChange(event) {
    const file = event.target.files[0];
    if (!file) {
        bodyBinaryFile.value = null;
        return;
    }
    const base64content = await readFileAsBase64(file);
    bodyBinaryFile.value = { name: file.name, size: file.size, base64content };
}

async function handleMultipartFileChange(event, index) {
    const file = event.target.files[0];
    if (!file) {
        bodyMultipart.value[index].value = null;
        return;
    }
    const base64content = await readFileAsBase64(file);
    bodyMultipart.value[index].value = { name: file.name, size: file.size, base64content };
}

// --- UI Add/Remove Helpers ---
function addParam() { params.value.push({ key: '', value: '', enabled: true }); }
function removeParam(idx) { params.value.splice(idx, 1); }
function addHeader() { headers.value.push({ key: '', value: '', enabled: true }); }
function removeHeader(idx) { headers.value.splice(idx, 1); }
function addUrlEncoded() { bodyUrlEncoded.value.push({ key: '', value: '', enabled: true }); }
function removeUrlEncoded(idx) { bodyUrlEncoded.value.splice(idx, 1); }
function addMultipart() { bodyMultipart.value.push({ key: '', value: '', type: 'text', enabled: true }); }
function removeMultipart(idx) { bodyMultipart.value.splice(idx, 1); }

// --- Save and Load Logic ---
function getRequestData() {
    const toPlain = (arr) => arr.filter(p => p.key).map(p => {
        return { 
            key: p.key, 
            value: p.value, 
            enabled: p.enabled, 
            ...(p.type && { type: p.type }) 
        };
    });

    return {
        method: method.value,
        url: url.value,
        params: toPlain(params.value),
        headers: toPlain(headers.value),
        bodyType: bodyType.value,
        bodyText: bodyText.value,
        bodyUrlEncoded: toPlain(bodyUrlEncoded.value),
        bodyMultipart: bodyMultipart.value.map(p => ({
            key: p.key,
            value: p.type === 'file' ? null : p.value,
            type: p.type,
            enabled: p.enabled,
        })),
    };
}

function setRequestData(data) {
    if (!data) return;
    const fromPlain = (arr) => Array.isArray(arr) && arr.length > 0 ? arr : [{ key: '', value: '', enabled: true }];
    method.value = data.method || 'GET';
    url.value = data.url || '';
    params.value = fromPlain(data.params);
    headers.value = fromPlain(data.headers);
    bodyType.value = data.bodyType || 'none';
    bodyText.value = data.bodyText || '';
    bodyUrlEncoded.value = fromPlain(data.bodyUrlEncoded);
    bodyMultipart.value = Array.isArray(data.bodyMultipart) && data.bodyMultipart.length > 0 ? data.bodyMultipart : [{ key: '', value: '', type: 'text', enabled: true }];
}

function saveRequest() {
    if (vscode) {
        vscode.postMessage({ command: 'save-request', data: getRequestData() });
    }
}

// --- Main Send Request Logic ---
async function sendRequest() {
    if (!vscode) {
        responseBody.value = 'Error: VS Code API not available.';
        return;
    }

    // 1. Build URL with params (no changes here)
    let reqUrl = url.value;
    const activeParams = params.value.filter(p => p.enabled && p.key);
    if (activeParams.length > 0) {
        const searchParams = new URLSearchParams(activeParams.map(p => [p.key, p.value])).toString();
        reqUrl += (reqUrl.includes('?') ? '&' : '?') + searchParams;
    }

    // 2. Build Headers (no changes here)
    const reqHeaders = {};
    headers.value.filter(h => h.enabled && h.key).forEach(h => { reqHeaders[h.key] = h.value; });
    
    const hasContentType = Object.keys(reqHeaders).some(h => h.toLowerCase() === 'content-type');
    if (!hasContentType && bodyType.value !== 'none' && bodyType.value !== 'raw') {
        reqHeaders['Content-Type'] = bodyType.value;
    }
    
    // 3. Build Body based on type
    let reqBodyPayload;
    switch (bodyType.value) {
        case 'application/x-www-form-urlencoded':
            reqBodyPayload = new URLSearchParams(
                bodyUrlEncoded.value.filter(p => p.enabled && p.key).map(p => [p.key, p.value])
            ).toString();
            break;
        case 'multipart/form-data':
        case 'application/octet-stream':
            // ** THE FIX IS HERE **
            // We create a plain, "clonable" copy of the reactive data.
            const dataToSend = bodyType.value === 'multipart/form-data' 
                ? bodyMultipart.value.filter(p => p.enabled && p.key) 
                : bodyBinaryFile.value;

            reqBodyPayload = {
                type: bodyType.value,
                data: JSON.parse(JSON.stringify(dataToSend)) // Convert to plain object
            };
            break;
        case 'none':
            reqBodyPayload = undefined;
            break;
        default: // raw, text, json, xml
            reqBodyPayload = bodyText.value;
            break;
    }

    // 4. Reset UI and send message (no changes here)
    statusCode.value = null;
    responseTime.value = null;
    responseBody.value = 'Sending...';
    responseHeaders.value = null;
    requestStartTime = performance.now();

    vscode.postMessage({
        command: 'send-request',
        method: method.value,
        url: reqUrl,
        headers: reqHeaders,
        body: (method.value === 'GET' || !reqBodyPayload) ? undefined : reqBodyPayload
    });
}

// Helper functions for response streaming
function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function tryDecodeToString(uint8arr) {
    try {
        return new TextDecoder().decode(uint8arr);
    } catch {
        return '[Binary data cannot be displayed]';
    }
}
</script>

<style scoped>
/* Add some styling for the file input to make it blend in */
input[type="file"] {
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border);
    border-radius: 2px;
    padding: 3px;
}
[slot="start"], [slot="end"] { overflow: auto; }
</style>