import { useState, useEffect, useCallback, useRef } from 'react';

// WebSocket URL - use wss:// in production, ws:// in development
const getWebSocketUrl = () => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  // In development with Vite, use port 3000; in production, use same host
  if (window.location.hostname === 'localhost' && window.location.port === '5173') {
    return `ws://localhost:3000/ws`;
  }
  return `${protocol}//${host}/ws`;
};

const WS_URL = getWebSocketUrl();

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const subscribedJobsRef = useRef(new Set());

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      wsRef.current = new WebSocket(WS_URL);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);

        // Resubscribe to any jobs we were subscribed to
        subscribedJobsRef.current.forEach((jobId) => {
          wsRef.current?.send(JSON.stringify({ type: 'subscribe', jobId }));
        });
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);

        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
  }, []);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const subscribeToJob = useCallback((jobId) => {
    subscribedJobsRef.current.add(jobId);
    send({ type: 'subscribe', jobId });
  }, [send]);

  const unsubscribeFromJob = useCallback((jobId) => {
    subscribedJobsRef.current.delete(jobId);
    send({ type: 'unsubscribe', jobId });
  }, [send]);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    lastMessage,
    send,
    subscribeToJob,
    unsubscribeFromJob,
    connect,
    disconnect,
  };
}

export function useJobProgress(jobId) {
  const { lastMessage, subscribeToJob, unsubscribeFromJob, isConnected } = useWebSocket();
  const [progress, setProgress] = useState({
    status: 'pending',
    progress: 0,
    completedItems: 0,
    totalItems: 0,
    results: [],
    errors: [],
    currentFile: null,
  });

  useEffect(() => {
    if (jobId && isConnected) {
      subscribeToJob(jobId);

      return () => {
        unsubscribeFromJob(jobId);
      };
    }
  }, [jobId, isConnected, subscribeToJob, unsubscribeFromJob]);

  useEffect(() => {
    if (lastMessage && lastMessage.jobId === jobId) {
      switch (lastMessage.type) {
        case 'jobProgress':
          setProgress((prev) => ({
            ...prev,
            status: lastMessage.status,
            progress: lastMessage.progress,
            completedItems: lastMessage.completedItems,
            totalItems: lastMessage.totalItems,
            currentFile: lastMessage.currentFile,
          }));
          break;

        case 'jobItemComplete':
          setProgress((prev) => ({
            ...prev,
            progress: lastMessage.progress,
            completedItems: lastMessage.completedItems,
            totalItems: lastMessage.totalItems,
            results: [...prev.results, lastMessage.result],
          }));
          break;

        case 'jobItemError':
          setProgress((prev) => ({
            ...prev,
            progress: lastMessage.progress,
            completedItems: lastMessage.completedItems,
            totalItems: lastMessage.totalItems,
            errors: [...prev.errors, lastMessage.error],
          }));
          break;

        case 'jobComplete':
          setProgress((prev) => ({
            ...prev,
            status: lastMessage.status,
            progress: 100,
            results: lastMessage.results || prev.results,
            errors: lastMessage.errors || prev.errors,
            duration: lastMessage.duration,
          }));
          break;
      }
    }
  }, [lastMessage, jobId]);

  return progress;
}

export default useWebSocket;
