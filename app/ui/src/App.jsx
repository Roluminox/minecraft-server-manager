import React, { useState, useEffect } from 'react';
import DockerStatus from './components/DockerStatus';
import ServerControls from './components/ServerControls';
import ServerStats from './components/ServerStats';
import Console from './components/Console';
import ConfigPanel from './components/ConfigPanel';
import PlayersPanel from './components/PlayersPanel';
import BackupsPanel from './components/BackupsPanel';
import { useServerStatus } from './hooks/useServerStatus';

function App() {
  const [dockerReady, setDockerReady] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const { serverStatus, serverInfo, refreshStatus } = useServerStatus();

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white overflow-hidden">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-green-400">
            Minecraft Server Manager
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              {window.platform?.isWindows ? 'Windows' : 'Unknown OS'}
            </span>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-gray-800 border-b border-gray-700 px-4">
        <div className="flex gap-1">
          {['dashboard', 'players', 'backups', 'config'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'text-green-400 border-b-2 border-green-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="p-4 flex-1 flex flex-col min-h-0">
        {activeTab === 'dashboard' && (
          <div className="flex-1 flex flex-col space-y-4 min-h-0">
            {/* Docker Status */}
            <DockerStatus onReady={setDockerReady} />

            {dockerReady && (
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
                {/* Controls & Stats */}
                <div className="lg:col-span-1 space-y-4">
                  <ServerControls
                    status={serverStatus}
                    onStatusChange={refreshStatus}
                  />
                  <ServerStats
                    isRunning={serverStatus === 'running'}
                  />
                </div>

                {/* Console */}
                <div className="lg:col-span-2 flex flex-col min-h-0">
                  <Console
                    isRunning={serverStatus === 'running'}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'players' && (
          <PlayersPanel isRunning={serverStatus === 'running'} />
        )}

        {activeTab === 'backups' && (
          <BackupsPanel />
        )}

        {activeTab === 'config' && (
          <ConfigPanel />
        )}
      </main>
    </div>
  );
}

export default App;
