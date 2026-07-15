import { createApp } from "vue";
import Invoice from "../templates/Invoice.vue";
import fixture from "./fixtures/invoice.sample.json";

const params = new URLSearchParams(window.location.search);
const templateName = params.get("template") ?? "Invoice";

// The dev preview mounts a single template with sample fixture data. Extend this
// map as new templates are added. Falls back to Invoice for unknown names.
const templates: Record<string, unknown> = {
  Invoice,
};

const component = (templates[templateName] as never) ?? Invoice;
createApp(component, fixture).mount("#app");
