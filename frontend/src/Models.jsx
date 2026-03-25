import { useEffect, useState } from 'react';
import { Database, Plus, RefreshCw } from 'lucide-react';
import { api } from './api';

export default function Models({ onClose }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [manualModel, setManualModel] = useState({
    provider: 'codex',
    model_key: 'codex:local',
    display_name: 'Codex Local',
    description: '',
    supports_council: true,
    supports_chairman: true,
    is_active: true,
    sort_order: 0,
  });

  const loadModels = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listAvailableModels(false);
      setModels(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadModels();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setError('');
    try {
      await api.syncOpenRouterModels();
      await loadModels();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateManual = async () => {
    setError('');
    try {
      await api.createAvailableModel({
        ...manualModel,
        sort_order: Number(manualModel.sort_order) || 0,
      });
      await loadModels();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggle = async (modelId, field, value) => {
    try {
      const updated = await api.updateAvailableModel(modelId, { [field]: value });
      setModels((prev) => prev.map((model) => (model.id === modelId ? updated : model)));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSortOrder = async (modelId, value) => {
    try {
      const updated = await api.updateAvailableModel(modelId, { sort_order: Number(value) || 0 });
      setModels((prev) => prev.map((model) => (model.id === modelId ? updated : model)));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={headerRow}>
          <h2 style={title}><Database size={18} /> Models</h2>
          <button onClick={onClose} style={closeBtn}>Close</button>
        </div>

        <div style={actionRow}>
          <button onClick={handleSync} style={primaryBtn} disabled={syncing}>
            <RefreshCw size={14} /> {syncing ? 'Syncing...' : 'Sync OpenRouter'}
          </button>
        </div>

        <div style={section}>
          <h3 style={sectionHeader}>Add Manual Model</h3>
          <div style={formGrid}>
            <input value={manualModel.provider} onChange={(e) => setManualModel((prev) => ({ ...prev, provider: e.target.value }))} placeholder="provider" style={input} />
            <input value={manualModel.model_key} onChange={(e) => setManualModel((prev) => ({ ...prev, model_key: e.target.value }))} placeholder="model key" style={input} />
            <input value={manualModel.display_name} onChange={(e) => setManualModel((prev) => ({ ...prev, display_name: e.target.value }))} placeholder="display name" style={input} />
            <input value={manualModel.description} onChange={(e) => setManualModel((prev) => ({ ...prev, description: e.target.value }))} placeholder="description" style={input} />
            <input value={manualModel.sort_order} onChange={(e) => setManualModel((prev) => ({ ...prev, sort_order: e.target.value }))} placeholder="sort order" style={input} />
          </div>
          <div style={toggleRow}>
            <label style={checkboxLabel}><input type="checkbox" checked={manualModel.supports_council} onChange={(e) => setManualModel((prev) => ({ ...prev, supports_council: e.target.checked }))} /> Council</label>
            <label style={checkboxLabel}><input type="checkbox" checked={manualModel.supports_chairman} onChange={(e) => setManualModel((prev) => ({ ...prev, supports_chairman: e.target.checked }))} /> Chairman</label>
            <label style={checkboxLabel}><input type="checkbox" checked={manualModel.is_active} onChange={(e) => setManualModel((prev) => ({ ...prev, is_active: e.target.checked }))} /> Active</label>
            <button onClick={handleCreateManual} style={secondaryBtn}>
              <Plus size={14} /> Add Model
            </button>
          </div>
        </div>

        {error && <p style={errorText}>{error}</p>}

        <div style={section}>
          <h3 style={sectionHeader}>Catalog</h3>
          {loading ? (
            <p style={metaText}>Loading models...</p>
          ) : models.length === 0 ? (
            <p style={metaText}>No models found.</p>
          ) : (
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Model</th>
                    <th style={th}>Provider</th>
                    <th style={th}>Council</th>
                    <th style={th}>Chairman</th>
                    <th style={th}>Active</th>
                    <th style={th}>Sort</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr key={model.id} style={tr}>
                      <td style={td}>
                        <div style={modelName}>{model.display_name}</div>
                        <div style={modelMeta}>{model.model_key}</div>
                      </td>
                      <td style={td}>{model.provider}</td>
                      <td style={tdCenter}>
                        <input type="checkbox" checked={model.supports_council} onChange={(e) => handleToggle(model.id, 'supports_council', e.target.checked)} />
                      </td>
                      <td style={tdCenter}>
                        <input type="checkbox" checked={model.supports_chairman} onChange={(e) => handleToggle(model.id, 'supports_chairman', e.target.checked)} />
                      </td>
                      <td style={tdCenter}>
                        <input type="checkbox" checked={model.is_active} onChange={(e) => handleToggle(model.id, 'is_active', e.target.checked)} />
                      </td>
                      <td style={tdCenter}>
                        <input type="number" value={model.sort_order ?? 0} onChange={(e) => handleSortOrder(model.id, e.target.value)} style={sortInput} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modal = { background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, width: 'min(1100px, 92vw)', maxHeight: '88vh', overflowY: 'auto', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' };
const headerRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 };
const title = { margin: 0, display: 'flex', alignItems: 'center', gap: 8 };
const closeBtn = { background: 'var(--bg-hover)', border: '1px solid var(--border-primary)', borderRadius: 6, color: 'var(--text-primary)', padding: '8px 14px', cursor: 'pointer' };
const actionRow = { display: 'flex', justifyContent: 'flex-end', marginBottom: 16 };
const section = { marginBottom: 20 };
const sectionHeader = { margin: '0 0 10px 0', fontSize: 14, fontWeight: 600 };
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#2980b9', border: 'none', borderRadius: 6, color: '#fff', padding: '8px 14px', cursor: 'pointer' };
const secondaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#27ae60', border: 'none', borderRadius: 6, color: '#fff', padding: '8px 14px', cursor: 'pointer' };
const formGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 };
const input = { background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '8px 10px', color: 'var(--text-primary)' };
const toggleRow = { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' };
const checkboxLabel = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 };
const errorText = { color: '#e05252', fontSize: 13 };
const metaText = { color: 'var(--text-meta)', fontSize: 13 };
const tableWrap = { overflowX: 'auto' };
const table = { width: '100%', borderCollapse: 'collapse' };
const th = { textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid var(--border-primary)', fontSize: 12, color: 'var(--text-secondary)' };
const tr = { borderBottom: '1px solid var(--border-primary)' };
const td = { padding: '10px 8px', fontSize: 13, verticalAlign: 'top' };
const tdCenter = { ...td, textAlign: 'center', verticalAlign: 'middle' };
const modelName = { fontWeight: 600 };
const modelMeta = { color: 'var(--text-meta)', fontSize: 11, marginTop: 2 };
const sortInput = { width: 72, background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '6px 8px', color: 'var(--text-primary)' };
