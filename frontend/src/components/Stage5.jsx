import ReactMarkdown from 'react-markdown';
import './Stage5.css';

export default function Stage5({ verdict }) {
  if (!verdict) return null;

  return (
    <div className="stage stage5">
      <h3 className="stage-title">Stage 5: Debate Verdict</h3>
      <div className="verdict-response">
        <div className="chairman-label">
          Chairman: {verdict.model.split('/')[1] || verdict.model}
        </div>
        <div className="verdict-text markdown-content">
          <ReactMarkdown>{verdict.verdict}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
