"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { githubToast } from "@/lib/success";
import { githubError } from "@/lib/errors";

/**
 * Message type sent from the callback popup
 */
interface GitHubOAuthMessage {
  type: "github-oauth-result";
  success: boolean;
  error?: "cancelled" | "invalid_state" | "github_api_error" | "missing_installation";
  repoCount?: number;
}

/**
 * Type guard to check if a message is a GitHub OAuth result
 */
function isGitHubOAuthMessage(data: unknown): data is GitHubOAuthMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    (data as { type: unknown }).type === "github-oauth-result"
  );
}

interface UseGitHubOAuthReturn {
  /** Open the GitHub OAuth popup */
  connect: () => void;
  /** Whether the OAuth flow is in progress */
  isConnecting: boolean;
}

/**
 * Hook for handling GitHub App OAuth installation via popup window.
 *
 * Opens a popup to GitHub for app installation, listens for the result
 * via postMessage, and handles success/error toasts.
 *
 * @param workspaceSlug - The workspace slug for the installation
 * @returns Connection function and loading state
 *
 * @example
 * ```tsx
 * function ConnectButton({ workspaceSlug }: Props) {
 *   const { connect, isConnecting } = useGitHubOAuth(workspaceSlug);
 *
 *   return (
 *     <Button onClick={connect} disabled={isConnecting}>
 *       {isConnecting ? "Connecting..." : "Connect GitHub"}
 *     </Button>
 *   );
 * }
 * ```
 */
export function useGitHubOAuth(workspaceSlug: string): UseGitHubOAuthReturn {
  const utils = trpc.useUtils();
  const [isConnecting, setIsConnecting] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
    popupRef.current = null;
    setIsConnecting(false);
  }, []);

  // Handle messages from the popup
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Verify origin for security
      if (event.origin !== window.location.origin) return;

      // Check if it's our OAuth result message
      if (!isGitHubOAuthMessage(event.data)) return;

      const { success, error, repoCount } = event.data;

      // Handle result
      if (success && repoCount !== undefined) {
        githubToast.connected(repoCount);
        // Invalidate GitHub queries to refresh data
        utils.github.listRepositories.invalidate();
        utils.github.getInstallation.invalidate();
      } else if (error) {
        // Call the appropriate error toast based on error type
        const errorHandler = githubError[error];
        if (errorHandler) {
          errorHandler();
        }
      }

      cleanup();
    },
    [utils, cleanup]
  );

  // Set up message listener
  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      cleanup();
    };
  }, [handleMessage, cleanup]);

  // Open OAuth popup
  const connect = useCallback(() => {
    if (isConnecting) return;

    setIsConnecting(true);

    // Calculate popup position (centered)
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    // Open popup
    const popup = window.open(
      `/api/github/install?workspace=${encodeURIComponent(workspaceSlug)}`,
      "github-oauth",
      `width=${width},height=${height},left=${left},top=${top},popup=true,noopener=false`
    );

    popupRef.current = popup;

    // Check if popup was blocked
    if (!popup) {
      githubError.github_api_error();
      setIsConnecting(false);
      return;
    }

    // Poll to check if popup was closed without completing
    checkIntervalRef.current = setInterval(() => {
      if (popup.closed) {
        // Popup was closed - either completed (message received) or cancelled
        // If message was received, cleanup already happened
        // If not, user just closed the window
        cleanup();
      }
    }, 500);
  }, [workspaceSlug, isConnecting, cleanup]);

  return { connect, isConnecting };
}

interface UseGitHubDisconnectReturn {
  /** Disconnect GitHub from the workspace */
  disconnect: () => Promise<void>;
  /** Whether the disconnect is in progress */
  isDisconnecting: boolean;
}

/**
 * Hook for disconnecting GitHub App installation from a workspace.
 *
 * @param workspaceId - The workspace ID to disconnect from
 * @returns Disconnect function and loading state
 */
interface UseManageReposReturn {
  /** Open the GitHub settings popup to manage repos */
  openManageRepos: () => void;
  /** Whether the popup is currently open */
  isOpen: boolean;
}

/**
 * Hook for managing GitHub App repository access via popup.
 *
 * Opens a popup to GitHub settings where users can add/remove repository access.
 * When the popup closes, automatically refreshes the repository list.
 *
 * @param installation - The GitHub installation details
 * @returns Function to open popup and loading state
 */
export function useManageRepos(installation: {
  installationId: bigint;
  accountLogin: string;
  accountType: string;
}): UseManageReposReturn {
  const utils = trpc.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get the GitHub settings URL
  const getManageReposUrl = useCallback(() => {
    const installId = installation.installationId.toString();
    if (installation.accountType === "Organization") {
      return `https://github.com/organizations/${installation.accountLogin}/settings/installations/${installId}`;
    }
    return `https://github.com/settings/installations/${installId}`;
  }, [installation]);

  // Cleanup and refresh repos
  const cleanup = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
    popupRef.current = null;
    setIsOpen(false);

    // Refresh repository list when popup closes
    utils.github.listRepositories.invalidate();
  }, [utils]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, []);

  // Open window
  const openManageRepos = useCallback(() => {
    if (isOpen) return;

    setIsOpen(true);

    // Calculate window position (centered)
    const width = 1000;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    // Open as a regular window (not popup) to avoid session/cookie issues
    // Using resizable,scrollbars,status makes it a full window that shares cookies properly
    const popup = window.open(
      getManageReposUrl(),
      "github-manage-repos",
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
    );

    popupRef.current = popup;

    // Check if window was blocked
    if (!popup) {
      setIsOpen(false);
      return;
    }

    // Poll to check if window was closed
    checkIntervalRef.current = setInterval(() => {
      if (popup.closed) {
        cleanup();
      }
    }, 500);
  }, [isOpen, getManageReposUrl, cleanup]);

  return { openManageRepos, isOpen };
}

export function useGitHubDisconnect(workspaceId: string): UseGitHubDisconnectReturn {
  const utils = trpc.useUtils();
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const disconnect = useCallback(async () => {
    if (isDisconnecting) return;

    setIsDisconnecting(true);

    try {
      const response = await fetch("/api/github/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceId }),
      });

      if (!response.ok) {
        throw new Error("Failed to disconnect");
      }

      githubToast.disconnected();
      // Invalidate GitHub queries to refresh data
      utils.github.listRepositories.invalidate();
      utils.github.getInstallation.invalidate();
    } catch {
      githubError.disconnect_failed();
    } finally {
      setIsDisconnecting(false);
    }
  }, [workspaceId, isDisconnecting, utils]);

  return { disconnect, isDisconnecting };
}
