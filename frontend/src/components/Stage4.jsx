import { useState } from 'react';
import { Shield, Swords, ChevronUp, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './Stage4.css';

export default function Stage4({ debate }) {
  const [openRound, setOpenRound] = useState(0); // 0-indexed, first round open by default

  if (!debate || debate.length === 0) return null;

  return (
    <div className="stage stage4">
      <h3 className="stage-title">Stage 4: Council Debate</h3>
      <div className="debate-rounds">
        {debate.map((round, idx) => (
          <div key={round.round} className="debate-round">
            <button
              className={`round-header${openRound === idx ? ' round-header--open' : ''}`}
              onClick={() => setOpenRound(openRound === idx ? -1 : idx)}
            >
              <span>Round {round.round}</span>
              <span className="round-toggle">{openRound === idx ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</span>
            </button>
            {openRound === idx && (
              <div className="round-messages">
                {round.messages.map((msg, i) => (
                  <div key={i} className={`debate-message debate-message--${msg.role}`}>
                    <div className="debate-model-label">
                      {msg.role === 'defender' ? <><Shield size={13} /> Defender</> : <><Swords size={13} /> Challenger</>}
                      <span className="debate-model-name">
                        {msg.model.split('/')[1] || msg.model}
                      </span>
                    </div>
                    <div className="markdown-content">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
