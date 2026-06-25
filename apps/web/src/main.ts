import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import "./echarts";
import { type OfflineData, useAnalysis } from "./stores/analysis";
import "./style.css";

const pinia = createPinia();
const app = createApp(App).use(pinia);

// exported single-file build embeds its data here → boot straight into the dashboard, no server
const embedded = (window as unknown as { __SPOTILYZE__?: OfflineData }).__SPOTILYZE__;
if (embedded) useAnalysis(pinia).hydrateOffline(embedded);

app.mount("#app");
