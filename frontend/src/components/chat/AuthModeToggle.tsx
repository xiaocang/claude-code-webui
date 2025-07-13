import { KeyIcon, TicketIcon, CogIcon } from "@heroicons/react/24/outline";
import type { AuthMode, AuthStatus } from "../../hooks/useAuthMode";
import { getAuthModeDisplayName, getAuthStatusDisplayName } from "../../hooks/useAuthMode";

interface AuthModeToggleProps {
  authMode: AuthMode;
  currentAuthStatus: AuthStatus;
  onToggle: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export function AuthModeToggle({ 
  authMode, 
  currentAuthStatus, 
  onToggle, 
  isLoading = false,
  error = null 
}: AuthModeToggleProps) {
  // Get appropriate icon based on current auth mode
  const getIcon = () => {
    switch (authMode) {
      case 'api_key':
        return <KeyIcon className="w-5 h-5" />;
      case 'subscription':
        return <TicketIcon className="w-5 h-5" />;
      case 'auto':
        return <CogIcon className="w-5 h-5" />;
      default:
        return <CogIcon className="w-5 h-5" />;
    }
  };

  // Get status indicator color
  const getStatusColor = () => {
    if (error) return "text-red-500";
    if (isLoading) return "text-yellow-500";
    
    // Show green if the current status matches the selected mode (or auto)
    if (authMode === 'auto' || 
        (authMode === 'api_key' && currentAuthStatus === 'api_key') ||
        (authMode === 'subscription' && currentAuthStatus === 'subscription')) {
      return "text-green-500";
    }
    
    return "text-slate-600 dark:text-slate-400";
  };

  // Get tooltip text
  const getTooltipText = () => {
    if (error) return `Error: ${error}`;
    if (isLoading) return "Switching authentication mode...";
    
    const modeText = getAuthModeDisplayName(authMode);
    const statusText = getAuthStatusDisplayName(currentAuthStatus);
    
    if (authMode === 'auto') {
      return `Mode: ${modeText} (Currently: ${statusText})`;
    }
    
    return `Mode: ${modeText} | Status: ${statusText}`;
  };

  return (
    <button
      onClick={onToggle}
      disabled={isLoading}
      className="p-3 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 backdrop-blur-sm shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label="Toggle authentication mode"
      title={getTooltipText()}
    >
      <div className="flex items-center gap-2">
        <div className={`${getStatusColor()} ${isLoading ? 'animate-pulse' : ''}`}>
          {getIcon()}
        </div>
        {/* Status dot */}
        <div 
          className={`w-2 h-2 rounded-full ${
            error ? 'bg-red-500' : 
            isLoading ? 'bg-yellow-500 animate-pulse' : 
            'bg-green-500'
          }`}
        />
      </div>
    </button>
  );
}