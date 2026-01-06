import React, { useState, useEffect, useCallback } from 'react';

function BackupsPanel() {
  const [backups, setBackups] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [backupName, setBackupName] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [backupsList, backupStats] = await Promise.all([
        window.api.backup.list(),
        window.api.backup.getStats(),
      ]);

      setBackups(backupsList);
      setStats(backupStats);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    const unsubscribe = window.api.backup.onProgress((progressData) => {
      setProgress(progressData);
      if (progressData.phase === 'complete') {
        setTimeout(() => {
          setProgress(null);
          refresh();
        }, 1500);
      }
    });

    return () => unsubscribe();
  }, [refresh]);

  const handleCreate = async () => {
    const name = backupName.trim() || 'manual';
    setCreating(true);
    setError(null);

    try {
      await window.api.backup.create(name);
      setBackupName('');
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (filename) => {
    if (
      !confirm(
        `Restore backup "${filename}"?\n\nThis will stop the server and replace the current world.`
      )
    ) {
      return;
    }

    setRestoring(filename);
    setError(null);

    try {
      await window.api.backup.restore(filename);
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setRestoring(null);
    }
  };

  const handleDelete = async (filename) => {
    if (!confirm(`Delete backup "${filename}"?`)) {
      return;
    }

    try {
      await window.api.backup.delete(filename);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const formatDate = (date) => {
    if (!date) return 'Unknown';
    const d = new Date(date);
    return d.toLocaleString();
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Backups</h2>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div className="bg-gray-700/50 p-2 rounded">
              <div className="text-gray-400">Total Backups</div>
              <div className="text-lg font-semibold">{stats.count}</div>
            </div>
            <div className="bg-gray-700/50 p-2 rounded">
              <div className="text-gray-400">Total Size</div>
              <div className="text-lg font-semibold">
                {stats.totalSizeFormatted || formatSize(stats.totalSize)}
              </div>
            </div>
            <div className="bg-gray-700/50 p-2 rounded">
              <div className="text-gray-400">Latest</div>
              <div className="text-sm">
                {stats.newestDate ? formatDate(stats.newestDate) : 'None'}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 p-2 bg-red-500/20 border border-red-500/30 rounded text-sm text-red-300">
            {error}
          </div>
        )}

        {progress && (
          <div className="mt-3 p-3 bg-blue-500/20 border border-blue-500/30 rounded">
            <div className="flex items-center gap-2 text-sm text-blue-300">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              {progress.message || progress.phase}
            </div>
          </div>
        )}
      </div>

      {/* Create Backup */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={backupName}
            onChange={(e) => setBackupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !creating && handleCreate()}
            placeholder="Backup name (optional)..."
            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-green-500"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              creating
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {creating ? 'Creating...' : 'Create Backup'}
          </button>
        </div>
      </div>

      {/* Backups List */}
      <div className="flex-1 overflow-y-auto p-4">
        {backups.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <div className="text-4xl mb-2">📦</div>
            <p>No backups yet</p>
            <p className="text-sm">Create your first backup above</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {backups.map((backup) => (
              <li key={backup.name} className="p-3 bg-gray-700/50 rounded border border-gray-600">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{backup.name}</div>
                    <div className="text-sm text-gray-400 mt-1">
                      {formatDate(backup.date)} - {backup.sizeFormatted || formatSize(backup.size)}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleRestore(backup.name)}
                      disabled={restoring === backup.name}
                      className={`px-3 py-1 text-xs rounded transition-colors ${
                        restoring === backup.name
                          ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {restoring === backup.name ? 'Restoring...' : 'Restore'}
                    </button>
                    <button
                      onClick={() => handleDelete(backup.name)}
                      className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-700 text-xs text-gray-500">
        Backups are stored in the minecraft-backups Docker volume
      </div>
    </div>
  );
}

export default BackupsPanel;
