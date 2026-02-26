(function () {
  "use strict";

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("sw.js").catch(function (error) {
      console.error("Service worker registration failed:", error);
    });
  }

  window.addEventListener("load", registerServiceWorker);
})();
