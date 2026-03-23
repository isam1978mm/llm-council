import { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import Stage1 from './Stage1';
import Stage2 from './Stage2';
import Stage3 from './Stage3';
import './ChatInterface.css';

function getMessageSearchableText(message) {
  if (!message) {
    return '';
  }

  if (message.role === 'user') {
    return message.content || '';
  }

  const parts = [];

  if (message.stage1) {
    message.stage1.forEach((response) => {
      parts.push(response.model || '');
      parts.push(response.response || '');
    });
  }

  if (message.stage2) {
    message.stage2.forEach((ranking) => {
      parts.push(ranking.model || '');
      parts.push(ranking.ranking || '');
      parts.push((ranking.parsed_ranking || []).join(' '));
    });
  }

  if (message.metadata?.aggregate_rankings) {
    message.metadata.aggregate_rankings.forEach((ranking) => {
      parts.push(ranking.model || '');
    });
  }

  if (message.stage3) {
    parts.push(message.stage3.model || '');
    parts.push(message.stage3.response || '');
  }

  return parts.join(' ');
}

export default function ChatInterface({
  conversation,
  onSendMessage,
  isLoading,
}) {
  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const messagesEndRef = useRef(null);
  const messageRefs = useRef([]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const matchingMessageIndexes = useMemo(() => {
    if (!conversation || !normalizedSearchQuery) {
      return [];
    }

    return conversation.messages.reduce((matches, message, index) => {
      const searchableText = getMessageSearchableText(message).toLowerCase();
      if (searchableText.includes(normalizedSearchQuery)) {
        matches.push(index);
      }
      return matches;
    }, []);
  }, [conversation, normalizedSearchQuery]);

  const clampedActiveMatchIndex = matchingMessageIndexes.length === 0
    ? 0
    : Math.min(activeMatchIndex, matchingMessageIndexes.length - 1);
  const activeMessageIndex = matchingMessageIndexes[clampedActiveMatchIndex] ?? null;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation]);


  useEffect(() => {
    if (activeMessageIndex === null) {
      return;
    }

    messageRefs.current[activeMessageIndex]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [activeMessageIndex]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };

  const handleKeyDown = (e) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSearchNavigation = (direction) => {
    if (matchingMessageIndexes.length === 0) {
      return;
    }

    setActiveMatchIndex((prev) => {
      if (direction === 'next') {
        return (prev + 1) % matchingMessageIndexes.length;
      }
      return (prev - 1 + matchingMessageIndexes.length) % matchingMessageIndexes.length;
    });
  };

  if (!conversation) {
    return (
      <div className="chat-interface">
        <div className="empty-state">
          <h2>Welcome to LLM Council</h2>
          <p>Create a new conversation to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      {conversation.messages.length > 0 && (
        <div className="chat-search-bar">
          <div className="chat-search-input-group">
            <span className="chat-search-icon" aria-hidden="true">🔎</span>
            <input
              type="search"
              className="chat-search-input"
              placeholder="Search within this chat"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search messages in this conversation"
            />
          </div>

          <div className="chat-search-actions">
            <span className="chat-search-count" aria-live="polite">
              {normalizedSearchQuery
                ? `${matchingMessageIndexes.length === 0 ? 0 : clampedActiveMatchIndex + 1} / ${matchingMessageIndexes.length}`
                : 'Type to search'}
            </span>
            <button
              type="button"
              className="chat-search-nav-btn"
              onClick={() => handleSearchNavigation('previous')}
              disabled={matchingMessageIndexes.length === 0}
              aria-label="Go to previous search result"
            >
              ↑
            </button>
            <button
              type="button"
              className="chat-search-nav-btn"
              onClick={() => handleSearchNavigation('next')}
              disabled={matchingMessageIndexes.length === 0}
              aria-label="Go to next search result"
            >
              ↓
            </button>
          </div>
        </div>
      )}

      <div className="messages-container">
        {conversation.messages.length === 0 ? (
          <div className="empty-state">
            <h2>Start a conversation</h2>
            <p>Ask a question to consult the LLM Council</p>
          </div>
        ) : (
          conversation.messages.map((msg, index) => {
            const isMatch = matchingMessageIndexes.includes(index);
            const isActiveMatch = activeMessageIndex === index;

            return (
              <div
                key={index}
                ref={(element) => {
                  messageRefs.current[index] = element;
                }}
                className={`message-group ${isMatch ? 'search-match' : ''} ${isActiveMatch ? 'active-search-match' : ''}`.trim()}
              >
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
                    <div className="message-label">LLM Council</div>

                    {/* Stage 1 */}
                    {msg.loading?.stage1 && (
                      <div className="stage-loading">
                        <div className="spinner"></div>
                        <span>Running Stage 1: Collecting individual responses...</span>
                      </div>
                    )}
                    {msg.stage1 && <Stage1 responses={msg.stage1} />}

                    {/* Stage 2 */}
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

                    {/* Stage 3 */}
                    {msg.loading?.stage3 && (
                      <div className="stage-loading">
                        <div className="spinner"></div>
                        <span>Running Stage 3: Final synthesis...</span>
                      </div>
                    )}
                    {msg.stage3 && <Stage3 finalResponse={msg.stage3} />}
                  </div>
                )}
              </div>
            );
          })
        )}

        {isLoading && (
          <div className="loading-indicator">
            <div className="spinner"></div>
            <span>Consulting the council...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {conversation.messages.length === 0 && (
        <form className="input-form" onSubmit={handleSubmit}>
          <textarea
            className="message-input"
            placeholder="Ask your question... (Shift+Enter for new line, Enter to send)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={3}
          />
          <button
            type="submit"
            className="send-button"
            disabled={!input.trim() || isLoading}
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
