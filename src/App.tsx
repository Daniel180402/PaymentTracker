import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useStore } from "./store";
import { Sidebar } from "./components/Sidebar";
import { CurrentMonth } from "./views/CurrentMonth";
import { Summary } from "./views/Summary";
import { Account } from "./views/Account";

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
    </div>
  );
}

export default App;
