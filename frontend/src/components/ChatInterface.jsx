import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Stage1 from './Stage1';
import Stage2 from './Stage2';
import Stage3 from './Stage3';
import Stage4 from './Stage4';
import Stage5 from './Stage5';
import TldrCard from './TldrCard';
import './ChatInterface.css';

export default function ChatInterface({
  conversation,
  onSendMessage,
  onStopMessage = () => {},
  isLoading,
  mode = 'council',
  statusText = '',
  errorText = '',
  approvalText = '',
  onStartCodex = () => {},
  onStopCodex = () => {},
  canStartCodex = false,
  canStopCodex = false,
  accountLabel = '',
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation, statusText, errorText, approvalText]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!conversation) {
    return (
      <div className="chat-interface">
        <div className="empty-state">
          <h2>{mode === 'codex' ? 'Welcome to LLM Council via Codex' : 'Welcome to LLM Council'}</h2>
          <p>Create a new conversation to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      {mode === 'codex' && (
        <div className="codex-toolbar">
          <div className="codex-toolbar-copy">
            <div className="codex-toolbar-title">Codex Session</div>
            <div className="codex-toolbar-status">{statusText || 'Codex idle.'}</div>
            {accountLabel && <div className="codex-toolbar-meta">Account: {accountLabel}</div>}
          </div>
          <div className="codex-toolbar-actions">
            <button type="button" className="codex-toolbar-button" onClick={onStartCodex} disabled={!canStartCodex}>
              Start Codex
            </button>
            <button type="button" className="codex-toolbar-button" onClick={onStopCodex} disabled={!canStopCodex}>
              Stop Codex
            </button>
          </div>
        </div>
      )}

      <div className="messages-container">
        {conversation.messages.length === 0 ? (
          <div className="empty-state">
            <h2>Start a conversation</h2>
            <p>{mode === 'codex' ? 'Send a prompt to stream a Codex reply' : 'Ask a question to consult the LLM Council'}</p>
          </div>
        ) : (
          conversation.messages.map((msg, index) => (
            <div key={index} className="message-group">
              {msg.role === 'user' ? (
                <div className="user-message">
                  <div className="message-label">You</div>
                  <div className="message-content">
                    <div className="markdown-content">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="assistant-message">
                  <div className="message-label">{mode === 'codex' ? 'Assistant' : 'LLM Council'}</div>

                  {mode === 'codex' ? (
                    <div className="message-content assistant-markdown">
                      <div className="markdown-content">
                        <ReactMarkdown>{msg.content || ''}</ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <>
                      {msg.loading?.stage1 && (
                        <div className="stage-loading">
                          <div className="spinner"></div>
                          <span>Running Stage 1: Collecting individual responses...</span>
                        </div>
                      )}
                      {msg.stage1 && <Stage1 responses={msg.stage1} />}

                      {msg.loading?.stage2 && (
                        <div className="stage-loading">
                          <div className="spinner"></div>
                          <span>Running Stage 2: Peer rankings...</span>
                        </div>
                      )}
                      {msg.stage2 && (
                        <Stage2
                          rankings={msg.stage2}
                          labelToModel={msg.metadata?.label_to_model}
                          aggregateRankings={msg.metadata?.aggregate_rankings}
                        />
                      )}

                      {msg.loading?.stage3 && (
                        <div className="stage-loading">
                          <div className="spinner"></div>
                          <span>Running Stage 3: Final synthesis...</span>
                        </div>
                      )}
                      {msg.stage3 && <Stage3 finalResponse={msg.stage3} />}

                      {msg.loading?.stage4 && (
                        <div className="stage-loading">
                          <div className="spinner"></div>
                          <span>Running Stage 4: Council debate{msg.stage4?.length > 0 ? ` (round ${msg.stage4.length} complete)` : ''}...</span>
                        </div>
                      )}
                      {msg.stage4 && msg.stage4.length > 0 && <Stage4 debate={msg.stage4} />}

                      {msg.loading?.stage5 && (
                        <div className="stage-loading">
                          <div className="spinner"></div>
                          <span>Running Stage 5: Debate verdict...</span>
                        </div>
                      )}
                      {msg.stage5 && <Stage5 verdict={msg.stage5} />}

                      {msg.loading?.tldr && (
                        <div className="stage-loading">
                          <div className="spinner"></div>
                          <span>Generating TL;DR summary...</span>
                        </div>
                      )}
                      {msg.tldr && <TldrCard tldr={msg.tldr} />}
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {mode === 'codex' && approvalText && (
          <div className="codex-callout codex-callout-warning">
            <div className="codex-callout-title">Approval requested</div>
            <pre>{approvalText}</pre>
          </div>
        )}

        {mode === 'codex' && errorText && (
          <div className="codex-callout codex-callout-error">
            <div className="codex-callout-title">Error</div>
            <p>{errorText}</p>
          </div>
        )}

        {isLoading && (
          <div className="loading-indicator">
            <div className="spinner"></div>
            <span>{mode === 'codex' ? 'Streaming Codex response...' : 'Consulting the council...'}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {(conversation.messages.length === 0 || mode === 'codex') && (
        <form className="input-form" onSubmit={handleSubmit}>
          <textarea
            className="message-input"
            placeholder={mode === 'codex' ? 'Send a prompt to Codex... (Shift+Enter for new line, Enter to send)' : 'Ask your question... (Shift+Enter for new line, Enter to send)'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading || (mode === 'codex' && !canStopCodex)}
            rows={3}
          />
          <button
            type={isLoading && mode !== 'codex' ? 'button' : 'submit'}
            className="send-button"
            onClick={isLoading && mode !== 'codex' ? onStopMessage : undefined}
            disabled={isLoading ? false : (!input.trim() || (mode === 'codex' && !canStopCodex))}
          >
            {isLoading && mode !== 'codex' ? 'Stop' : 'Send'}
          </button>
        </form>
      )}
    </div>
  );
}
