"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface PollerOptions {
  enabled?: boolean;
  intervalMs?: number;
  onProcess?: (result: { processed: number; errors: number }) => void;
  onError?: (error: Error) => void;
}

export function useJobPoller(options: PollerOptions = {}) {
  const { 
    enabled = true, 
    intervalMs = 5000, 
    onProcess,
    onError 
  } = options;
  
  const [isPolling, setIsPolling] = useState(false);
  const [lastResult, setLastResult] = useState<{ processed: number; errors: number } | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const processJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/jobs/process", { 
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const result = await response.json();
      setLastResult(result);
      
      if (result.processed > 0 || result.errors > 0) {
        onProcess?.(result);
      }
      
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      onError?.(err);
      throw err;
    }
  }, [onProcess, onError]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    
    // Initial poll
    processJobs().catch(() => {});
    
    // Set up interval
    intervalRef.current = setInterval(() => {
      processJobs().catch(() => {});
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsPolling(false);
    };
  }, [enabled, intervalMs, processJobs]);

  return {
    isPolling,
    lastResult,
    triggerNow: processJobs,
  };
}
