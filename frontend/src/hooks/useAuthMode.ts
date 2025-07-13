import { useState, useEffect, useCallback } from "react";

export type AuthMode = "api_key" | "subscription" | "auto";
export type AuthStatus = "api_key" | "subscription" | "unknown";

interface UseAuthModeReturn {
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  currentAuthStatus: AuthStatus;
  setCurrentAuthStatus: (status: AuthStatus) => void;
  isLoading: boolean;
  error: string | null;
}

const AUTH_MODE_STORAGE_KEY = "claude-webui-auth-mode";

export function useAuthMode(): UseAuthModeReturn {
  const [authMode, setAuthModeState] = useState<AuthMode>("auto");
  const [currentAuthStatus, setCurrentAuthStatus] =
    useState<AuthStatus>("unknown");
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  // Load auth mode from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(AUTH_MODE_STORAGE_KEY);
    if (saved && ["api_key", "subscription", "auto"].includes(saved)) {
      setAuthModeState(saved as AuthMode);
    }
  }, []);

  // Save auth mode to localStorage
  const setAuthMode = useCallback((mode: AuthMode) => {
    setAuthModeState(mode);
    localStorage.setItem(AUTH_MODE_STORAGE_KEY, mode);
  }, []);

  return {
    authMode,
    setAuthMode,
    currentAuthStatus,
    setCurrentAuthStatus,
    isLoading,
    error,
  };
}

// Helper function to map SDK apiKeySource to our AuthStatus
export function mapApiKeySourceToAuthStatus(apiKeySource: string): AuthStatus {
  switch (apiKeySource) {
    case "temporary":
      return "subscription";
    case "user":
    case "project":
    case "org":
      return "api_key";
    default:
      return "unknown";
  }
}

// Helper function to get display name for auth mode
export function getAuthModeDisplayName(mode: AuthMode): string {
  switch (mode) {
    case "api_key":
      return "API Key";
    case "subscription":
      return "Subscription";
    case "auto":
      return "Auto";
    default:
      return "Unknown";
  }
}

// Helper function to get display name for auth status
export function getAuthStatusDisplayName(status: AuthStatus): string {
  switch (status) {
    case "api_key":
      return "API Key";
    case "subscription":
      return "Subscription";
    case "unknown":
      return "Unknown";
    default:
      return "Unknown";
  }
}
