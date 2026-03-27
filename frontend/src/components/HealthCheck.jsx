import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import './HealthCheck.css';

function HealthCheck({ onProceed, onCancel }) {
  // null = pending, true = ok, false = failed
  const [statuses, setStatuses] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  const runCheck = useCallback(async (modelsToRetry = null) => {
    setChecking(true);
    setError(null);

    if (modelsToRetry) {
      setStatuses((prev) =>
        prev.map((s) => (modelsToRetry.includes(s.model) ? { ...s, ok: null } : s))
      );
    } else {
      setStatuses(null);
    }

    try {
      const data = await api.checkHealth();
      setStatuses(data.results.map((r) => ({ model: r.model, ok: r.ok })));
    } catch (e) {
      setError('Could not reach backend. Is the server running?');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  const failedModels = statuses ? statuses.filter((s) => s.ok === false).map((s) => s.model) : [];
  const allOk = statuses && statuses.length > 0 && statuses.every((s) => s.ok === true);
  const pending = !statuses || statuses.some((s) => s.ok === null);

  return (
    <div className="health-check-overlay">
      <div className="health-check-modal">
        <h2 className="health-check-title">Model Health Check</h2>
        <p className="health-check-subtitle">
          Verifying all council models are reachable before starting.
        </p>

        {error && <div className="health-check-error">{error}</div>}

        <ul className="health-check-list">
          {statuses === null && !error ? (
            <li className="health-check-item">
              <span className="health-check-spinner" />
              <span className="health-check-model-name">Querying models…</span>
            </li>
          ) : (
            (statuses || []).map((s) => (
              <li key={s.model} className="health-check-item">
                {s.ok === null ? (
                  <span className="health-check-spinner" />
                ) : s.ok ? (
                  <span className="health-check-icon ok">✅</span>
                ) : (
                  <span className="health-check-icon fail">❌</span>
                )}
                <span className="health-check-model-name">{s.model}</span>
              </li>
            ))
          )}
        </ul>

        <div className="health-check-actions">
          {failedModels.length > 0 && !pending && (
            <button
              className="health-check-btn retry"
              onClick={() => runCheck(failedModels)}
              disabled={checking}
            >
              {checking ? 'Retrying…' : 'Retry Failed'}
            </button>
          )}

          {checking && statuses === null && (
            <button className="health-check-btn retry" disabled>
              Checking…
            </button>
          )}

          <button className="health-check-btn cancel" onClick={onCancel}>
            Cancel
          </button>

          <button
            className="health-check-btn proceed"
            onClick={onProceed}
            disabled={!allOk}
          >
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}

export default HealthCheck;
