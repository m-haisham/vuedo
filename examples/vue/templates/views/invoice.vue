<template>
  <section class="invoice-body px-10 py-8 text-slate-800">
    <div class="mb-8">
      <div class="text-xs uppercase tracking-widest text-slate-400 mb-1">
        Billed to
      </div>
      <div class="text-lg font-semibold">{{ billTo.name }}</div>
      <div v-if="billTo.company" class="text-slate-600">
        {{ billTo.company }}
      </div>
      <div class="text-slate-600 whitespace-pre-line">{{ billTo.address }}</div>
    </div>

    <table class="w-full text-sm border-collapse">
      <thead>
        <tr
          class="border-b-2 border-slate-900 text-left text-slate-500 uppercase text-xs tracking-wider"
        >
          <th class="py-2 font-medium">Description</th>
          <th class="py-2 text-right font-medium">Qty</th>
          <th class="py-2 text-right font-medium">Unit</th>
          <th class="py-2 text-right font-medium">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(item, i) in items"
          :key="i"
          class="border-b border-slate-200"
        >
          <td class="py-2">{{ item.description }}</td>
          <td class="py-2 text-right tabular-nums">{{ item.qty }}</td>
          <td class="py-2 text-right">
            <MoneyAmount :amount="item.unitPrice" />
          </td>
          <td class="py-2 text-right">
            <MoneyAmount :amount="item.unitPrice * item.qty" />
          </td>
        </tr>
      </tbody>
    </table>

    <div class="flex justify-end mt-6">
      <div class="w-64 text-sm">
        <div class="flex justify-between py-1 text-slate-600">
          <span>Subtotal</span>
          <MoneyAmount :amount="subtotal" />
        </div>
        <div class="flex justify-between py-1 text-slate-600">
          <span>Tax ({{ Math.round(taxRate * 100) }}%)</span>
          <MoneyAmount :amount="subtotal * taxRate" />
        </div>
        <div
          class="flex justify-between py-2 mt-1 border-t-2 border-slate-900 font-bold text-lg"
        >
          <span>Total</span>
          <MoneyAmount :amount="subtotal * (1 + taxRate)" bold />
        </div>
      </div>
    </div>

    <p v-if="notes" class="mt-8 text-xs text-slate-400 italic">{{ notes }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import MoneyAmount from "../components/MoneyAmount.vue";

const props = defineProps<{
  billTo: { name: string; company?: string; address: string };
  items: { description: string; qty: number; unitPrice: number }[];
  taxRate: number;
  notes?: string;
}>();

const subtotal = computed(() =>
  props.items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0),
);
</script>
