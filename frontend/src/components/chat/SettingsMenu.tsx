import { useState, useRef, useEffect } from "react";
import { CogIcon } from "@heroicons/react/24/outline";
import {
  DocumentTextIcon,
  PlayIcon,
  KeyIcon,
  TicketIcon,
} from "@heroicons/react/24/solid";
import type { AuthMode } from "../../hooks/useAuthMode";
import { getAuthModeDisplayName } from "../../hooks/useAuthMode";

interface SettingsMenuProps {
  planMode: boolean;
  onPlanModeToggle: () => void;
  authMode: AuthMode;
  onAuthModeToggle: () => void;
  onOpenChange?: (isOpen: boolean) => void;
}

export function SettingsMenu({
  planMode,
  onPlanModeToggle,
  authMode,
  onAuthModeToggle,
  onOpenChange,
}: SettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Notify parent when open state changes
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen]);

  const handlePlanModeToggle = () => {
    onPlanModeToggle();
    setIsOpen(false);
  };

  const handleAuthModeToggle = () => {
    onAuthModeToggle();
    setIsOpen(false);
  };

  // Get icon for auth mode
  const getAuthModeIcon = () => {
    switch (authMode) {
      case "api_key":
        return <KeyIcon className="w-5 h-5" />;
      case "subscription":
        return <TicketIcon className="w-5 h-5" />;
      case "auto":
        return <CogIcon className="w-5 h-5" />;
      default:
        return <CogIcon className="w-5 h-5" />;
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 backdrop-blur-sm shadow-sm hover:shadow-md"
        title="Settings"
        aria-label="Open settings menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <CogIcon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden min-w-[200px] z-40">
          {/* Plan Mode Toggle */}
          <button
            type="button"
            onClick={handlePlanModeToggle}
            className="flex items-center gap-3 px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors w-full text-left"
          >
            <div
              className={`${planMode ? "text-green-600 dark:text-green-400" : "text-slate-600 dark:text-slate-400"}`}
            >
              {planMode ? (
                <DocumentTextIcon className="w-5 h-5" />
              ) : (
                <PlayIcon className="w-5 h-5" />
              )}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {planMode ? "Plan Mode" : "Normal Mode"}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {planMode
                  ? "Claude outlines steps"
                  : "Claude executes directly"}
              </div>
            </div>
            {/* Status indicator */}
            <div
              className={`w-2 h-2 rounded-full ${
                planMode ? "bg-green-500" : "bg-slate-400"
              }`}
            />
          </button>

          {/* Auth Mode Toggle */}
          <button
            type="button"
            onClick={handleAuthModeToggle}
            className="flex items-center gap-3 px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors w-full text-left"
          >
            <div className="text-slate-600 dark:text-slate-400">
              {getAuthModeIcon()}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {getAuthModeDisplayName(authMode)}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Click to switch auth mode
              </div>
            </div>
            {/* Mode cycle indicator */}
            <div className="text-xs text-slate-400 dark:text-slate-500">
              {authMode === "auto" && "→ API Key"}
              {authMode === "api_key" && "→ Subscription"}
              {authMode === "subscription" && "→ Auto"}
            </div>
          </button>

          {/* Divider */}
          <div className="border-t border-slate-200 dark:border-slate-700 my-1" />

          {/* Help text */}
          <div className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="font-medium mb-1">Plan Mode:</div>
            <div>
              Claude will outline implementation steps before executing any code
              changes.
            </div>
            <div className="font-medium mb-1 mt-2">Auth Mode:</div>
            <div>
              Control how Claude authenticates: Auto (default), API Key, or
              Subscription.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
