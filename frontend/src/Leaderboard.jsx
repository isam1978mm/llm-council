import { useState, useEffect } from 'react';
import { api } from './api';

export default function Leaderboard({ onClose }) {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getStats().then((data) => {
      setStats(data);
      setLoading(false);
    });
  }, []);

  const medal = (index) => ['🥇', '🥈', '🥉'][index] || `#${index + 1}`;

  const barColor = (winRate) => {
    if (winRate >= 0.6) return '#27ae60';
    if (winRate >= 0.3) return '#f39c12';
    return '#e74c3c';
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>🏆 Model Leaderboard</h2>
          <button type="button" onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-subtle)' }}>Loading stats...</p>
        ) : stats.length === 0 ? (
          <p style={{ color: 'var(--text-subtle)' }}>No data yet — run some queries first!</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-subtle)', fontSize: 12, textAlign: 'left' }}>
                <th style={th}>Rank</th>
                <th style={th}>Model</th>
                <th style={th}>Win Rate</th>
                <th style={th}>Wins</th>
                <th style={th}>Appearances</th>
                <th style={th}>Avg Rank</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat, index) => (
                <tr key={stat.model} style={{ borderBottom: '1px solid var(--table-border)' }}>
                  <td style={td}>{medal(index)}</td>
                  <td style={{ ...td, fontSize: 13 }}>{stat.model.split('/')[1] || stat.model}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ background: 'var(--progress-track)', borderRadius: 4, width: 80, height: 8 }}>
                        <div
                          style={{
                            background: barColor(stat.win_rate),
                            width: `${stat.win_rate * 100}%`,
                            height: '100%',
                            borderRadius: 4,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 12 }}>{Math.round(stat.win_rate * 100)}%</span>
                    </div>
                  </td>
                  <td style={{ ...td, color: '#27ae60' }}>{stat.wins}</td>
                  <td style={td}>{stat.total_appearances}</td>
                  <td style={td}>{stat.avg_rank}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 20 }}>
          Based on peer rankings across all council sessions. Lower avg rank = better.
        </p>
      </div>
    </div>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'var(--overlay-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 };
const modal = { background: 'var(--modal-bg)', padding: 30, borderRadius: 12, width: 640, maxWidth: '90vw', color: 'var(--modal-text)', maxHeight: '80vh', overflowY: 'auto', border: '1px solid var(--modal-border)', boxShadow: 'var(--modal-shadow)' };
const closeBtn = { background: 'var(--button-muted-bg)', border: 'none', borderRadius: 6, color: 'var(--button-muted-text)', padding: '4px 10px', cursor: 'pointer', fontSize: 16 };
const th = { padding: '8px 12px', fontWeight: 600 };
const td = { padding: '10px 12px', color: 'var(--modal-text)' };
