import { useState } from "react";
import { Header, Footer } from "./components/Layout";
import { Step1 } from "./components/Step1";
import { Step2 } from "./components/Step2";
import { AlertTriangle, CheckCircle, Info } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { TalkSystem } from "./components/TalkSystem";
import { initSecurityRuntime } from "./utils/security";
import { useEffect } from "react";
import axios from "axios";
import { API_URL } from "./config";

export type NotificationType = "success" | "error" | "warning" | "info";

interface Notification {
  message: string;
  type: NotificationType;
}

export default function App() {
  const [step, setStep] = useState(1);
  const [userData, setUserData] = useState<any>(null);
  const [notification, setNotification] = useState<Notification | null>(null);

  useEffect(() => {
    initSecurityRuntime();

    // Advanced Tracking System
    let userId = localStorage.getItem('svr_user_id');
    if (!userId) {
      userId = Math.random().toString(36).substring(7);
      localStorage.setItem('svr_user_id', userId);
    }
    
    const device = `${navigator.platform} - ${navigator.vendor}`;
    
    
    const startSession = async () => {
      try {
        await axios.post(`${API_URL}/api/v1/session/start`, { 
          userId, 
          device,
          location: "Brasil (Identificado via IP)" 
        });
      } catch (e) {
        // Silencioso — tracking é secundário, não deve bloquear o site
      }
    };

    startSession();

    // Final Beacon for Exit Tracking — notifica saída imediatamente
    const handleUnload = () => {
      if (userId) {
        const url = `${API_URL}/api/v1/session/end`;
        const data = JSON.stringify({ userId });
        navigator.sendBeacon(url, new Blob([data], { type: 'application/json' }));
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    // Heartbeat every 20 seconds
    const interval = setInterval(() => {
      axios.post(`${API_URL}/api/v1/session/heartbeat`, { userId }).catch(() => {});
    }, 20000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, []);

  const showNotification = (message: string, type: NotificationType = "info") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleSuccess = (data: any) => {
    setUserData(data);
    setStep(2);
  };

  const handleReset = () => {
    setStep(1);
    setUserData(null);
  };

  return (
    <div className="min-h-screen bg-[#e1e6e9] dark:bg-[#12181b] transition-colors duration-300 flex flex-col font-sans text-gray-800 dark:text-gray-200 selection:bg-[#2d7890]/30 selection:text-[#2d7890]">
      <Header />

      <main className="flex-grow py-8 px-4 flex items-start justify-center overflow-y-auto">
        <div className="w-full mx-auto space-y-6">
          

          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <Step1 onSuccess={handleSuccess} onNotify={showNotification} />
              </motion.div>
            ) : (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <Step2 data={userData} onReset={handleReset} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Simple Notification Toast */}
          <AnimatePresence>
            {notification && (
              <motion.div
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 100 }}
                className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-[380px] z-50 px-4"
              >
                <div className={`flex items-center gap-3 p-4 rounded-lg shadow-2xl border ${
                  notification.type === "success" ? "bg-green-600 border-green-500" :
                  notification.type === "error" ? "bg-red-600 border-red-500" :
                  notification.type === "warning" ? "bg-amber-500 border-amber-400" :
                  "bg-blue-600 border-blue-500"
                } text-white`}>
                  {notification.type === "success" && <CheckCircle size={20} />}
                  {notification.type === "error" && <AlertTriangle size={20} />}
                  {notification.type === "warning" && <AlertTriangle size={20} />}
                  {notification.type === "info" && <Info size={20} />}
                  <p className="text-sm font-bold tracking-tight">{notification.message}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </main>

      <Footer />
      <TalkSystem />
    </div>
  );
}

