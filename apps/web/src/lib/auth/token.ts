"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

interface TokenState {
  token: string | null;
  expiresAt: number | null;
  isLoading: boolean;
  error: Error | null;
}

export function useAuthToken() {
  const { status } = useSession();
  const [state, setState] = useState<TokenState>({
    token: null,
    expiresAt: null,
    isLoading: true,
    error: null,
  });

  const fetchToken = useCallback(async () => {
    if (status !== "authenticated") {
      setState({
        token: null,
        expiresAt: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    try {
      const response = await fetch("/api/auth/token");
      if (!response.ok) {
        throw new Error("Failed to fetch token");
      }

      const data = await response.json();
      setState({
        token: data.token,
        expiresAt: Date.now() + data.expiresIn * 1000,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState({
        token: null,
        expiresAt: null,
        isLoading: false,
        error: error as Error,
      });
    }
  }, [status]);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!state.expiresAt) return;

    const refreshBuffer = 60 * 1000; // 1 minute before expiry
    const timeUntilRefresh = state.expiresAt - Date.now() - refreshBuffer;

    if (timeUntilRefresh <= 0) {
      fetchToken();
      return;
    }

    const timer = setTimeout(fetchToken, timeUntilRefresh);
    return () => clearTimeout(timer);
  }, [state.expiresAt, fetchToken]);

  return {
    token: state.token,
    isLoading: state.isLoading,
    error: state.error,
    refreshToken: fetchToken,
  };
}

/**
 * Get auth headers for API requests
 */
export function getAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}
