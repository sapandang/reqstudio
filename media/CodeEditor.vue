<template>
    <div class="code-editor-container" :class="{ 'is-readonly': readonly }">
        <!-- Editor Header Toolbar -->
        <div class="editor-header flex items-center justify-between px-2 py-1 bg-[var(--vscode-editorHeader-background,var(--vscode-sideBar-background))] border-b border-[var(--vscode-panel-border)] text-xs">
            <div class="flex items-center gap-2">
                <span class="font-semibold uppercase tracking-wider text-[var(--vscode-descriptionForeground)] text-[10px]">{{ language }}</span>
                <span v-if="formatError" class="text-red-500 font-medium text-[11px]">{{ formatError }}</span>
            </div>
            
            <div class="flex items-center gap-1">
                <!-- Search Toggle Button -->
                <button 
                    @click="toggleSearch" 
                    title="Search (Ctrl+F)" 
                    class="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] active:bg-[var(--vscode-toolbar-activeBackground)] text-[var(--vscode-foreground)] transition-colors"
                    :class="{ 'bg-[var(--vscode-toolbar-activeBackground)]': showSearch }"
                >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </button>

                <!-- Format / Prettify Button -->
                <button 
                    v-if="['json', 'xml', 'html'].includes(language)" 
                    @click="formatCode" 
                    title="Format / Prettify Code" 
                    class="px-2 py-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] active:bg-[var(--vscode-toolbar-activeBackground)] text-[var(--vscode-foreground)] transition-colors font-medium text-[11px]"
                >
                    Format
                </button>

                <!-- Word Wrap Toggle Button -->
                <button 
                    @click="isWordWrap = !isWordWrap" 
                    title="Toggle Word Wrap" 
                    class="px-2 py-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] active:bg-[var(--vscode-toolbar-activeBackground)] text-[var(--vscode-foreground)] transition-colors font-medium text-[11px]"
                    :class="{ 'bg-[var(--vscode-toolbar-activeBackground)] font-bold': isWordWrap }"
                >
                    Wrap
                </button>

                <!-- Copy Code Button -->
                <button 
                    @click="copyCode" 
                    title="Copy Code" 
                    class="px-2 py-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] active:bg-[var(--vscode-toolbar-activeBackground)] text-[var(--vscode-foreground)] transition-colors font-medium text-[11px]"
                >
                    {{ copyStatus }}
                </button>
            </div>
        </div>

        <!-- Search Bar Popup -->
        <div v-if="showSearch" class="search-bar flex items-center gap-2 px-2 py-1 bg-[var(--vscode-editorWidget-background,var(--vscode-editor-background))] border-b border-[var(--vscode-panel-border)] shadow-sm">
            <input 
                ref="searchInputRef" 
                v-model="searchQuery" 
                @keydown.esc="showSearch = false"
                @keydown.enter.prevent="nextMatch"
                placeholder="Find in code..." 
                class="search-input text-xs px-2 py-0.5 rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] outline-none focus:border-[var(--vscode-focusBorder)] grow"
            />
            <span class="text-[11px] text-[var(--vscode-descriptionForeground)] font-mono min-w-[50px] text-center">
                {{ matches.length > 0 ? `${currentMatchIndex + 1}/${matches.length}` : 'No results' }}
            </span>
            <button @click="prevMatch" title="Previous Match (Shift+Enter)" class="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)]">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>
            </button>
            <button @click="nextMatch" title="Next Match (Enter)" class="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)]">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            </button>
            <button @click="showSearch = false" title="Close Search" class="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)]">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>

        <!-- Main Code Body (Gutter + Editor/Viewer) -->
        <div class="editor-body flex grow overflow-hidden relative" @keydown.ctrl.f.prevent="openSearch">
            <!-- Line Numbers Gutter -->
            <div ref="gutterRef" class="line-numbers font-mono text-xs select-none py-2 px-2 text-right border-r border-[var(--vscode-editorLineNumber-activeForeground,var(--vscode-panel-border))] bg-[var(--vscode-editorGutter-background,var(--vscode-editor-background))] text-[var(--vscode-editorLineNumber-foreground,#858585)] min-w-[40px]">
                <div v-for="n in lineCount" :key="n" class="leading-5">{{ n }}</div>
            </div>

            <!-- Content Area -->
            <div class="content-wrapper grow relative overflow-hidden font-mono text-xs leading-5">
                <!-- Editable Area (Textarea Overlay) -->
                <textarea 
                    v-if="!readonly"
                    ref="textareaRef"
                    :value="localCode"
                    @input="onInput"
                    @keydown="onKeydown"
                    @scroll="onScroll"
                    :placeholder="placeholder"
                    spellcheck="false"
                    class="editor-textarea absolute inset-0 w-full h-full p-2 font-mono text-xs leading-5 outline-none resize-none bg-transparent caret-[var(--vscode-editor-foreground)] text-transparent z-10"
                    :class="{ 'whitespace-pre-wrap break-all': isWordWrap, 'whitespace-pre': !isWordWrap }"
                ></textarea>

                <!-- Syntax Highlighted Display & Readonly Viewer -->
                <pre 
                    ref="preRef" 
                    @scroll="onScroll"
                    class="editor-highlight absolute inset-0 w-full h-full p-2 font-mono text-xs leading-5 overflow-auto m-0 pointer-events-auto bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)]"
                    :class="{ 'whitespace-pre-wrap break-all': isWordWrap, 'whitespace-pre': !isWordWrap }"
                    v-html="renderedCode"
                ></pre>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';

const props = defineProps({
    modelValue: { type: String, default: '' },
    readonly: { type: Boolean, default: false },
    language: { type: String, default: 'text' },
    placeholder: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue']);

const localCode = ref(props.modelValue || '');
const isWordWrap = ref(false);

// Undo / Redo History Stack
const undoStack = ref([]);
const redoStack = ref([]);
let isInternalChange = false;
let historyTimer = null;

watch(() => props.modelValue, (newVal) => {
    const val = newVal || '';
    localCode.value = val;
    if (!isInternalChange) {
        if (undoStack.value.length === 0 || undoStack.value[undoStack.value.length - 1] !== val) {
            undoStack.value.push(val);
            redoStack.value = [];
        }
    }
    isInternalChange = false;
}, { immediate: true });

function recordHistory(val) {
    if (historyTimer) clearTimeout(historyTimer);
    historyTimer = setTimeout(() => {
        if (undoStack.value.length === 0 || undoStack.value[undoStack.value.length - 1] !== val) {
            undoStack.value.push(val);
            if (undoStack.value.length > 100) undoStack.value.shift();
            redoStack.value = [];
        }
    }, 300);
}

function onInput(e) {
    const val = e.target.value;
    localCode.value = val;
    isInternalChange = true;
    emit('update:modelValue', val);
    recordHistory(val);
}

function onKeydown(e) {
    // Ctrl+Z or Cmd+Z (Undo)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (undoStack.value.length > 1) {
            const current = undoStack.value.pop();
            redoStack.value.push(current);
            const prev = undoStack.value[undoStack.value.length - 1];
            localCode.value = prev;
            isInternalChange = true;
            emit('update:modelValue', prev);
        }
        return;
    }

    // Ctrl+Y or Cmd+Shift+Z or Ctrl+Shift+Z (Redo)
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        if (redoStack.value.length > 0) {
            const next = redoStack.value.pop();
            undoStack.value.push(next);
            localCode.value = next;
            isInternalChange = true;
            emit('update:modelValue', next);
        }
        return;
    }

    // Tab key support (inserts 2 spaces)
    if (e.key === 'Tab' && !props.readonly) {
        e.preventDefault();
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        const text = localCode.value;
        const updated = text.substring(0, start) + '  ' + text.substring(end);
        localCode.value = updated;
        isInternalChange = true;
        emit('update:modelValue', updated);
        
        if (undoStack.value[undoStack.value.length - 1] !== updated) {
            undoStack.value.push(updated);
            redoStack.value = [];
        }

        nextTick(() => {
            if (textareaRef.value) {
                textareaRef.value.selectionStart = textareaRef.value.selectionEnd = start + 2;
            }
        });
        return;
    }
}

const formatError = ref('');
const copyStatus = ref('Copy');
const showSearch = ref(false);
const searchQuery = ref('');
const currentMatchIndex = ref(0);

const textareaRef = ref(null);
const preRef = ref(null);
const gutterRef = ref(null);
const searchInputRef = ref(null);

const lineCount = computed(() => {
    const val = localCode.value || '';
    if (!val) return 1;
    return val.split('\n').length;
});



function onScroll(e) {
    const scrollTop = e.target.scrollTop;
    const scrollLeft = e.target.scrollLeft;
    if (gutterRef.value) gutterRef.value.scrollTop = scrollTop;
    if (textareaRef.value && e.target !== textareaRef.value) {
        textareaRef.value.scrollTop = scrollTop;
        textareaRef.value.scrollLeft = scrollLeft;
    }
    if (preRef.value && e.target !== preRef.value) {
        preRef.value.scrollTop = scrollTop;
        preRef.value.scrollLeft = scrollLeft;
    }
}

function copyCode() {
    if (localCode.value) {
        navigator.clipboard.writeText(localCode.value);
        copyStatus.value = 'Copied!';
        setTimeout(() => { copyStatus.value = 'Copy'; }, 2000);
    }
}

function formatCode() {
    formatError.value = '';
    const code = localCode.value || '';
    if (!code.trim()) return;

    if (props.language === 'json' || code.trim().startsWith('{') || code.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(code);
            const formatted = JSON.stringify(parsed, null, 2);
            localCode.value = formatted;
            if (!props.readonly) {
                emit('update:modelValue', formatted);
            }
        } catch (err) {
            formatError.value = 'Invalid JSON';
            setTimeout(() => { formatError.value = ''; }, 3000);
        }
    } else if (['xml', 'html'].includes(props.language) || code.trim().startsWith('<')) {
        const formatted = formatXml(code);
        localCode.value = formatted;
        if (!props.readonly) {
            emit('update:modelValue', formatted);
        }
    }
}

function formatXml(xml) {
    let formatted = '';
    let indent = '';
    const tab = '  ';
    xml.split(/>\s*</).forEach(node => {
        if (node.match(/^\/\w/)) indent = indent.substring(tab.length);
        formatted += indent + '<' + node + '>\r\n';
        if (node.match(/^<?\w[^>]*[^\/]$/) && !node.startsWith('input')) indent += tab;
    });
    return formatted.substring(1, formatted.length - 3);
}

function toggleSearch() {
    showSearch.value = !showSearch.value;
    if (showSearch.value) {
        nextTick(() => {
            if (searchInputRef.value) searchInputRef.value.focus();
        });
    }
}

function openSearch() {
    showSearch.value = true;
    nextTick(() => {
        if (searchInputRef.value) searchInputRef.value.focus();
    });
}

const matches = computed(() => {
    if (!searchQuery.value || !localCode.value) return [];
    const query = searchQuery.value.toLowerCase();
    const text = localCode.value.toLowerCase();
    const result = [];
    let idx = text.indexOf(query);
    while (idx !== -1) {
        result.push(idx);
        idx = text.indexOf(query, idx + query.length);
    }
    return result;
});

function nextMatch() {
    if (matches.value.length === 0) return;
    currentMatchIndex.value = (currentMatchIndex.value + 1) % matches.value.length;
}

function prevMatch() {
    if (matches.value.length === 0) return;
    currentMatchIndex.value = (currentMatchIndex.value - 1 + matches.value.length) % matches.value.length;
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function highlightTokens(code, lang) {
    if (!code) return '';
    const escaped = escapeHtml(code);

    if (lang === 'json' || (code.trim().startsWith('{') || code.trim().startsWith('['))) {
        return escaped.replace(
            /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
            (match) => {
                let cls = 'token-number';
                if (/^"/.test(match)) {
                    cls = /:$/.test(match) ? 'token-key' : 'token-string';
                } else if (/true|false/.test(match)) {
                    cls = 'token-boolean';
                } else if (/null/.test(match)) {
                    cls = 'token-null';
                }
                return `<span class="${cls}">${match}</span>`;
            }
        );
    }

    if (lang === 'xml' || lang === 'html' || code.trim().startsWith('<')) {
        return escaped
            .replace(/(&lt;\/?[a-zA-Z0-9:-]+)/g, '<span class="token-tag">$1</span>')
            .replace(/([a-zA-Z0-9:-]+)=/g, '<span class="token-attr">$1</span>=')
            .replace(/(&quot;.*?&quot;)/g, '<span class="token-string">$1</span>');
    }

    return escaped;
}

const renderedCode = computed(() => {
    const raw = localCode.value || '';
    const highlighted = highlightTokens(raw, props.language);
    
    if (!showSearch.value || !searchQuery.value) {
        return highlighted;
    }

    // Apply Search Highlight overlay if active
    const q = searchQuery.value;
    if (!q) return highlighted;

    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return highlighted.replace(regex, '<mark class="token-search-match">$1</mark>');
});
</script>

<style scoped>
.code-editor-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    overflow: hidden;
    background-color: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
}

.editor-body {
    flex-grow: 1;
    display: flex;
    position: relative;
}

.line-numbers {
    box-sizing: border-box;
    overflow: hidden;
    user-select: none;
    background-color: var(--vscode-editorGutter-background, var(--vscode-editor-background));
    color: var(--vscode-editorLineNumber-foreground, #858585);
    border-right: 1px solid var(--vscode-editorLineNumber-activeForeground, var(--vscode-panel-border));
}

.content-wrapper {
    position: relative;
    flex-grow: 1;
    width: 100%;
    height: 100%;
}

.editor-textarea {
    box-sizing: border-box;
    white-space: pre;
    overflow-wrap: normal;
    tab-size: 2;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 12px);
    line-height: 1.25rem;
}

.editor-highlight {
    box-sizing: border-box;
    tab-size: 2;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 12px);
    line-height: 1.25rem;
}

:deep(.token-key) {
    color: var(--vscode-symbolIcon-propertyForeground, var(--vscode-editor-foreground, #0451a5));
    font-weight: 600;
}

:deep(.token-string) {
    color: var(--vscode-symbolIcon-stringForeground, #ce9178);
}

:deep(.token-number) {
    color: var(--vscode-symbolIcon-numberForeground, #b5cea8);
}

:deep(.token-boolean), :deep(.token-null) {
    color: var(--vscode-symbolIcon-keywordForeground, #569cd6);
}

:deep(.token-tag) {
    color: var(--vscode-symbolIcon-keywordForeground, #569cd6);
    font-weight: 600;
}

:deep(.token-attr) {
    color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
}

:deep(.token-search-match) {
    background-color: var(--vscode-editor-findMatchHighlightBackground, rgba(234, 179, 8, 0.4));
    color: var(--vscode-editor-foreground);
    outline: 1px solid var(--vscode-editor-findMatchBorder, #eab308);
    border-radius: 2px;
}
</style>
