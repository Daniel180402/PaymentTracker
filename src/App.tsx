import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useStore } from "./store";
import { Sidebar } from "./components/Sidebar";
import { CurrentMonth } from "./views/CurrentMonth";
import { Summary } from "./views/Summary";
import { Account } from "./views/Account";
import { IconX } from "./components/icons";

function App() {
  const init = useStore((s) => s.init);
  const loaded = useStore((s) => s.loaded);
  const view = useStore((s) => s.view);

  useEffect(() => {
    void init();
  }, [init]);

  if (!loaded) {
    return (
      <div className="grid place-items-center h-full text-slate-500 text-sm">
        Caricamento…
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="h-full"
          >
            {view === "month" && <CurrentMonth />}
            {view === "summary" && <Summary />}
            {view === "account" && <Account />}
          </motion.div>
        </AnimatePresence>
      </main>
      <SyncNotice />
    </div>
  );
}

function SyncNotice() {
  const notice = useStore((s) => s.syncNotice);
  const dismiss = useStore((s) => s.dismissSyncNotice);
  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className={`fixed bottom-5 right-5 z-50 max-w-sm flex gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl shadow-black/40 bg-ink-850 ${
            notice.tone === "warn" ? "border-bad-500/40 text-slate-200" : "border-brand-500/40 text-slate-200"
          }`}
        >
          <span className="flex-1">{notice.text}</span>
          <button
            onClick={dismiss}
            className="self-start text-slate-500 hover:text-white transition"
            title="Chiudi"
          >
            <IconX size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default App;
