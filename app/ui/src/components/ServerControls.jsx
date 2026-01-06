import React, { useState } from 'react';

function ServerControls({ status, onStatusChange }) {
  const [error, setError] = useState(null);
  const [isRestarting, setIsRestarting] = useState(false);

  const handleStart = async () => {
    setError(null);
    try {
      await window.api.server.start();
      // Wait for ready in background - status will update via events
      window.api.server.waitForReady().catch((err) => {
        console.error('Wait for ready failed:', err);
      });
    } catch (err) {
      console.error('Start failed:', err);
      setError(`Failed to start: ${err.message}`);
    }
  };

  const handleStop = async () => {
    setError(null);
    try {
      await window.api.server.stop();
    } catch (err) {
      console.error('Stop failed:', err);
      setError(`Failed to stop: ${err.message}`);
    }
  };

  const handleRestart = async () => {
    setError(null);
    setIsRestarting(true);
    try {
      await window.api.server.restart();
      window.api.server.waitForReady()
        .then(() => setIsRestarting(false))
        .catch((err) => {
          console.error('Wait for ready failed:', err);
          setIsRestarting(false);
        });
    } catch (err) {
      console.error('Restart failed:', err);
      setError(`Failed to restart: ${err.message}`);
      setIsRestarting(false);
    }
  };

  const isRunning = status === 'running';
  const isStopped = status === 'stopped' || status === 'unknown';
  const isStarting = status === 'starting';
  const isStopping = status === 'stopping';
  const isTransitioning = isStarting || isStopping || isRestarting;

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <span>Server</span>
        <span className={`status-dot ${status}`} />
        <span className="text-sm font-normal text-gray-400 capitalize">{status}</span>
      </h2>

      {/* Status Info */}
      {isStarting && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-sm text-yellow-300">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
            Server is starting...
          </div>
        </div>
      )}

      {isStopping && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
            Server is stopping...
          </div>
        </div>
      )}

      {isRestarting && (
        <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/30 rounded text-sm text-orange-300">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
            Server is restarting...
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={handleStart}
          disabled={isTransitioning || isRunning}
          className={`flex-1 py-2 px-4 rounded font-medium transition-colors ${
            isTransitioning || isRunning
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isStarting ? 'Starting...' : 'Start'}
        </button>

        <button
          onClick={handleStop}
          disabled={isTransitioning || isStopped}
          className={`flex-1 py-2 px-4 rounded font-medium transition-colors ${
            isTransitioning || isStopped
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
        >
          {isStopping ? 'Stopping...' : 'Stop'}
        </button>

        <button
          onClick={handleRestart}
          disabled={isTransitioning || isStopped}
          className={`flex-1 py-2 px-4 rounded font-medium transition-colors ${
            isTransitioning || isStopped
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-yellow-600 hover:bg-yellow-700 text-white'
          }`}
        >
          {isRestarting ? 'Restarting...' : 'Restart'}
        </button>
      </div>

      {/* Quick Actions */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="flex gap-2 text-sm">
          <button
            onClick={() => window.api.app.openFolder('data')}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            Open Data Folder
          </button>
          <button
            onClick={() => window.api.app.openFolder('logs')}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            Open Logs
          </button>
        </div>
      </div>
    </div>
  );
}

export default ServerControls;
