/**
 * Streaming file management utilities
 * Handles writing, reading, and cleaning up streaming response files
 */

import type { Runtime } from "../runtime/types.ts";
import type { StreamResponse } from "../../shared/types.ts";
import { RequestStatus } from "../../shared/types.ts";

export interface StreamingFileInfo {
  requestId: string;
  filePath: string;
  status: RequestStatus;
  totalMessages: number;
  lastUpdated: Date;
}

// In-memory store for request statuses
const requestStatuses = new Map<string, StreamingFileInfo>();

// Cleanup interval (5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// Start periodic cleanup
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startCleanupInterval(runtime: Runtime) {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    cleanupExpiredFiles(runtime);
  }, CLEANUP_INTERVAL_MS);
}

export function stopCleanupInterval() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Get the streaming directory path for a project
 */
export function getStreamingDir(
  encodedProjectName: string,
  runtime: Runtime,
): string {
  const homeDir = runtime.getEnv("HOME");
  if (!homeDir) {
    throw new Error("HOME environment variable not found");
  }
  return `${homeDir}/.claude/projects/${encodedProjectName}/streaming`;
}

/**
 * Get the file path for a specific request
 */
export function getStreamingFilePath(
  encodedProjectName: string,
  requestId: string,
  runtime: Runtime,
): string {
  const streamingDir = getStreamingDir(encodedProjectName, runtime);
  return `${streamingDir}/${requestId}.jsonl`;
}

/**
 * Initialize streaming for a request
 */
export async function initializeStreaming(
  encodedProjectName: string,
  requestId: string,
  runtime: Runtime,
): Promise<void> {
  const streamingDir = getStreamingDir(encodedProjectName, runtime);

  // Ensure streaming directory exists
  await runtime.ensureDir(streamingDir);

  const filePath = getStreamingFilePath(encodedProjectName, requestId, runtime);

  // Initialize request status
  const info: StreamingFileInfo = {
    requestId,
    filePath,
    status: RequestStatus.IN_PROGRESS,
    totalMessages: 0,
    lastUpdated: new Date(),
  };

  requestStatuses.set(requestId, info);
}

/**
 * Append a message to the streaming file
 */
export async function appendMessage(
  encodedProjectName: string,
  requestId: string,
  message: StreamResponse,
  runtime: Runtime,
): Promise<void> {
  const filePath = getStreamingFilePath(encodedProjectName, requestId, runtime);
  const info = requestStatuses.get(requestId);

  if (!info) {
    throw new Error(`Request ${requestId} not initialized`);
  }

  // Append message to file
  const line = JSON.stringify(message) + "\n";
  await runtime.appendTextFile(filePath, line);

  // Update status
  info.totalMessages++;
  info.lastUpdated = new Date();

  // Update status based on message type
  if (message.type === "done") {
    info.status = RequestStatus.COMPLETED;
  } else if (message.type === "error") {
    info.status = RequestStatus.FAILED;
  } else if (message.type === "aborted") {
    info.status = RequestStatus.ABORTED;
  }
}

/**
 * Read messages from a streaming file
 */
export async function readStreamingFile(
  encodedProjectName: string,
  requestId: string,
  fromIndex: number = 0,
  runtime: Runtime,
): Promise<StreamResponse[]> {
  const filePath = getStreamingFilePath(encodedProjectName, requestId, runtime);

  // Check if file exists before reading
  if (!(await runtime.exists(filePath))) {
    return [];
  }

  const content = await runtime.readTextFile(filePath);
  const lines = content
    .trim()
    .split("\n")
    .filter((line) => line.trim());

  const messages: StreamResponse[] = [];
  for (let i = fromIndex; i < lines.length; i++) {
    try {
      const message = JSON.parse(lines[i]) as StreamResponse;
      messages.push(message);
    } catch (error) {
      console.error(`Failed to parse line ${i} in ${filePath}:`, error);
    }
  }

  return messages;
}

/**
 * Get request status
 */
export function getRequestStatus(requestId: string): StreamingFileInfo | null {
  return requestStatuses.get(requestId) || null;
}

/**
 * Clean up expired files
 */
async function cleanupExpiredFiles(runtime: Runtime): Promise<void> {
  const now = new Date();
  const expiredRequests: string[] = [];

  // Find expired requests
  for (const [requestId, info] of requestStatuses.entries()) {
    const age = now.getTime() - info.lastUpdated.getTime();
    if (
      age > CLEANUP_INTERVAL_MS &&
      info.status !== RequestStatus.IN_PROGRESS
    ) {
      expiredRequests.push(requestId);
    }
  }

  // Delete expired files and remove from status map
  for (const requestId of expiredRequests) {
    const info = requestStatuses.get(requestId);
    if (info) {
      try {
        await runtime.remove(info.filePath);
      } catch (error) {
        console.error(`Failed to delete file ${info.filePath}:`, error);
      }
      requestStatuses.delete(requestId);
    }
  }

  if (expiredRequests.length > 0) {
    console.log(`Cleaned up ${expiredRequests.length} expired streaming files`);
  }
}

/**
 * Clean up all streaming files on shutdown
 */
export async function cleanupAllStreamingFiles(
  encodedProjectName: string,
  runtime: Runtime,
): Promise<void> {
  const streamingDir = getStreamingDir(encodedProjectName, runtime);

  try {
    await runtime.removeDir(streamingDir);
    requestStatuses.clear();
  } catch (error) {
    console.error(`Failed to clean up streaming directory:`, error);
  }
}
