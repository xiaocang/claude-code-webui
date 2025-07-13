import { useState, useEffect } from "react";

const STORAGE_KEY = "claude-webui-plan-mode";

export function usePlanMode() {
  const [planMode, setPlanMode] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Initialize plan mode on client side
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved !== null) {
      setPlanMode(saved === "true");
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;

    localStorage.setItem(STORAGE_KEY, planMode.toString());
  }, [planMode, isInitialized]);

  const togglePlanMode = () => {
    setPlanMode((prev) => !prev);
  };

  return { planMode, setPlanMode, togglePlanMode };
}
