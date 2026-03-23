import { useEffect, useState } from 'react';
import './Sidebar.css';

const MIN_WIDTH = 240;
const MAX_WIDTH = 480;
const COLLAPSED_WIDTH = 64;

const getConversationLabel = (conversation) => {
  const title = (conversation.title || 'New Conversation').trim();
  return title.slice(0, 1).toUpperCase();
};

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  width,
  isCollapsed,
  onResize,
  onToggleCollapse,
}) {
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) {
      return undefined;
    }

    const handleMouseMove = (event) => {
      onResize(event.clientX);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onResize]);

  const sidebarWidth = isCollapsed ? COLLAPSED_WIDTH : width;

  return (
    <div
      className={`sidebar-shell ${isCollapsed ? 'collapsed' : ''}`}
      style={{ width: sidebarWidth }}
    >
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand-row">
            {!isCollapsed && <h1>LLM Council</h1>}
            <button
              type="button"
              className="sidebar-toggle-btn"
              onClick={onToggleCollapse}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? '»' : '«'}
            </button>
          </div>
          <button
            type="button"
            className={`new-conversation-btn ${isCollapsed ? 'collapsed' : ''}`}
            onClick={onNewConversation}
            title="New conversation"
          >
            <span className="new-conversation-icon">+</span>
            {!isCollapsed && <span>New Conversation</span>}
          </button>
        </div>

        <div className="conversation-list">
          {conversations.length === 0 ? (
            <div className="no-conversations">
              {isCollapsed ? '—' : 'No conversations yet'}
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${
                  conv.id === currentConversationId ? 'active' : ''
                } ${isCollapsed ? 'collapsed' : ''}`}
              >
                <button
                  type="button"
                  className="conversation-select-btn"
                  onClick={() => onSelectConversation(conv.id)}
                  title={conv.title || 'New Conversation'}
                >
                  {isCollapsed ? (
                    <span className="conversation-collapsed-label">
                      {getConversationLabel(conv)}
                    </span>
                  ) : (
                    <>
                      <div className="conversation-title">
                        {conv.title || 'New Conversation'}
                      </div>
                      <div className="conversation-meta">
                        {conv.message_count} messages
                      </div>
                    </>
                  )}
                </button>
                {!isCollapsed && (
                  <button
                    type="button"
                    className="conversation-delete-btn"
                    aria-label={`Delete ${conv.title || 'conversation'}`}
                    title="Delete conversation"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (window.confirm(`Delete "${conv.title || 'New Conversation'}"?`)) {
                        onDeleteConversation(conv.id);
                      }
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {!isCollapsed && (
        <button
          type="button"
          className={`sidebar-resizer ${isResizing ? 'active' : ''}`}
          aria-label={`Resize sidebar between ${MIN_WIDTH} and ${MAX_WIDTH} pixels`}
          title="Drag to resize"
          onMouseDown={() => setIsResizing(true)}
        />
      )}
    </div>
  );
}
