import { Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './TldrCard.css';

export default function TldrCard({ tldr }) {
  if (!tldr) return null;

  return (
    <div className="tldr-card">
      <div className="tldr-header">
        <Zap size={14} className="tldr-icon" />
        <span className="tldr-title">TL;DR</span>
        <span className="tldr-model">{tldr.model.split('/')[1] || tldr.model}</span>
      </div>
      <div className="tldr-bullets markdown-content">
        <ReactMarkdown>{tldr.bullets}</ReactMarkdown>
      </div>
    </div>
  );
}
