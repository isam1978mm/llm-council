import { useState, useRef, useEffect } from 'react';
import {
  X, PanelLeftClose, PanelLeftOpen, SquarePen, Search,
  MessageSquare, MoreHorizontal, Pencil, Trash2,
  Trophy, Settings, LogOut, Database,
} from 'lucide-react';
import { api } from '../api';
import './Sidebar.css';

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onRenameConversation,
  onShowSettings,
  onShowLeaderboard,
  onShowModels,
  isOpen,
  onClose,
  onLogout,
  userEmail,
  searchEnabled = true,
  showLeaderboard = true,
  showSettings = true,
  showModels = true,
  showLogout = true,
  appTitle = 'LLM Council',
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(260);
  const [resizing, setResizing] = useState(false);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  const [openMenuId, setOpenMenuId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    const onClickOutside = () => setOpenMenuId(null);
    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, []);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isResizing.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = Math.min(400, Math.max(150, startWidth.current + delta));
      setWidth(newWidth);
    };
    const onMouseUp = () => {
      if (!isResizing.current) return;
      isResizing.current = false;
      setResizing(false);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    clearTimeout(debounceRef.current);
    if (!searchEnabled) {
      return;
    }
    if (!value.trim()) {
      setSearchResults(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await api.searchConversations(value.trim());
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const clearSearch = () => {
    setQuery('');
    setSearchResults(null);
    clearTimeout(debounceRef.current);
  };

  const handleResizeStart = (e) => {
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    setResizing(true);
    e.preventDefault();
  };

  const COLLAPSED_WIDTH = 52;
  const sidebarStyle = {
    width: collapsed ? COLLAPSED_WIDTH : width,
    transition: resizing ? 'none' : undefined,
  };

  return (
    <div
      className={`sidebar${isOpen ? ' sidebar--open' : ''}${collapsed ? ' sidebar--collapsed' : ''}${resizing ? ' sidebar--resizing' : ''}`}
      style={sidebarStyle}
    >
      <div className="sidebar-header">
        <button className="sidebar-close" onClick={onClose} title="Close sidebar"><X size={14} /></button>
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        <h1 className="sidebar-title">{appTitle}</h1>
        <button className="new-conversation-btn" onClick={onNewConversation} title="New Conversation">
          <SquarePen size={16} className="btn-icon" />
          <span className="sidebar-text"> New Conversation</span>
        </button>
        {searchEnabled && (
          <div className="search-box sidebar-text">
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              type="text"
              placeholder="Search conversations..."
              value={query}
              onChange={handleSearchChange}
            />
            {query && (
              <button className="search-clear" onClick={clearSearch} title="Clear search"><X size={12} /></button>
            )}
          </div>
        )}
      </div>

      <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />

      <div className="conversation-list">
        {searching && (
          <div className="no-conversations sidebar-text">Searching...</div>
        )}
        {!searching && searchResults !== null && searchResults.length === 0 && (
          <div className="no-conversations sidebar-text">No matches found</div>
        )}
        {!searching && (searchResults ?? conversations).map((conv) => (
          <div
            key={conv.id}
            className={`conversation-item${conv.id === currentConversationId ? ' active' : ''}${searchResults !== null ? ' search-match' : ''}`}
            onClick={() => { if (renamingId !== conv.id) onSelectConversation(conv.id); }}
            title={renamingId === conv.id ? undefined : (conv.title || 'New Conversation')}
          >
            <span className="item-icon">{searchResults !== null ? <Search size={15} /> : <MessageSquare size={15} />}</span>
            <div className="sidebar-text" style={{ flex: 1, minWidth: 0 }}>
              {renamingId === conv.id ? (
                <input
                  className="rename-input"
                  value={renameValue}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (renameValue.trim()) onRenameConversation(conv.id, renameValue.trim());
                      setRenamingId(null);
                    } else if (e.key === 'Escape') {
                      setRenamingId(null);
                    }
                  }}
                  onBlur={() => {
                    if (renameValue.trim()) onRenameConversation(conv.id, renameValue.trim());
                    setRenamingId(null);
                  }}
                />
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
            </div>
            <div className="conv-menu-wrap" onClick={(e) => e.stopPropagation()}>
              <button
                className="menu-btn"
                title="More options"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(openMenuId === conv.id ? null : conv.id);
                }}
              >
                <MoreHorizontal size={15} />
              </button>
              {openMenuId === conv.id && (
                <div className="conv-menu">
                  <button
                    onClick={() => {
                      setRenameValue(conv.title || '');
                      setRenamingId(conv.id);
                      setOpenMenuId(null);
                    }}
                  >
                    <Pencil size={13} /> Rename
                  </button>
                  <button
                    className="conv-menu-delete"
                    onClick={() => {
                      setOpenMenuId(null);
                      if (window.confirm('Delete this conversation?')) {
                        onDeleteConversation(conv.id);
                      }
                    }}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {!searching && searchResults === null && conversations.length === 0 && (
          <div className="no-conversations sidebar-text">No conversations yet</div>
        )}
      </div>

      <div className="sidebar-footer">
        {showLeaderboard && (
          <button className="sidebar-footer-btn" onClick={onShowLeaderboard} title="Leaderboard">
            <Trophy size={16} className="footer-btn-icon" />
            <span className="sidebar-text"> Leaderboard</span>
          </button>
        )}
        {showSettings && (
          <button className="sidebar-footer-btn" onClick={onShowSettings} title="Settings">
            <Settings size={16} className="footer-btn-icon" />
            <span className="sidebar-text"> Settings</span>
          </button>
        )}
        {showModels && (
          <button className="sidebar-footer-btn" onClick={onShowModels} title="Models">
            <Database size={16} className="footer-btn-icon" />
            <span className="sidebar-text"> Models</span>
          </button>
        )}
        {userEmail && (
          <div className="sidebar-user sidebar-text">
            <span className="user-email">{userEmail}</span>
          </div>
        )}
        {showLogout && (
          <button className="sidebar-footer-btn sidebar-logout" onClick={onLogout} title="Log out">
            <LogOut size={16} className="footer-btn-icon" />
            <span className="sidebar-text"> Log out</span>
          </button>
        )}
      </div>
    </div>
  );
}
