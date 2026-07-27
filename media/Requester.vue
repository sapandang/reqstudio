<template>
    <div class="h-screen w-full p-2 flex flex-col overflow-hidden gap-1 text-[var(--vscode-foreground)] bg-[var(--vscode-editor-background)]">
        <!-- Fixed Top Header Section -->
        <div class="flex-none">
            <!-- Top Toolbar -->
            <div class="flex items-center justify-between px-2 py-1 bg-[var(--vscode-sideBar-background,var(--vscode-editorWidget-background))] text-[var(--vscode-foreground)] border border-[var(--vscode-panel-border)] rounded shadow-sm mb-1">
                <div class="flex items-center gap-1">
                    <!-- Import Button -->
                    <button 
                        @click="showImportModal = true" 
                        title="Import cURL Command" 
                        class="px-2 py-1 rounded text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] active:bg-[var(--vscode-toolbar-activeBackground)] transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <span>Import cURL</span>
                    </button>

                    <!-- Export Button -->
                    <button 
                        @click="showExportModal = true" 
                        title="Export Code Snippet" 
                        class="px-2 py-1 rounded text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] active:bg-[var(--vscode-toolbar-activeBackground)] transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                    >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                        <span>Export Code</span>
                    </button>

                    <div class="h-3.5 w-px bg-[var(--vscode-panel-border)] mx-1"></div>

                    <!-- Jar Selector -->
                    <div class="flex gap-2 items-center text-xs">
                        <span class="text-[11px] font-medium text-[var(--vscode-descriptionForeground)]">Jar:</span>
                        <vscode-single-select :value="selectedJarName" @change="selectedJarName = $event.target.value" class="w-36">
                            <vscode-option value="none">-- No Jar --</vscode-option>
                            <vscode-option v-for="jar in jarNames" :key="jar" :value="jar">{{ jar }}</vscode-option>
                        </vscode-single-select>
                        <ReqButton variant="icon" title="Manage Cookie Jars" @click="showCookieModal = true">
                            <span class="text-xs">🍪</span>
                        </ReqButton>
                    </div>

                    <!-- SSL Verification Button -->
                    <button 
                        @click="rejectUnauthorized = !rejectUnauthorized"
                        :title="rejectUnauthorized ? 'SSL Verification Enabled (Strict)' : 'SSL Verification Disabled (Self-Signed Allowed)'"
                        class="px-2 py-0.5 rounded text-xs flex items-center gap-1 transition-colors font-medium border"
                        :class="rejectUnauthorized 
                            ? 'border-green-600/30 text-green-500 bg-green-500/10' 
                            : 'border-amber-500/30 text-amber-500 bg-amber-500/10'"
                    >
                        <svg v-if="rejectUnauthorized" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                        </svg>
                        <span>{{ rejectUnauthorized ? 'SSL Verified' : 'SSL Off' }}</span>
                    </button>
                </div>
            </div>

            <!-- Description & Environment Selector -->
            <div class="flex mb-1 gap-2 items-center">
                <div class="w-full grow">
                    <vscode-textfield v-model="description" placeholder="API Description" class="w-full"></vscode-textfield>
                </div>
                <div>
                    <vscode-single-select v-model="selectedEnvFile" class="w-40">
                        <vscode-option value="">-- No Env --</vscode-option>
                        <vscode-option v-for="env in environments" :key="env.file" :value="env.file">{{ env.name }}</vscode-option>
                    </vscode-single-select>
                </div>
            </div>
        </div>

        <!-- Main Split Panel (Flexible Height) -->
        <vscode-split-layout class="grow h-full min-h-0 overflow-hidden">
            <div slot="start" class="flex flex-col h-full min-h-0 overflow-hidden p-1">

                <!-- Fixed Method + URL Bar -->
                <div class="flex gap-1 py-1 flex-none items-center">
                    <vscode-single-select v-model="method" class="w-32">
                        <vscode-option value="GET">GET</vscode-option>
                        <vscode-option value="POST">POST</vscode-option>
                        <vscode-option value="PUT">PUT</vscode-option>
                        <vscode-option value="DELETE">DELETE</vscode-option>
                        <vscode-option value="PATCH">PATCH</vscode-option>
                        <vscode-option value="HEAD">HEAD</vscode-option>
                        <vscode-option value="OPTIONS">OPTIONS</vscode-option>
                    </vscode-single-select>
                    <vscode-textfield v-model="url" placeholder="http://localhost:3000" class="grow"></vscode-textfield>
                    <ReqButton v-if="!isSending" @click="sendRequest">Send</ReqButton>
                    <ReqButton v-else @click="cancelRequest" variant="secondary">Cancel</ReqButton>
                </div>

                <vscode-tabs selected-index="1" class="w-full grow min-h-0 flex flex-col overflow-hidden">
                    <vscode-tab-header slot="header">Parameters</vscode-tab-header>
                    <vscode-tab-panel class="grow min-h-0 overflow-auto p-2">
                        <div v-for="(param, idx) in params" :key="idx" class="flex gap-1 px-2 py-1 items-center">
                            <vscode-checkbox :checked="param.enabled" @change="param.enabled = $event.target.checked"></vscode-checkbox>
                            <vscode-textfield v-model="param.key" placeholder="Key" class="grow"></vscode-textfield>
                            <vscode-textfield v-model="param.value" placeholder="Value" class="grow"></vscode-textfield>
                            <ReqButton variant="icon" @click="removeParam(idx)" title="Remove parameter">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
                            </ReqButton>
                        </div>
                        <ReqButton variant="subtle" @click="addParam" class="ml-8 mt-1">+ Add Parameter</ReqButton>
                    </vscode-tab-panel>

                    <vscode-tab-header slot="header">Body</vscode-tab-header>
                    <vscode-tab-panel class="grow min-h-0 flex flex-col overflow-hidden p-2">
                        <div class="py-1 flex-none">
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
                        
                        <div class="grow min-h-0 h-full overflow-hidden py-1 flex flex-col">
                            <CodeEditor 
                                v-if="['raw', 'text/plain', 'application/json', 'application/xml'].includes(bodyType)"
                                v-model="bodyText" 
                                :language="requestLanguage" 
                                placeholder="Request body..." 
                                class="w-full h-full grow" 
                            />

                            <div v-else-if="bodyType === 'application/x-www-form-urlencoded'" class="h-full overflow-auto">
                                <div v-for="(item, idx) in bodyUrlEncoded" :key="idx" class="flex gap-1 py-1 items-center">
                                    <vscode-checkbox :checked="item.enabled" @change="item.enabled = $event.target.checked"></vscode-checkbox>
                                    <vscode-textfield v-model="item.key" placeholder="Key" class="grow"></vscode-textfield>
                                    <vscode-textfield v-model="item.value" placeholder="Value" class="grow"></vscode-textfield>
                                    <ReqButton variant="icon" @click="removeUrlEncoded(idx)" title="Remove field">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
                                    </ReqButton>
                                </div>
                                <ReqButton variant="subtle" @click="addUrlEncoded" class="ml-8 mt-1">+ Add Field</ReqButton>
                            </div>
                            
                            <div v-else-if="bodyType === 'multipart/form-data'" class="h-full overflow-auto">
                                <div v-for="(item, idx) in bodyMultipart" :key="idx" class="flex gap-1 py-1 items-center">
                                    <vscode-checkbox :checked="item.enabled" @change="item.enabled = $event.target.checked"></vscode-checkbox>
                                    <vscode-textfield v-model="item.key" placeholder="Key" class="w-1/3"></vscode-textfield>
                                    <vscode-single-select v-model="item.type" class="w-24">
                                        <vscode-option value="text">Text</vscode-option>
                                        <vscode-option value="file">File</vscode-option>
                                    </vscode-single-select>
                                    <vscode-textfield v-if="item.type === 'text'" v-model="item.value" placeholder="Value" class="grow"></vscode-textfield>
                                    <input v-if="item.type === 'file'" type="file" @change="e => handleMultipartFileChange(e, idx)" class="grow">
                                    <ReqButton variant="icon" @click="removeMultipart(idx)" title="Remove field">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
                                    </ReqButton>
                                </div>
                                <ReqButton variant="subtle" @click="addMultipart" class="ml-8 mt-1">+ Add Field</ReqButton>
                            </div>

                            <div v-else-if="bodyType === 'application/octet-stream'" class="h-full overflow-auto">
                                <div class="flex gap-2 items-center">
                                    <input type="file" @change="handleBinaryFileChange">
                                    <span v-if="bodyBinaryFile?.name">{{ bodyBinaryFile.name }} ({{ bodyBinaryFile.size }} bytes)</span>
                                </div>
                            </div>
                        </div>
                    </vscode-tab-panel>

                    <vscode-tab-header slot="header">Headers</vscode-tab-header>
                    <vscode-tab-panel class="grow min-h-0 overflow-auto p-2">
                        <div v-for="(header, idx) in headers" :key="idx" class="flex gap-1 px-2 py-1 items-center">
                            <vscode-checkbox :checked="header.enabled" @change="header.enabled = $event.target.checked"></vscode-checkbox>
                            <vscode-textfield v-model="header.key" placeholder="Header" class="grow"></vscode-textfield>
                            <vscode-textfield v-model="header.value" placeholder="Value" class="grow"></vscode-textfield>
                            <ReqButton variant="icon" @click="removeHeader(idx)" title="Remove header">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
                            </ReqButton>
                        </div>
                        <ReqButton variant="subtle" @click="addHeader" class="ml-8 mt-1">+ Add Header</ReqButton>
                    </vscode-tab-panel>

                    <vscode-tab-header slot="header">Auth</vscode-tab-header>
                    <vscode-tab-panel class="grow min-h-0 overflow-auto p-2 flex flex-col gap-3">
                        <div class="flex gap-2 items-center">
                            <label class="text-xs font-medium">Auth Type:</label>
                            <vscode-single-select v-model="authType" class="w-48">
                                <vscode-option value="none">Inherit / None</vscode-option>
                                <vscode-option value="bearer">Bearer Token</vscode-option>
                                <vscode-option value="basic">Basic Auth</vscode-option>
                                <vscode-option value="apiKey">API Key</vscode-option>
                            </vscode-single-select>
                        </div>

                        <div v-if="authType === 'bearer'" class="flex flex-col gap-2 max-w-lg">
                            <label class="text-xs text-[var(--vscode-descriptionForeground)]">Bearer Token</label>
                            <vscode-textfield v-model="authBearerToken" placeholder="Token (e.g. {{api_token}})"></vscode-textfield>
                        </div>

                        <div v-if="authType === 'basic'" class="flex flex-col gap-2 max-w-lg">
                            <label class="text-xs text-[var(--vscode-descriptionForeground)]">Username</label>
                            <vscode-textfield v-model="authBasicUsername" placeholder="Username"></vscode-textfield>
                            <label class="text-xs text-[var(--vscode-descriptionForeground)]">Password</label>
                            <vscode-textfield v-model="authBasicPassword" type="password" placeholder="Password"></vscode-textfield>
                        </div>

                        <div v-if="authType === 'apiKey'" class="flex flex-col gap-2 max-w-lg">
                            <label class="text-xs text-[var(--vscode-descriptionForeground)]">Key</label>
                            <vscode-textfield v-model="authApiKeyName" placeholder="Key Name (e.g. X-API-KEY)"></vscode-textfield>
                            <label class="text-xs text-[var(--vscode-descriptionForeground)]">Value</label>
                            <vscode-textfield v-model="authApiKeyValue" placeholder="Value (e.g. {{api_key}})"></vscode-textfield>
                            <label class="text-xs text-[var(--vscode-descriptionForeground)]">Add To</label>
                            <vscode-single-select v-model="authApiKeyAddTo" class="w-48">
                                <vscode-option value="header">Header</vscode-option>
                                <vscode-option value="query">Query Parameter</vscode-option>
                            </vscode-single-select>
                        </div>
                    </vscode-tab-panel>
                </vscode-tabs>
            </div>

            <div slot="end" class="flex flex-col h-full min-h-0 overflow-hidden p-1">
                <div class="flex flex-row gap-4 items-center flex-none mb-1 p-1 border-b border-[var(--vscode-panel-border)] text-xs">
                    <span v-if="statusCode !== null">Status: <span :class="statusCodeClass">{{ statusCode }}</span></span>
                    <span v-if="responseTime !== null">Time: {{ responseTime }} ms</span>
                </div>
                <vscode-tabs selected-index="0" class="w-full grow min-h-0 flex flex-col overflow-hidden">
                    <vscode-tab-header slot="header">Response Body</vscode-tab-header>
                    <vscode-tab-panel class="grow min-h-0 h-full overflow-hidden p-1 flex flex-col">
                        <CodeEditor :modelValue="responseBody" readonly :language="responseLanguage" class="w-full h-full grow" />
                    </vscode-tab-panel>
                    <vscode-tab-header slot="header">Response Headers</vscode-tab-header>
                    <vscode-tab-panel class="grow min-h-0 overflow-auto p-2">
                        <div v-if="responseHeaders">
                            <div v-for="(val, key) in responseHeaders" :key="key" class="flex gap-2">
                                <span class="font-bold">{{ key }}:</span> <span>{{ val }}</span>
                            </div>
                        </div>
                        <div v-else class="text-xs text-[var(--vscode-descriptionForeground)]">No headers</div>
                    </vscode-tab-panel>
                </vscode-tabs>
            </div>
        </vscode-split-layout>

        <!-- Export Code Modal -->
        <div v-if="showExportModal" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div class="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] text-[var(--vscode-foreground)] rounded-lg shadow-xl w-full max-w-2xl flex flex-col p-4 gap-3 max-h-[85vh]">
                <div class="flex justify-between items-center border-b border-[var(--vscode-panel-border)] pb-2">
                    <h3 class="font-bold text-base flex items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                        Export Code Snippet
                    </h3>
                    <ReqButton variant="icon" title="Close" @click="showExportModal = false">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </ReqButton>
                </div>
                
                <div class="flex gap-2 items-center">
                    <label class="text-sm font-medium">Language:</label>
                    <vscode-single-select v-model="selectedLanguage" class="w-56">
                        <vscode-option value="curl">cURL</vscode-option>
                        <vscode-option value="js-fetch">JavaScript (fetch)</vscode-option>
                        <vscode-option value="js-axios">JavaScript (axios)</vscode-option>
                        <vscode-option value="python-requests">Python (requests)</vscode-option>
                        <vscode-option value="go">Go (net/http)</vscode-option>
                        <vscode-option value="java">Java (HttpClient)</vscode-option>
                    </vscode-single-select>
                    <div class="grow"></div>
                    <ReqButton @click="copyCodeSnippet">
                        {{ copyStatusText }}
                    </ReqButton>
                </div>
                
                <div class="grow overflow-auto border border-[var(--vscode-panel-border)] rounded p-3 bg-[var(--vscode-textCodeBlock-background,var(--vscode-editor-background))] text-[var(--vscode-foreground)]">
                    <pre class="font-mono text-xs whitespace-pre-wrap break-all select-all text-[var(--vscode-foreground)]">{{ generatedCode }}</pre>
                </div>
            </div>
        </div>

        <!-- Import cURL Modal -->
        <div v-if="showImportModal" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div class="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] text-[var(--vscode-foreground)] rounded-lg shadow-xl w-full max-w-2xl flex flex-col p-4 gap-3 max-h-[85vh]">
                <div class="flex justify-between items-center border-b border-[var(--vscode-panel-border)] pb-2">
                    <h3 class="font-bold text-base flex items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Import from cURL
                    </h3>
                    <ReqButton variant="icon" title="Close" @click="showImportModal = false">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </ReqButton>
                </div>
                
                <p class="text-xs text-[var(--vscode-descriptionForeground)]">
                    Paste a cURL command copied from Postman, Chrome/Firefox DevTools, or terminal below.
                </p>

                <vscode-textarea v-model="curlInputText" rows="8" placeholder="curl 'http://localhost:3000/api' -H 'Content-Type: application/json' --data '{...}'" class="w-full font-mono text-xs"></vscode-textarea>

                <div v-if="importError" class="text-red-500 text-xs font-semibold">
                    {{ importError }}
                </div>

                <div class="flex justify-end gap-2 pt-2 border-t border-[var(--vscode-panel-border)]">
                    <ReqButton variant="secondary" @click="showImportModal = false">Cancel</ReqButton>
                    <ReqButton @click="importCurlCommand">Import</ReqButton>
                </div>
            </div>
        </div>

        <!-- Cookie Manager Modal -->
        <div v-if="showCookieModal" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div class="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] text-[var(--vscode-foreground)] rounded-lg shadow-xl w-full max-w-3xl flex flex-col p-4 gap-3 max-h-[85vh]">
                <div class="flex justify-between items-center border-b border-[var(--vscode-panel-border)] pb-2">
                    <h3 class="font-bold text-base flex items-center gap-2">
                        🍪 Cookie Jar Manager
                    </h3>
                    <ReqButton variant="icon" title="Close" @click="showCookieModal = false">
                        ✕
                    </ReqButton>
                </div>
                
                <div class="flex items-center gap-2 flex-wrap">
                    <label class="text-xs font-medium">Active Jar:</label>
                    <vscode-single-select :value="selectedJarName" @change="selectedJarName = $event.target.value" class="w-44">
                        <vscode-option v-for="jar in jarNames" :key="jar" :value="jar">{{ jar }}</vscode-option>
                    </vscode-single-select>
                    <ReqButton variant="subtle" @click="showNewJarInput = !showNewJarInput">
                        + New Jar
                    </ReqButton>
                    <div class="grow"></div>
                    <ReqButton variant="danger" @click="clearCurrentJar" :disabled="currentJarCookies.length === 0">
                        Clear Jar
                    </ReqButton>
                    <ReqButton variant="danger" @click="deleteCurrentJar" :disabled="selectedJarName === 'Default Jar'">
                        Delete Jar
                    </ReqButton>
                </div>

                <!-- New Jar Input Row -->
                <div v-if="showNewJarInput" class="flex gap-2 items-center bg-[var(--vscode-editorWidget-background)] p-2 rounded border border-[var(--vscode-panel-border)]">
                    <vscode-textfield v-model="newJarName" placeholder="e.g. user1_session" class="grow"></vscode-textfield>
                    <ReqButton @click="createNewJar">Create</ReqButton>
                    <ReqButton variant="secondary" @click="showNewJarInput = false">Cancel</ReqButton>
                </div>

                <!-- Cookie List Table -->
                <div class="grow overflow-auto border border-[var(--vscode-panel-border)] rounded p-2 text-xs min-h-[200px]">
                    <div v-if="currentJarCookies.length === 0" class="text-center text-[var(--vscode-descriptionForeground)] py-12">
                        No cookies in "{{ selectedJarName }}". Response Set-Cookie headers will be saved here automatically.
                    </div>
                    <table v-else class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b border-[var(--vscode-panel-border)] text-[var(--vscode-descriptionForeground)] font-medium">
                                <th class="py-1 px-2">Name</th>
                                <th class="py-1 px-2">Value</th>
                                <th class="py-1 px-2">Domain</th>
                                <th class="py-1 px-2">Path</th>
                                <th class="py-1 px-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(cookie, idx) in currentJarCookies" :key="idx" class="border-b border-[var(--vscode-panel-border)]/40 hover:bg-[var(--vscode-toolbar-hoverBackground)]">
                                <td class="py-1.5 px-2 font-mono font-semibold">{{ cookie.name }}</td>
                                <td class="py-1.5 px-2 font-mono text-[11px] truncate max-w-[240px]" :title="cookie.value">{{ cookie.value }}</td>
                                <td class="py-1.5 px-2 text-[11px]">{{ cookie.domain }}</td>
                                <td class="py-1.5 px-2 text-[11px]">{{ cookie.path }}</td>
                                <td class="py-1.5 px-2 text-right">
                                    <ReqButton variant="icon" @click="deleteCookie(idx)" title="Delete Cookie">
                                        ✕
                                    </ReqButton>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="flex justify-end pt-2 border-t border-[var(--vscode-panel-border)]">
                    <ReqButton @click="showCookieModal = false">Done</ReqButton>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import '@vscode-elements/elements';
import { generateCode } from './codeGen.js';
import { parseCurl } from './curlParser.js';
import CodeEditor from './CodeEditor.vue';
import ReqButton from './ReqButton.vue';

// =========================================================================
//  STATE, REFS, AND VARIABLES
// =========================================================================
    const method = ref('GET');
    const url = ref('');
    const description = ref('');
const params = ref([{ key: '', value: '', enabled: true }]);
const headers = ref([{ key: '', value: '', enabled: true }]);

    // SSL Verification State
    const rejectUnauthorized = ref(true);

    // Cookie Jar State
    const cookieJars = ref({ 'Default Jar': [] });
    const selectedJarName = ref('Default Jar');
    const showCookieModal = ref(false);
    const showNewJarInput = ref(false);
    const newJarName = ref('');

    const jarNames = computed(() => Object.keys(cookieJars.value));

    const currentJarCookies = computed(() => {
        return cookieJars.value[selectedJarName.value] || [];
    });

    function createNewJar() {
        const name = newJarName.value.trim();
        if (!name) return;
        if (!cookieJars.value[name]) {
            cookieJars.value[name] = [];
        }
        selectedJarName.value = name;
        newJarName.value = '';
        showNewJarInput.value = false;
        saveCookieJarsToExtension();
    }

    function clearCurrentJar() {
        if (selectedJarName.value && cookieJars.value[selectedJarName.value]) {
            cookieJars.value[selectedJarName.value] = [];
            saveCookieJarsToExtension();
        }
    }

    function deleteCurrentJar() {
        if (selectedJarName.value === 'Default Jar') return;
        delete cookieJars.value[selectedJarName.value];
        selectedJarName.value = 'Default Jar';
        saveCookieJarsToExtension();
    }

    function deleteCookie(index) {
        const jar = cookieJars.value[selectedJarName.value];
        if (jar && jar[index]) {
            jar.splice(index, 1);
            saveCookieJarsToExtension();
        }
    }

    function saveCookieJarsToExtension() {
        if (vscode) {
            vscode.postMessage({
                command: 'save-cookie-jars',
                store: {
                    activeJar: selectedJarName.value,
                    jars: cookieJars.value
                }
            });
        }
    }

    // Auth Tab State
    const authType = ref('none');
    const authBearerToken = ref('');
    const authBasicUsername = ref('');
    const authBasicPassword = ref('');
    const authApiKeyName = ref('');
    const authApiKeyValue = ref('');
    const authApiKeyAddTo = ref('header');

    // Language Mode Computeds for CodeEditor
    const requestLanguage = computed(() => {
        if (bodyType.value === 'application/json') return 'json';
        if (bodyType.value === 'application/xml') return 'xml';
        if (bodyType.value === 'text/plain') return 'text';
        return 'text';
    });

    const responseLanguage = computed(() => {
        const contentType = (responseHeaders.value?.['content-type'] || responseHeaders.value?.['Content-Type'] || '').toLowerCase();
        const text = (responseBody.value || '').trim();
        if (contentType.includes('json') || text.startsWith('{') || text.startsWith('[')) return 'json';
        if (contentType.includes('xml') || text.startsWith('<?xml') || (text.startsWith('<') && text.endsWith('>'))) return 'xml';
        if (contentType.includes('html')) return 'html';
        return 'text';
    });
    const showImportModal = ref(false);
    const curlInputText = ref('');
    const importError = ref('');

    function importCurlCommand() {
        importError.value = '';
        try {
            const parsed = parseCurl(curlInputText.value);
            description.value = parsed.description || description.value;
            method.value = parsed.method || 'GET';
            url.value = parsed.url || '';
            params.value = parsed.params && parsed.params.length > 0 ? parsed.params : [{ key: '', value: '', enabled: true }];
            headers.value = parsed.headers && parsed.headers.length > 0 ? parsed.headers : [{ key: '', value: '', enabled: true }];
            bodyType.value = parsed.bodyType || 'none';
            bodyText.value = parsed.bodyText || '';
            bodyUrlEncoded.value = parsed.bodyUrlEncoded && parsed.bodyUrlEncoded.length > 0 ? parsed.bodyUrlEncoded : [{ key: '', value: '', enabled: true }];
            bodyMultipart.value = parsed.bodyMultipart && parsed.bodyMultipart.length > 0 ? parsed.bodyMultipart : [{ key: '', value: '', type: 'text', enabled: true }];
            
            if (parsed.auth) {
                authType.value = parsed.auth.type || 'none';
                authBearerToken.value = parsed.auth.bearer?.token || '';
                authBasicUsername.value = parsed.auth.basic?.username || '';
                authBasicPassword.value = parsed.auth.basic?.password || '';
                authApiKeyName.value = parsed.auth.apiKey?.key || '';
                authApiKeyValue.value = parsed.auth.apiKey?.value || '';
                authApiKeyAddTo.value = parsed.auth.apiKey?.addTo || 'header';
            }

            curlInputText.value = '';
            showImportModal.value = false;
        } catch (err) {
            importError.value = err.message || 'Failed to parse cURL command.';
        }
    }

    // Export code modal state
    const showExportModal = ref(false);
    const selectedLanguage = ref('curl');
    const copyStatusText = ref('Copy Code');
    const currentEnvData = ref({});

    const generatedCode = computed(() => {
        return generateCode(requestData.value, selectedLanguage.value, currentEnvData.value);
    });

    function copyCodeSnippet() {
        if (generatedCode.value) {
            navigator.clipboard.writeText(generatedCode.value);
            copyStatusText.value = 'Copied!';
            setTimeout(() => { copyStatusText.value = 'Copy Code'; }, 2000);
        }
    }

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
    const isSending = ref(false);

    const environments = ref([]);
    const selectedEnvFile = ref('');

    let vscode;
    let requestStartTime = null;
    let chunkBuffers = [];
    let isLoading = true;

    const statusCodeClass = computed(() => {
        if (statusCode.value == null) return '';
        if (statusCode.value >= 200 && statusCode.value < 300) return 'text-green-600';
        if (statusCode.value >= 400) return 'text-red-600';
        return 'text-yellow-600';
    });

    const requestData = computed(getRequestData);

    watch(requestData, (newData) => {
        if (!isLoading && vscode) {
            vscode.postMessage({ command: 'document-changed', data: newData });
        }
    }, { flush: 'sync' });

    watch(selectedEnvFile, (file) => {
        if (vscode) {
            vscode.postMessage({ command: 'env-changed', file });
        }
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
            case 'cookie-jars-updated':
                if (message.store && message.store.jars) {
                    cookieJars.value = message.store.jars;
                    if (message.store.activeJar && cookieJars.value[message.store.activeJar]) {
                        selectedJarName.value = message.store.activeJar;
                    }
                }
                break;
            case 'load-request': setRequestData(message.data); break;
            case 'save-status': console.log(message.ok ? 'Request saved!' : 'Save failed.'); break;
            case 'load-environments':
                environments.value = message.environments;
                if (message.defaultFile) {
                    selectedEnvFile.value = message.defaultFile;
                }
                currentEnvData.value = message.envData || {};
                break;
            case 'env-data':
                currentEnvData.value = message.envData || {};
                break;
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
                const rawDecoded = tryDecodeToString(all);
                try {
                    const parsedJson = JSON.parse(rawDecoded);
                    responseBody.value = JSON.stringify(parsedJson, null, 2);
                } catch {
                    responseBody.value = rawDecoded;
                }
                if (requestStartTime) { responseTime.value = Math.round(performance.now() - requestStartTime); }
                isSending.value = false;
                break;
            case 'response':
                statusCode.value = message.status;
                responseHeaders.value = message.headers || null;
                const rawResp = message.response || '';
                try {
                    const parsedJson = JSON.parse(rawResp);
                    responseBody.value = JSON.stringify(parsedJson, null, 2);
                } catch {
                    responseBody.value = rawResp;
                }
                if (requestStartTime) { responseTime.value = Math.round(performance.now() - requestStartTime); }
                isSending.value = false;
                break;
            case 'response-cancelled':
                responseBody.value = 'Request cancelled.';
                responseHeaders.value = null;
                statusCode.value = null;
                responseTime.value = null;
                isSending.value = false;
                break;
            case 'response-error':
                responseBody.value = message.message;
                responseHeaders.value = null;
                statusCode.value = null;
                responseTime.value = null;
                isSending.value = false;
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
        description: description.value,
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
        auth: {
            type: authType.value,
            bearer: { token: authBearerToken.value },
            basic: { username: authBasicUsername.value, password: authBasicPassword.value },
            apiKey: { key: authApiKeyName.value, value: authApiKeyValue.value, addTo: authApiKeyAddTo.value }
        },
        rejectUnauthorized: rejectUnauthorized.value
    };
}

    function setRequestData(data) {
        if (!data) {
            isLoading = false;
            return;
        }
        isLoading = true;
        const fromPlain = (arr) => Array.isArray(arr) && arr.length > 0 ? arr : [{ key: '', value: '', enabled: true }];
        description.value = data.description || '';
        method.value = data.method || 'GET';
        url.value = data.url || '';
        params.value = fromPlain(data.params);
        headers.value = fromPlain(data.headers);
        bodyType.value = data.bodyType || 'none';
        bodyText.value = data.bodyText || '';
        bodyUrlEncoded.value = fromPlain(data.bodyUrlEncoded);
        bodyMultipart.value = Array.isArray(data.bodyMultipart) && data.bodyMultipart.length > 0 ? data.bodyMultipart : [{ key: '', value: '', type: 'text', enabled: true }];
        
        rejectUnauthorized.value = data.rejectUnauthorized !== false;
        if (data.auth) {
            authType.value = data.auth.type || 'none';
            authBearerToken.value = data.auth.bearer?.token || '';
            authBasicUsername.value = data.auth.basic?.username || '';
            authBasicPassword.value = data.auth.basic?.password || '';
            authApiKeyName.value = data.auth.apiKey?.key || '';
            authApiKeyValue.value = data.auth.apiKey?.value || '';
            authApiKeyAddTo.value = data.auth.apiKey?.addTo || 'header';
        } else {
            authType.value = 'none';
            authBearerToken.value = '';
            authBasicUsername.value = '';
            authBasicPassword.value = '';
            authApiKeyName.value = '';
            authApiKeyValue.value = '';
            authApiKeyAddTo.value = 'header';
        }

        isLoading = false;
    }

function saveRequest() {
    if (vscode) {
        vscode.postMessage({ command: 'save-request', data: getRequestData() });
    }
}

function cancelRequest() {
    if (vscode) {
        vscode.postMessage({ command: 'cancel-request' });
    }
}

// --- Main Send Request Logic ---
async function sendRequest() {
    if (!vscode) return;
    isSending.value = true;
    responseBody.value = 'Sending request...';
    responseHeaders.value = null;
    statusCode.value = null;
    responseTime.value = null;
    requestStartTime = performance.now();
    chunkBuffers = [];

    const requestPayload = {
        ...getRequestData(),
        envFile: selectedEnvFile.value,
        rejectUnauthorized: rejectUnauthorized.value,
        cookieJarName: selectedJarName.value
    };

    vscode.postMessage({ command: 'send-request', ...requestPayload });
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

<style>
vscode-split-layout {
    height: 100%;
    overflow: hidden;
}

vscode-tabs {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

vscode-tab-panel {
    flex: 1 1 auto;
    height: 100%;
    min-height: 0;
}
</style>

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