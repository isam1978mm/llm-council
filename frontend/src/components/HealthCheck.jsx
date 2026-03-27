import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import './HealthCheck.css';

function HealthCheck({ onProceed, onCancel }) {
  // null = pending, true = ok, false = failed
  const [statuses, setStatuses] = useState(null);
  const [summary, setSummary] = useState(null);
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
      setSummary(null);
    }

    try {
      const data = await api.checkHealth();
      setStatuses(data.results.map((r) => ({ model: r.model, ok: r.ok, reason: r.reason, role: r.role })));
      setSummary({
        canProceed: data.can_proceed,
        allOk: data.all_ok,
        healthyModels: data.healthy_models ?? [],
        failedModels: data.failed_models ?? [],
        usableCount: data.usable_count ?? 0,
        chairmanOk: data.chairman_ok,
      });
    } catch (e) {
      setError('Could not reach backend. Is the server running?');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  const failedStatuses = statuses ? statuses.filter((s) => s.ok === false) : [];
  const failedModels = failedStatuses.map((s) => s.model);
  const pending = !statuses || statuses.some((s) => s.ok === null);
  const canProceed = summary?.canProceed
    ?? (statuses !== null && statuses.some((s) => s.ok === true && s.role !== 'chairman'));
  const hasPartialFailure = summary && !summary.allOk && summary.usableCount > 0;

  return (
    <div className="health-check-overlay">
      <div className="health-check-modal">
        <h2 className="health-check-title">Model Health Check</h2>
        <p className="health-check-subtitle">
          Verifying council models are reachable before starting.
        </p>

        {error && <div className="health-check-error">{error}</div>}

        {hasPartialFailure && !pending && (
          <div className="health-check-warning">
            {summary.usableCount} of {statuses.filter(s => s.role !== 'chairman' || !summary.chairmanOk).length + summary.usableCount} model{summary.usableCount !== 1 ? 's' : ''} healthy.
            Failed models will be skipped — the council will continue with the remaining {summary.usableCount}.
          </div>
        )}

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
                <span className="health-check-model-name">
                  {s.model}
                  {s.role === 'chairman' && <span className="health-check-role-tag"> (chairman)</span>}
                </span>
                {s.ok === false && s.reason && (
                  <span className="health-check-reason">{s.reason}</span>
                )}
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
            disabled={pending || !canProceed}
          >
            {hasPartialFailure ? 'Proceed Anyway' : 'Proceed'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default HealthCheck;
