<template>
    <header
        class="invoice-header bg-slate-900 text-white px-10 pt-8 pb-6 flex items-start justify-between"
    >
        <div>
            <div class="text-2xl font-bold tracking-tight">
                {{ companyName }}
            </div>
            <div class="text-slate-300 text-sm mt-1">{{ companyEmail }}</div>
        </div>
        <div class="text-right">
            <div class="text-xs uppercase tracking-[0.3em] text-slate-400">
                Invoice
            </div>
            <div class="text-xl font-semibold mt-0.5">{{ invoiceNumber }}</div>
            <div class="text-slate-300 text-sm mt-1">
                Issued {{ issueDate }}
            </div>
            <div class="text-slate-300 text-sm">Due {{ dueDate }}</div>
        </div>
    </header>
</template>

<script setup lang="ts">
defineProps<{
    companyName: string;
    companyEmail: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate: string;
}>();
</script>
