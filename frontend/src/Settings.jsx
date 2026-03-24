import { useState, useEffect } from "react";
import { X, Sun, Moon, Monitor, Settings as SettingsIcon, BookmarkPlus, Trash2, Download } from "lucide-react";
import { api } from "./api";

export default function Settings({ onClose, theme, onThemeChange }) {
  const [models, setModels] = useState([]);
  const [chairman, setChairman] = useState("");
  const [newModel, setNewModel] = useState("");
  const [debateRounds, setDebateRounds] = useState(2);
  const [debateRoundsCap, setDebateRoundsCap] = useState(5);
  const [saved, setSaved] = useState(false);

  const [presets, setPresets] = useState([]);
  const [presetsError, setPresetsError] = useState("");
  const [newPresetName, setNewPresetName] = useState("");
  const [presetSaving, setPresetSaving] = useState(false);

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setModels(cfg.council_models);
      setChairman(cfg.chairman_model);
      setDebateRounds(cfg.debate_rounds ?? 2);
      setDebateRoundsCap(cfg.debate_rounds_cap ?? 5);
    });
    api.listPresets().then(setPresets).catch((e) => setPresetsError(e.message));
  }, []);

  const addModel = () => {
    if (newModel.trim() && !models.includes(newModel.trim()) && models.length < 5) {
      setModels([...models, newModel.trim()]);
      setNewModel("");
    }
  };

  const loadPreset = (preset) => {
    setModels(preset.models.council_models);
    setChairman(preset.models.chairman_model);
  };

  const saveAsPreset = async () => {
    if (!newPresetName.trim() || models.length === 0) return;
    setPresetSaving(true);
    try {
      const created = await api.createPreset(newPresetName.trim(), models, chairman);
      setPresets((prev) => [...prev, created]);
      setNewPresetName("");
    } finally {
      setPresetSaving(false);
    }
  };

  const removePreset = async (id) => {
    await api.deletePreset(id);
    setPresets((prev) => prev.filter((p) => p.id !== id));
  };

  const removeModel = (m) => setModels(models.filter((x) => x !== m));

  const save = async () => {
    await api.saveConfig({ council_models: models, chairman_model: chairman, debate_rounds: debateRounds, debate_rounds_cap: debateRoundsCap });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <h2 style={{ margin: "0 0 20px 0", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}><SettingsIcon size={18} /> Council Settings</h2>

        <h3 style={sectionHeader}>Theme</h3>
        <div style={themeRow}>
          {["light", "system", "dark"].map((t) => (
            <button
              key={t}
              onClick={() => onThemeChange(t)}
              style={{ ...themeBtn, ...(theme === t ? themeBtnActive : {}) }}
            >
              {t === "light" ? <><Sun size={14} /> Light</> : t === "dark" ? <><Moon size={14} /> Dark</> : <><Monitor size={14} /> System</>}
            </button>
          ))}
        </div>

        <h3 style={sectionHeader}>Council Models <span style={{ fontWeight: 400, color: "var(--text-meta)", fontSize: 12 }}>({models.length}/5)</span></h3>
        {models.map((m) => (
          <div key={m} style={row}>
            <span style={{ color: "var(--text-primary)", flex: 1, fontSize: 13 }}>{m}</span>
            <button onClick={() => removeModel(m)} style={removeBtn}>✕</button>
          </div>
        ))}
        {models.length < 5 && (
          <div style={row}>
            <input
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              placeholder="e.g. openai/gpt-4o"
              style={input}
              onKeyDown={(e) => e.key === "Enter" && addModel()}
            />
            <button onClick={addModel} style={addBtn}>+ Add</button>
          </div>
        )}

        <h3 style={sectionHeader}>Debate Rounds</h3>
        <div style={row}>
          <input
            type="number"
            min={1}
            max={debateRoundsCap}
            value={debateRounds}
            onChange={(e) => setDebateRounds(Math.max(1, Math.min(debateRoundsCap, Number(e.target.value))))}
            style={{ ...input, width: 70, flex: "none" }}
          />
          <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>max {debateRoundsCap}</span>
        </div>

        <h3 style={sectionHeader}>Chairman Model</h3>
        <input
          value={chairman}
          onChange={(e) => setChairman(e.target.value)}
          style={{ ...input, width: "100%" }}
        />

        <h3 style={sectionHeader}>Presets</h3>
        {presetsError && (
          <p style={{ color: "#e05252", fontSize: 12, margin: "0 0 8px" }}>Failed to load presets: {presetsError}</p>
        )}
        {!presetsError && presets.length === 0 && (
          <p style={{ color: "var(--text-meta)", fontSize: 13, margin: "0 0 8px" }}>No presets saved yet.</p>
        )}
        {presets.map((p) => (
          <div key={p.id} style={presetRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{p.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-meta)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.models.council_models.join(", ")} · {p.models.chairman_model}
              </div>
            </div>
            <button onClick={() => loadPreset(p)} style={loadBtn} title="Load preset">
              <Download size={13} /> Load
            </button>
            <button onClick={() => removePreset(p.id)} style={removeBtn} title="Delete preset">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <div style={row}>
          <input
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder="Preset name…"
            style={input}
            onKeyDown={(e) => e.key === "Enter" && saveAsPreset()}
          />
          <button
            onClick={saveAsPreset}
            style={addBtn}
            disabled={presetSaving || !newPresetName.trim() || models.length === 0}
            title="Save current models as preset"
          >
            <BookmarkPlus size={14} /> {presetSaving ? "Saving…" : "Save"}
          </button>
        </div>

        <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
          <button onClick={save} style={saveBtn}>
            {saved ? "✅ Saved!" : "Save"}
          </button>
          <button onClick={onClose} style={cancelBtn}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const overlay = { position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 };
const modal = { background:"var(--bg-secondary)", padding:30, borderRadius:12, minWidth:400, color:"var(--text-primary)", border:"1px solid var(--border-primary)" };
const sectionHeader = { margin: "16px 0 8px 0", color: "var(--text-primary)", fontSize: 14, fontWeight: 600 };
const row = { display:"flex", alignItems:"center", gap:10, marginBottom:8 };
const themeRow = { display:"flex", gap:8, marginBottom:8 };
const themeBtn = { flex:1, padding:"8px 0", background:"var(--bg-tertiary)", border:"1px solid var(--border-primary)", borderRadius:6, color:"var(--text-primary)", cursor:"pointer", fontSize:13 };
const themeBtnActive = { background:"var(--text-accent)", borderColor:"var(--text-accent)", color:"#fff" };
const input = { background:"var(--bg-tertiary)", border:"1px solid var(--border-primary)", borderRadius:6, padding:"6px 10px", color:"var(--text-primary)", flex:1 };
const removeBtn = { background:"#c0392b", border:"none", borderRadius:6, color:"#fff", padding:"4px 8px", cursor:"pointer" };
const addBtn = { background:"#2980b9", border:"none", borderRadius:6, color:"#fff", padding:"6px 12px", cursor:"pointer" };
const saveBtn = { background:"#27ae60", border:"none", borderRadius:6, color:"#fff", padding:"8px 20px", cursor:"pointer" };
const cancelBtn = { background:"var(--bg-hover)", border:"1px solid var(--border-primary)", borderRadius:6, color:"var(--text-primary)", padding:"8px 20px", cursor:"pointer" };
const presetRow = { display:"flex", alignItems:"center", gap:8, marginBottom:8, padding:"8px 10px", background:"var(--bg-tertiary)", borderRadius:6, border:"1px solid var(--border-primary)" };
const loadBtn = { display:"flex", alignItems:"center", gap:4, background:"#2980b9", border:"none", borderRadius:6, color:"#fff", padding:"4px 10px", cursor:"pointer", fontSize:12, flexShrink:0 };
