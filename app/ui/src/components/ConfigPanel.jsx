import React, { useState, useEffect } from 'react';

function ConfigPanel() {
  const [config, setConfig] = useState({});
  const [schema, setSchema] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState({});
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const [configData, schemaData] = await Promise.all([
        window.api.config.getAll(),
        window.api.config.getSchema()
      ]);
      setConfig(configData);
      setSchema(schemaData);
    } catch (error) {
      console.error('Failed to load config:', error);
      setMessage({ type: 'error', text: 'Failed to load configuration' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key, value) => {
    setChanges((prev) => ({ ...prev, [key]: value }));
  };

  const getValue = (key, schemaItem) => {
    if (changes[key] !== undefined) return changes[key];
    const envVar = schemaItem.envVar || key;
    return config[envVar] ?? schemaItem.default;
  };

  const handleSave = async () => {
    if (Object.keys(changes).length === 0) return;

    setSaving(true);
    setMessage(null);

    try {
      const result = await window.api.config.setMultiple(changes);
      setChanges({});

      if (result.requiresRestart) {
        setMessage({
          type: 'warning',
          text: 'Settings saved. Some changes require a server restart to take effect.'
        });
      } else {
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
      }

      // Reload config
      await loadConfig();
    } catch (error) {
      console.error('Failed to save config:', error);
      setMessage({ type: 'error', text: `Failed to save: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setChanges({});
    setMessage(null);
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          Loading configuration...
        </div>
      </div>
    );
  }

  const hasChanges = Object.keys(changes).length > 0;

  // Group by category
  const groups = {
    'Server': ['mc.version', 'mc.type', 'mc.memory', 'mc.maxPlayers'],
    'Gameplay': ['server.motd', 'server.difficulty', 'server.gamemode', 'server.pvp'],
    'Security': ['server.onlineMode', 'rcon.enabled', 'rcon.password'],
    'World': ['server.seed']
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Configuration</h2>
          <div className="flex gap-2">
            {hasChanges && (
              <button
                onClick={handleReset}
                className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm transition-colors"
              >
                Reset
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className={`px-4 py-1 rounded text-sm font-medium transition-colors ${
                !hasChanges || saving
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`mt-3 p-3 rounded text-sm ${
            message.type === 'error' ? 'bg-red-500/20 text-red-300' :
            message.type === 'warning' ? 'bg-yellow-500/20 text-yellow-300' :
            'bg-green-500/20 text-green-300'
          }`}>
            {message.text}
          </div>
        )}
      </div>

      {/* Config Groups */}
      {Object.entries(groups).map(([groupName, keys]) => (
        <div key={groupName} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h3 className="text-md font-semibold mb-4">{groupName}</h3>
          <div className="space-y-4">
            {keys.map((key) => {
              const item = schema[key];
              if (!item) return null;

              const value = getValue(key, item);
              const isChanged = changes[key] !== undefined;

              return (
                <div key={key} className="flex items-start gap-4">
                  <div className="flex-1">
                    <label className={`block text-sm font-medium ${isChanged ? 'text-yellow-400' : ''}`}>
                      {item.label}
                      {item.requiresRestart && (
                        <span className="text-xs text-gray-500 ml-2">(requires restart)</span>
                      )}
                    </label>
                    {item.description && (
                      <p className="text-xs text-gray-500 mt-1">{item.description}</p>
                    )}
                  </div>
                  <div className="w-48">
                    <ConfigInput
                      schema={item}
                      value={value}
                      onChange={(v) => handleChange(key, v)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfigInput({ schema, value, onChange }) {
  switch (schema.type) {
    case 'select':
      return (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded focus:border-green-500 focus:outline-none text-sm"
        >
          {schema.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'boolean':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value === true || value === 'true'}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900"
          />
          <span className="text-sm text-gray-400">
            {value === true || value === 'true' ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      );

    case 'slider':
      return (
        <div>
          <input
            type="range"
            min={schema.min}
            max={schema.max}
            step={schema.step}
            value={parseInt(value) || schema.min}
            onChange={(e) => onChange(`${e.target.value}${schema.unit || ''}`)}
            className="w-full"
          />
          <div className="text-sm text-gray-400 text-center">
            {value || schema.default}
          </div>
        </div>
      );

    case 'number':
      return (
        <input
          type="number"
          min={schema.min}
          max={schema.max}
          value={value || ''}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded focus:border-green-500 focus:outline-none text-sm"
        />
      );

    case 'password':
      return (
        <input
          type="password"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded focus:border-green-500 focus:outline-none text-sm"
        />
      );

    case 'text':
    default:
      return (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          maxLength={schema.maxLength}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded focus:border-green-500 focus:outline-none text-sm"
        />
      );
  }
}

export default ConfigPanel;
