import cron from "node-cron";
import { syncAllStock } from "../services/syncStockService.js";

const enabled = String(process.env.ENABLE_STOCK_CRON ?? "").trim().toLowerCase() === "true";

if (enabled) {
  cron.schedule(
    "0 */2 * * *",
    async () => {
      console.log("[CRON] Running stock sync...");
      try {
        await syncAllStock();
      } catch (err) {
        console.error("[CRON ERROR]", err);
      }
    },
  );
  console.info("[CRON] Stock sync programado cada 2 h (ENABLE_STOCK_CRON=true).");
} else {
  console.info("[CRON] Stock sync desactivado (ENABLE_STOCK_CRON no es true).");
}
