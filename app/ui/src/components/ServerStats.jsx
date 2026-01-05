import React, { useState, useEffect } from 'react';

function ServerStats({ isRunning }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isRunning) {
      setStats(null);
      return;
    }

    // Start polling
    window.api.stats.startPolling(2000);

    const unsubscribe = window.api.stats.onStats((newStats) => {
      setStats(newStats);
      setError(null);
    });

    return () => {
      unsubscribe();
      window.api.stats.stopPolling();
    };
  }, [isRunning]);

  if (!isRunning) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h2 className="text-lg font-semibold mb-4">Stats</h2>
        <div className="text-gray-400 text-sm">Server is not running</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h2 className="text-lg font-semibold mb-4">Stats</h2>
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          Loading stats...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h2 className="text-lg font-semibold mb-4">Stats</h2>

      <div className="space-y-4">
        {/* CPU */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-400">CPU ({stats.cpu?.cores || 0} cores)</span>
            <span className="font-medium">{stats.cpu?.percent || 0}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${Math.min(stats.cpu?.percent || 0, 100)}%` }}
            />
          </div>
        </div>

        {/* Memory */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-400">Memory</span>
            <span className="font-medium">
              {stats.memory?.usedMB || 0} MB / {stats.memory?.limitMB || 0} MB
            </span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${stats.memory?.percent || 0}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {stats.memory?.percent || 0}% used
          </div>
        </div>

        {/* Network */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-400">Network In</div>
            <div className="font-medium">{stats.network?.rxMB || 0} MB</div>
          </div>
          <div>
            <div className="text-gray-400">Network Out</div>
            <div className="font-medium">{stats.network?.txMB || 0} MB</div>
          </div>
        </div>

        {/* PIDs */}
        {stats.pids > 0 && (
          <div className="text-sm">
            <span className="text-gray-400">Processes: </span>
            <span className="font-medium">{stats.pids}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default ServerStats;
