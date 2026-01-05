import { useState, useEffect, useCallback, useRef } from 'react';

export function useServerStatus() {
  const [serverStatus, setServerStatus] = useState('unknown'); // unknown, stopped, starting, running, stopping, error
  const [serverInfo, setServerInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refreshStatus = useCallback(async () => {
    try {
      const statusResult = await window.api.server.getStatus();

      if (!mountedRef.current) return;

      // Handle new status format { isRunning, state }
      if (statusResult && typeof statusResult === 'object' && statusResult.state) {
        setServerStatus(statusResult.state);
      } else {
        // Fallback for boolean response
        setServerStatus(statusResult ? 'running' : 'stopped');
      }

      // Get additional info
      try {
        const info = await window.api.server.getInfo();
        if (mountedRef.current) {
          setServerInfo(info);
        }
      } catch {
        // Info might fail if container doesn't exist
      }
    } catch (error) {
      console.error('Failed to get server status:', error);
      if (mountedRef.current) {
        setServerStatus('stopped');
        setServerInfo(null);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refreshStatus();

    // Subscribe to status changes from backend
    const unsubscribe = window.api.server.onStatusChange((status) => {
      console.log('Server status changed:', status);
      if (mountedRef.current) {
        setServerStatus(status);
      }
    });

    // Poll every 5 seconds (less frequently since we have events now)
    const interval = setInterval(refreshStatus, 5000);

    return () => {
      mountedRef.current = false;
      unsubscribe();
      clearInterval(interval);
    };
  }, [refreshStatus]);

  return {
    serverStatus,
    serverInfo,
    loading,
    refreshStatus
  };
}
