import React, { useState, useEffect } from 'react';

function DockerStatus({ onReady }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    checkDocker();
  }, []);

  const checkDocker = async () => {
    setLoading(true);
    try {
      const result = await window.api.docker.getStatus();
      setStatus(result);
      onReady(result.state === 'daemon_ready');
    } catch (error) {
      console.error('Docker check failed:', error);
      setStatus({ state: 'unknown_error', message: error.message });
      onReady(false);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDocker = async () => {
    try {
      await window.api.docker.openDockerDesktop();
      setWaiting(true);

      // Wait for Docker to be ready
      const result = await window.api.docker.waitUntilReady();
      setStatus(result);
      onReady(true);
    } catch (error) {
      console.error('Failed to start Docker:', error);
    } finally {
      setWaiting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-300">Checking Docker...</span>
        </div>
      </div>
    );
  }

  const isReady = status?.state === 'daemon_ready';

  return (
    <div
      className={`bg-gray-800 rounded-lg p-4 border ${isReady ? 'border-green-500/30' : 'border-yellow-500/30'}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Status Icon */}
          <div className={`w-3 h-3 rounded-full ${isReady ? 'bg-green-500' : 'bg-yellow-500'}`} />

          {/* Status Text */}
          <div>
            <div className="font-medium">{isReady ? 'Docker Ready' : 'Docker Not Ready'}</div>
            {status?.details?.version && (
              <div className="text-sm text-gray-400">
                Version {status.details.version} - {status.details.containersRunning || 0}{' '}
                containers running
              </div>
            )}
            {!isReady && status?.message && (
              <div className="text-sm text-yellow-400">{status.message}</div>
            )}
          </div>
        </div>

        {/* Actions */}
        {!isReady && (
          <div className="flex gap-2">
            {waiting ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                Waiting for Docker...
              </div>
            ) : (
              <>
                {status?.nextAction === 'open_docker_desktop' && (
                  <button
                    onClick={handleOpenDocker}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
                  >
                    Open Docker Desktop
                  </button>
                )}
                {status?.nextAction === 'install_docker' && (
                  <button
                    onClick={() =>
                      window.api.app.openExternal(
                        'https://docs.docker.com/desktop/install/windows-install/'
                      )
                    }
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
                  >
                    Install Docker
                  </button>
                )}
                <button
                  onClick={checkDocker}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm font-medium transition-colors"
                >
                  Refresh
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DockerStatus;
