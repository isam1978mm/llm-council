import { useState, useEffect } from 'react';
import { api } from './api';

const themeOptions = [
  { value: 'light', label: 'Light', description: 'Always use the light theme.' },
  { value: 'dark', label: 'Dark', description: 'Always use the dark theme.' },
  { value: 'auto', label: 'Auto', description: 'Follow your system appearance.' },
];

export default function Settings({ onClose, themePreference, onThemeChange, activeTheme }) {
  const [models, setModels] = useState([]);
  const [chairman, setChairman] = useState('');
  const [newModel, setNewModel] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setModels(cfg.council_models);
      setChairman(cfg.chairman_model);
    });
  }, []);

  const addModel = () => {
    if (newModel.trim() && !models.includes(newModel.trim())) {
      setModels([...models, newModel.trim()]);
      setNewModel('');
    }
  };

  const removeModel = (model) => setModels(models.filter((entry) => entry !== model));

  const save = async () => {
    await api.saveConfig({ council_models: models, chairman_model: chairman });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <h2>⚙️ Council Settings</h2>

        <section style={section}>
          <h3>Appearance</h3>
          <p style={helperText}>Choose how the app should look.</p>
          <div style={themeOptionList}>
            {themeOptions.map((option) => {
              const isSelected = themePreference === option.value;
              const isAuto = option.value === 'auto';

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onThemeChange(option.value)}
                  style={{
                    ...themeOptionButton,
                    ...(isSelected ? selectedThemeOptionButton : {}),
                  }}
                  aria-pressed={isSelected}
                >
                  <span style={themeOptionHeaderRow}>
                    <span>{option.label}</span>
                    {isSelected && <span style={themeOptionBadge}>Selected</span>}
                  </span>
                  <span style={themeOptionDescription}>{option.description}</span>
                  {isAuto && (
                    <span style={themeOptionMeta}>Currently using {activeTheme} mode</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section style={section}>
          <h3>Council Models</h3>
          {models.map((model) => (
            <div key={model} style={row}>
              <span>{model}</span>
              <button type="button" onClick={() => removeModel(model)} style={removeBtn}>✕</button>
            </div>
          ))}
          <div style={row}>
            <input
              value={newModel}
              onChange={(event) => setNewModel(event.target.value)}
              placeholder="e.g. openai/gpt-4o"
              style={input}
              onKeyDown={(event) => event.key === 'Enter' && addModel()}
            />
            <button type="button" onClick={addModel} style={addBtn}>+ Add</button>
          </div>
        </section>

        <section style={section}>
          <h3>Chairman Model</h3>
          <input
            value={chairman}
            onChange={(event) => setChairman(event.target.value)}
            style={{ ...input, width: '100%' }}
          />
        </section>

        <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
          <button type="button" onClick={save} style={saveBtn}>
            {saved ? '✅ Saved!' : 'Save'}
          </button>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const overlay = {
  position: 'fixed',
  inset: 0,
  background: 'var(--overlay-strong)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 20,
};

const modal = {
  background: 'var(--modal-bg)',
  padding: 30,
  borderRadius: 12,
  minWidth: 400,
  width: 'min(680px, 100%)',
  color: 'var(--modal-text)',
  border: '1px solid var(--modal-border)',
  boxShadow: 'var(--modal-shadow)',
  maxHeight: '85vh',
  overflowY: 'auto',
};

const section = {
  marginTop: 24,
};

const helperText = {
  color: 'var(--text-muted)',
  fontSize: 14,
  margin: '8px 0 16px',
};

const themeOptionList = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 12,
};

const themeOptionButton = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 8,
  padding: 14,
  borderRadius: 10,
  border: '1px solid var(--border-color)',
  background: 'var(--surface-elevated)',
  color: 'var(--modal-text)',
  cursor: 'pointer',
  textAlign: 'left',
};

const selectedThemeOptionButton = {
  border: '1px solid var(--accent-color)',
  background: 'var(--accent-soft)',
  boxShadow: '0 0 0 1px var(--accent-color)',
};

const themeOptionHeaderRow = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  fontWeight: 600,
};

const themeOptionBadge = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--accent-color)',
};

const themeOptionDescription = {
  color: 'var(--text-muted)',
  fontSize: 13,
  lineHeight: 1.5,
};

const themeOptionMeta = {
  color: 'var(--text-subtle)',
  fontSize: 12,
};

const row = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 };
const input = {
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  borderRadius: 6,
  padding: '6px 10px',
  color: 'var(--text-primary)',
  flex: 1,
};
const removeBtn = { background: '#c0392b', border: 'none', borderRadius: 6, color: '#fff', padding: '4px 8px', cursor: 'pointer' };
const addBtn = { background: 'var(--accent-color)', border: 'none', borderRadius: 6, color: '#fff', padding: '6px 12px', cursor: 'pointer' };
const saveBtn = { background: '#27ae60', border: 'none', borderRadius: 6, color: '#fff', padding: '8px 20px', cursor: 'pointer' };
const cancelBtn = { background: 'var(--button-muted-bg)', border: 'none', borderRadius: 6, color: 'var(--button-muted-text)', padding: '8px 20px', cursor: 'pointer' };
