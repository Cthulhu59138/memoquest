import { useEffect, useState } from "react";

export default function ServiceWorkerRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let disposed = false;
    let refreshing = false;
    const onControllerChange = () => {
      if (!refreshing) { refreshing = true; window.location.reload(); }
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
      if (disposed) return;
      if (registration.waiting) setWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (!disposed && worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker);
        });
      });
      void registration.update().catch(() => {});
    }).catch(() => {});
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
  if (!waiting) return null;
  return <aside className="update-notice" role="status">
    <span>Une nouvelle version est prête. Termine ta session avant de l’ouvrir.</span>
    <button onClick={() => waiting.postMessage({ type: "ACTIVATE_UPDATE" })}>Mettre à jour</button>
    <button aria-label="Reporter la mise à jour" onClick={() => setWaiting(null)}>Plus tard</button>
  </aside>;
}
