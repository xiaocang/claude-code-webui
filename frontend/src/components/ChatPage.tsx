import { useEffect, useCallback, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import type {
  ChatRequest,
  ChatMessage,
  ProjectInfo,
  StreamResponse,
} from "../types";
import { useTheme } from "../hooks/useTheme";
import { useClaudeStreaming } from "../hooks/useClaudeStreaming";
import { useChatState } from "../hooks/chat/useChatState";
import { usePermissions } from "../hooks/chat/usePermissions";
import { useAbortController } from "../hooks/chat/useAbortController";
import { useAutoHistoryLoader } from "../hooks/useHistoryLoader";
import { useNetworkRecovery } from "../hooks/useNetworkRecovery";
import { ThemeToggle } from "./chat/ThemeToggle";
import { HistoryButton } from "./chat/HistoryButton";
import { ChatInput } from "./chat/ChatInput";
import { ChatMessages } from "./chat/ChatMessages";
import { PermissionDialog } from "./PermissionDialog";
import { HistoryView } from "./HistoryView";
import { getChatUrl, getProjectsUrl } from "../config/api";
import { KEYBOARD_SHORTCUTS } from "../utils/constants";
import type { StreamingContext } from "../hooks/streaming/useMessageProcessor";

export function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);

  // Extract and normalize working directory from URL
  const workingDirectory = (() => {
    const rawPath = location.pathname.replace("/projects", "");
    if (!rawPath) return undefined;

    // URL decode the path
    const decodedPath = decodeURIComponent(rawPath);

    return decodedPath;
  })();

  // Get current view and sessionId from query parameters
  const currentView = searchParams.get("view");
  const sessionId = searchParams.get("sessionId");
  const isHistoryView = currentView === "history";
  const isLoadedConversation = !!sessionId && !isHistoryView;

  const { theme, toggleTheme } = useTheme();
  const { processStreamLine } = useClaudeStreaming();
  const { abortRequest, createAbortHandler } = useAbortController();

  // Get encoded name for current working directory
  const getEncodedName = useCallback(() => {
    if (!workingDirectory || !projects.length) {
      return null;
    }

    const project = projects.find((p) => p.path === workingDirectory);
    return project?.encodedName || null;
  }, [workingDirectory, projects]);

  // Load conversation history if sessionId is provided
  const {
    messages: historyMessages,
    loading: historyLoading,
    error: historyError,
    sessionId: loadedSessionId,
  } = useAutoHistoryLoader(
    getEncodedName() || undefined,
    sessionId || undefined,
  );

  // Initialize chat state with loaded history
  const {
    messages,
    input,
    isLoading,
    currentSessionId,
    currentRequestId,
    hasShownInitMessage,
    currentAssistantMessage,
    setInput,
    setCurrentSessionId,
    setHasShownInitMessage,
    setHasReceivedInit,
    setCurrentAssistantMessage,
    addMessage,
    updateLastMessage,
    clearInput,
    generateRequestId,
    resetRequestState,
    startRequest,
  } = useChatState({
    initialMessages: historyMessages,
    initialSessionId: loadedSessionId || undefined,
  });

  const {
    isRecovering,
    retryCount,
    trackMessage,
    resetTracking,
    handleNetworkError,
    cleanup: cleanupNetworkRecovery,
  } = useNetworkRecovery({
    onNetworkError: () => {
      console.log("Network error detected, attempting recovery...");
    },
    onRecoverySuccess: () => {
      console.log("Successfully recovered from network error");
    },
    onRecoveryFailed: () => {
      console.error("Failed to recover from network error");
      addMessage({
        type: "chat",
        role: "assistant",
        content:
          "Network connection lost and could not be recovered. Please check your connection and try again.",
        timestamp: Date.now(),
      });
      resetRequestState();
    },
  });

  // Cleanup network recovery on unmount
  useEffect(() => {
    return () => {
      cleanupNetworkRecovery();
    };
  }, [cleanupNetworkRecovery]);

  const {
    allowedTools,
    permissionDialog,
    showPermissionDialog,
    closePermissionDialog,
    allowToolTemporary,
    allowToolPermanent,
  } = usePermissions();

  const handlePermissionError = useCallback(
    (toolName: string, patterns: string[], toolUseId: string) => {
      showPermissionDialog(toolName, patterns, toolUseId);
    },
    [showPermissionDialog],
  );

  const sendMessage = useCallback(
    async (
      messageContent?: string,
      tools?: string[],
      hideUserMessage = false,
    ) => {
      const content = messageContent || input.trim();
      if (!content || isLoading) return;

      const requestId = generateRequestId();

      // Only add user message to chat if not hidden
      if (!hideUserMessage) {
        const userMessage: ChatMessage = {
          type: "chat",
          role: "user",
          content: content,
          timestamp: Date.now(),
        };
        addMessage(userMessage);
      }

      if (!messageContent) clearInput();
      startRequest();
      resetTracking(); // Reset message tracking for new request

      // Local state for this streaming session
      let localHasReceivedInit = false;
      let shouldAbort = false;

      const streamingContext: StreamingContext = {
        currentAssistantMessage,
        setCurrentAssistantMessage,
        addMessage,
        updateLastMessage,
        onSessionId: setCurrentSessionId,
        shouldShowInitMessage: () => !hasShownInitMessage,
        onInitMessageShown: () => setHasShownInitMessage(true),
        get hasReceivedInit() {
          return localHasReceivedInit;
        },
        setHasReceivedInit: (received: boolean) => {
          localHasReceivedInit = received;
          setHasReceivedInit(received);
        },
        onPermissionError: handlePermissionError,
        onAbortRequest: async () => {
          shouldAbort = true;
          await createAbortHandler(requestId)();
        },
      };

      try {
        const response = await fetch(getChatUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            requestId,
            ...(currentSessionId ? { sessionId: currentSessionId } : {}),
            allowedTools: tools || allowedTools,
            ...(workingDirectory ? { workingDirectory } : {}),
          } as ChatRequest),
        });

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done || shouldAbort) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n").filter((line) => line.trim());

          for (const line of lines) {
            if (shouldAbort) break;

            // Track message for recovery
            trackMessage(line);

            processStreamLine(line, streamingContext);
          }

          if (shouldAbort) break;
        }
      } catch (error) {
        console.error("Failed to send message:", error);

        // Try network recovery if applicable
        const recovered = await handleNetworkError(
          error,
          requestId,
          (resumedMessages: StreamResponse[]) => {
            // Process resumed messages
            for (const message of resumedMessages) {
              const line = JSON.stringify(message);
              processStreamLine(line, streamingContext);
            }
          },
        );

        if (!recovered) {
          // Non-network error or recovery failed
          addMessage({
            type: "chat",
            role: "assistant",
            content: "Error: Failed to get response",
            timestamp: Date.now(),
          });
        }
      } finally {
        if (!isRecovering) {
          resetRequestState();
        }
      }
    },
    [
      input,
      isLoading,
      currentSessionId,
      allowedTools,
      hasShownInitMessage,
      currentAssistantMessage,
      workingDirectory,
      generateRequestId,
      clearInput,
      startRequest,
      addMessage,
      updateLastMessage,
      setCurrentSessionId,
      setHasShownInitMessage,
      setHasReceivedInit,
      setCurrentAssistantMessage,
      resetRequestState,
      processStreamLine,
      handlePermissionError,
      createAbortHandler,
      trackMessage,
      resetTracking,
      handleNetworkError,
      isRecovering,
    ],
  );

  const handleAbort = useCallback(() => {
    abortRequest(currentRequestId, isLoading, resetRequestState);
  }, [abortRequest, currentRequestId, isLoading, resetRequestState]);

  // Permission dialog handlers
  const handlePermissionAllow = useCallback(() => {
    if (!permissionDialog) return;

    // Add all patterns temporarily
    let updatedAllowedTools = allowedTools;
    permissionDialog.patterns.forEach((pattern) => {
      updatedAllowedTools = allowToolTemporary(pattern, updatedAllowedTools);
    });

    closePermissionDialog();

    if (currentSessionId) {
      sendMessage("continue", updatedAllowedTools, true);
    }
  }, [
    permissionDialog,
    currentSessionId,
    sendMessage,
    allowedTools,
    allowToolTemporary,
    closePermissionDialog,
  ]);

  const handlePermissionAllowPermanent = useCallback(() => {
    if (!permissionDialog) return;

    // Add all patterns permanently
    let updatedAllowedTools = allowedTools;
    permissionDialog.patterns.forEach((pattern) => {
      updatedAllowedTools = allowToolPermanent(pattern, updatedAllowedTools);
    });

    closePermissionDialog();

    if (currentSessionId) {
      sendMessage("continue", updatedAllowedTools, true);
    }
  }, [
    permissionDialog,
    currentSessionId,
    sendMessage,
    allowedTools,
    allowToolPermanent,
    closePermissionDialog,
  ]);

  const handlePermissionDeny = useCallback(() => {
    closePermissionDialog();
  }, [closePermissionDialog]);

  const handleHistoryClick = useCallback(() => {
    const searchParams = new URLSearchParams();
    searchParams.set("view", "history");
    navigate({ search: searchParams.toString() });
  }, [navigate]);

  // Load projects to get encodedName mapping
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await fetch(getProjectsUrl());
        if (response.ok) {
          const data = await response.json();
          setProjects(data.projects || []);
        }
      } catch (error) {
        console.error("Failed to load projects:", error);
      }
    };
    loadProjects();
  }, []);

  const handleBackToChat = useCallback(() => {
    navigate({ search: "" });
  }, [navigate]);

  const handleBackToHistory = useCallback(() => {
    const searchParams = new URLSearchParams();
    searchParams.set("view", "history");
    navigate({ search: searchParams.toString() });
  }, [navigate]);

  const handleBackToProjects = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const handleBackToProjectChat = useCallback(() => {
    if (workingDirectory) {
      navigate(`/projects${workingDirectory}`);
    }
  }, [navigate, workingDirectory]);

  // Handle global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === KEYBOARD_SHORTCUTS.ABORT && isLoading && currentRequestId) {
        e.preventDefault();
        handleAbort();
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isLoading, currentRequestId, handleAbort]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      <div className="max-w-6xl mx-auto p-6 h-screen flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-shrink-0">
          <div className="flex items-center gap-4">
            {isHistoryView && (
              <button
                onClick={handleBackToChat}
                className="p-2 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 backdrop-blur-sm shadow-sm hover:shadow-md"
                aria-label="Back to chat"
              >
                <ChevronLeftIcon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>
            )}
            {isLoadedConversation && (
              <button
                onClick={handleBackToHistory}
                className="p-2 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 backdrop-blur-sm shadow-sm hover:shadow-md"
                aria-label="Back to history"
              >
                <ChevronLeftIcon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>
            )}
            <div>
              <nav aria-label="Breadcrumb">
                <div className="flex items-center">
                  <button
                    onClick={handleBackToProjects}
                    className="text-slate-800 dark:text-slate-100 text-3xl font-bold tracking-tight hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 rounded-md px-1 -mx-1"
                    aria-label="Back to project selection"
                  >
                    Claude Code Web UI
                  </button>
                  {(isHistoryView || sessionId) && (
                    <>
                      <span
                        className="text-slate-800 dark:text-slate-100 text-3xl font-bold tracking-tight mx-3 select-none"
                        aria-hidden="true"
                      >
                        {" "}
                        ›{" "}
                      </span>
                      <h1
                        className="text-slate-800 dark:text-slate-100 text-3xl font-bold tracking-tight"
                        aria-current="page"
                      >
                        {isHistoryView
                          ? "Conversation History"
                          : "Conversation"}
                      </h1>
                    </>
                  )}
                </div>
              </nav>
              {workingDirectory && (
                <div className="flex items-center text-sm font-mono mt-1">
                  <button
                    onClick={handleBackToProjectChat}
                    className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 rounded px-1 -mx-1 cursor-pointer"
                    aria-label={`Return to new chat in ${workingDirectory}`}
                  >
                    {workingDirectory}
                  </button>
                  {sessionId && (
                    <span className="ml-2 text-xs text-slate-600 dark:text-slate-400">
                      Session: {sessionId.substring(0, 8)}...
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!isHistoryView && <HistoryButton onClick={handleHistoryClick} />}
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </div>

        {/* Main Content */}
        {isHistoryView ? (
          <HistoryView
            workingDirectory={workingDirectory || ""}
            encodedName={getEncodedName()}
            onBack={handleBackToChat}
          />
        ) : historyLoading ? (
          /* Loading conversation history */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 dark:text-slate-400">
                Loading conversation history...
              </p>
            </div>
          </div>
        ) : historyError ? (
          /* Error loading conversation history */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h2 className="text-slate-800 dark:text-slate-100 text-xl font-semibold mb-2">
                Error Loading Conversation
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
                {historyError}
              </p>
              <button
                onClick={() => navigate({ search: "" })}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Start New Conversation
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Messages */}
            <ChatMessages messages={messages} isLoading={isLoading} />

            {/* Network Recovery Status */}
            {isRecovering && (
              <div className="px-4 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                Reconnecting... (Attempt {retryCount})
              </div>
            )}

            {/* Input */}
            <ChatInput
              input={input}
              isLoading={isLoading}
              currentRequestId={currentRequestId}
              onInputChange={setInput}
              onSubmit={() => sendMessage()}
              onAbort={handleAbort}
            />
          </>
        )}
      </div>

      {/* Permission Dialog */}
      {permissionDialog && (
        <PermissionDialog
          isOpen={permissionDialog.isOpen}
          patterns={permissionDialog.patterns}
          onAllow={handlePermissionAllow}
          onAllowPermanent={handlePermissionAllowPermanent}
          onDeny={handlePermissionDeny}
          onClose={closePermissionDialog}
        />
      )}
    </div>
  );
}
