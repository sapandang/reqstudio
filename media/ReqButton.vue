<template>
    <button 
        :type="type" 
        :disabled="disabled" 
        :title="title"
        class="req-btn select-none font-medium transition-all duration-150 focus:outline-none flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        :class="variantClasses"
    >
        <slot></slot>
    </button>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    variant: { type: String, default: 'primary' }, // 'primary' | 'secondary' | 'icon' | 'subtle' | 'danger'
    disabled: { type: Boolean, default: false },
    title: { type: String, default: '' },
    type: { type: String, default: 'button' }
});

const variantClasses = computed(() => {
    switch (props.variant) {
        case 'secondary':
            return 'px-3 py-1 text-xs rounded border border-[var(--vscode-panel-border,transparent)] bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] active:scale-95';
        case 'icon':
            return 'p-1.5 text-xs rounded text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] active:bg-[var(--vscode-toolbar-activeBackground)]';
        case 'subtle':
            return 'px-2.5 py-1 text-xs rounded border border-[var(--vscode-panel-border)] bg-transparent text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] active:bg-[var(--vscode-toolbar-activeBackground)]';
        case 'danger':
            return 'px-2 py-0.5 text-xs rounded border border-red-500/30 text-red-500 hover:bg-red-500/10 active:scale-95';
        default: // primary
            return 'px-3.5 py-1.5 text-xs rounded font-semibold border border-[var(--vscode-button-border,transparent)] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] active:scale-95 shadow-sm';
    }
});
</script>
