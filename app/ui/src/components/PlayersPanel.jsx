import React, { useState, useEffect, useCallback } from 'react';

function PlayersPanel({ isRunning }) {
  const [players, setPlayers] = useState({ online: 0, max: 0, players: [] });
  const [whitelist, setWhitelist] = useState({ enabled: true, players: [] });
  const [ops, setOps] = useState([]);
  const [banList, setBanList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [newPlayer, setNewPlayer] = useState('');
  const [activeSection, setActiveSection] = useState('online');

  const refresh = useCallback(async () => {
    if (!isRunning) return;

    setLoading(true);
    setError(null);

    try {
      const [playersData, whitelistData, opsData, banData] = await Promise.all([
        window.api.players.list(),
        window.api.whitelist.list(),
        window.api.ops.list(),
        window.api.players.getBanList(),
      ]);

      setPlayers(playersData);
      setWhitelist(whitelistData);
      setOps(opsData);
      setBanList(banData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isRunning]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleKick = async (player) => {
    try {
      await window.api.players.kick(player);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBan = async (player) => {
    if (!confirm(`Ban ${player}?`)) return;
    try {
      await window.api.players.ban(player);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePardon = async (player) => {
    try {
      await window.api.players.pardon(player);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleWhitelistAdd = async () => {
    if (!newPlayer.trim()) return;
    try {
      await window.api.whitelist.add(newPlayer.trim());
      setNewPlayer('');
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleWhitelistRemove = async (player) => {
    try {
      await window.api.whitelist.remove(player);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOpAdd = async () => {
    if (!newPlayer.trim()) return;
    try {
      await window.api.ops.add(newPlayer.trim());
      setNewPlayer('');
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOpRemove = async (player) => {
    try {
      await window.api.ops.remove(player);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!isRunning) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-lg font-semibold mb-4">Players</h2>
        <p className="text-gray-400">Server must be running to manage players.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Players</h2>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="mt-2 p-2 bg-red-500/20 border border-red-500/30 rounded text-sm text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Section Tabs */}
      <div className="flex border-b border-gray-700">
        {[
          { id: 'online', label: `Online (${players.online})` },
          { id: 'whitelist', label: `Whitelist (${whitelist.players.length})` },
          { id: 'ops', label: `Operators (${ops.length})` },
          { id: 'bans', label: `Bans (${banList.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeSection === tab.id
                ? 'text-green-400 border-b-2 border-green-400 bg-gray-700/50'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Online Players */}
        {activeSection === 'online' && (
          <div>
            <div className="text-sm text-gray-400 mb-3">
              {players.online} / {players.max} players online
            </div>
            {players.players.length === 0 ? (
              <p className="text-gray-500">No players online</p>
            ) : (
              <ul className="space-y-2">
                {players.players.map((player) => (
                  <li
                    key={player}
                    className="flex items-center justify-between p-2 bg-gray-700/50 rounded"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full" />
                      {player}
                      {ops.includes(player) && (
                        <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1 rounded">
                          OP
                        </span>
                      )}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleKick(player)}
                        className="px-2 py-1 text-xs bg-yellow-600 hover:bg-yellow-700 rounded"
                      >
                        Kick
                      </button>
                      <button
                        onClick={() => handleBan(player)}
                        className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 rounded"
                      >
                        Ban
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Whitelist */}
        {activeSection === 'whitelist' && (
          <div>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newPlayer}
                onChange={(e) => setNewPlayer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleWhitelistAdd()}
                placeholder="Player name..."
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-green-500"
              />
              <button
                onClick={handleWhitelistAdd}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-medium"
              >
                Add
              </button>
            </div>
            {whitelist.players.length === 0 ? (
              <p className="text-gray-500">No players whitelisted</p>
            ) : (
              <ul className="space-y-2">
                {whitelist.players.map((player) => (
                  <li
                    key={player}
                    className="flex items-center justify-between p-2 bg-gray-700/50 rounded"
                  >
                    <span>{player}</span>
                    <button
                      onClick={() => handleWhitelistRemove(player)}
                      className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 rounded"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Operators */}
        {activeSection === 'ops' && (
          <div>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newPlayer}
                onChange={(e) => setNewPlayer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleOpAdd()}
                placeholder="Player name..."
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-green-500"
              />
              <button
                onClick={handleOpAdd}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded text-sm font-medium"
              >
                Add OP
              </button>
            </div>
            {ops.length === 0 ? (
              <p className="text-gray-500">No operators</p>
            ) : (
              <ul className="space-y-2">
                {ops.map((player) => (
                  <li
                    key={player}
                    className="flex items-center justify-between p-2 bg-gray-700/50 rounded"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-yellow-400">*</span>
                      {player}
                    </span>
                    <button
                      onClick={() => handleOpRemove(player)}
                      className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 rounded"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Ban List */}
        {activeSection === 'bans' && (
          <div>
            {banList.length === 0 ? (
              <p className="text-gray-500">No banned players</p>
            ) : (
              <ul className="space-y-2">
                {banList.map((player) => (
                  <li
                    key={player}
                    className="flex items-center justify-between p-2 bg-gray-700/50 rounded"
                  >
                    <span className="text-red-400">{player}</span>
                    <button
                      onClick={() => handlePardon(player)}
                      className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 rounded"
                    >
                      Pardon
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default PlayersPanel;
