import { recordAppOpen } from "./services/appAnalytics.js?v=1";

window.addEventListener("load", () => {
  recordAppOpen().catch(() => {});
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js")
      .then((registration) => {
        console.log("Service Worker registrado:", registration.scope);
      })
      .catch((error) => {
        console.error("Erro ao registrar Service Worker:", error);
      });
  });
}
