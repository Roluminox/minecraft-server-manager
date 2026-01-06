import React, { useState, useEffect, useRef } from 'react';

function Console({ isRunning }) {
  const [logs, setLogs] = useState([]);
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [sending, setSending] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef(null);
  const logsContainerRef = useRef(null);

  useEffect(() => {
    if (!isRunning) {
      setLogs([]);
      return;
    }

    // Get initial logs
    window.api.console.getSnapshot(100).then((snapshot) => {
      setLogs(snapshot);
    });

    // Start following
    window.api.console.startFollowing();

    const unsubscribe = window.api.console.onLog((log) => {
      setLogs((prev) => [...prev.slice(-499), log]);
    });

    return () => {
      unsubscribe();
      window.api.console.stopFollowing();
    };
  }, [isRunning]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Detect manual scroll
  const handleScroll = () => {
    if (!logsContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const handleSendCommand = async () => {
    if (!command.trim() || sending) return;

    setSending(true);
    try {
      const response = await window.api.console.sendCommand(command.trim());

      // Add to history
      setCommandHistory((prev) => [...prev.slice(-49), command.trim()]);
      setHistoryIndex(-1);

      // Add response as a log
      if (response) {
        setLogs((prev) => [
          ...prev,
          {
            raw: `> ${response}`,
            level: 'INFO',
            message: response,
            timestamp: new Date(),
          },
        ]);
      }

      setCommand('');
    } catch (error) {
      console.error('Command failed:', error);
      setLogs((prev) => [
        ...prev,
        {
          raw: `Error: ${error.message}`,
          level: 'ERROR',
          message: error.message,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        setHistoryIndex(newIndex);
        setCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      } else {
        setHistoryIndex(-1);
        setCommand('');
      }
    }
  };

  const getLevelColor = (level) => {
    switch (level) {
      case 'ERROR':
      case 'FATAL':
        return 'text-red-400';
      case 'WARN':
        return 'text-yellow-400';
      case 'DEBUG':
        return 'text-gray-500';
      default:
        return 'text-gray-300';
    }
  };

  if (!isRunning) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 h-full min-h-96">
        <h2 className="text-lg font-semibold mb-4">Console</h2>
        <div className="flex items-center justify-center h-64 text-gray-400">
          Server is not running
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 flex flex-col h-full min-h-96">
      {/* Header */}
      <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Console</h2>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setLogs([])}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            Clear
          </button>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-2 py-1 rounded transition-colors ${
              autoScroll ? 'bg-green-600/30 text-green-400' : 'bg-gray-700'
            }`}
          >
            Auto-scroll
          </button>
        </div>
      </div>

      {/* Logs */}
      <div
        ref={logsContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 console-text bg-gray-900"
      >
        {logs.length === 0 ? (
          <div className="text-gray-500">No logs yet...</div>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              className={`${getLevelColor(log.level)} whitespace-pre-wrap break-all`}
            >
              {log.message || log.raw}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter command..."
            className="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded focus:border-green-500 focus:outline-none console-text"
          />
          <button
            onClick={handleSendCommand}
            disabled={!command.trim() || sending}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              !command.trim() || sending
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Console;
