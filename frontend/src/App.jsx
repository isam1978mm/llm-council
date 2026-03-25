import { useState, useEffect, useRef } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import Settings from './Settings';
import Leaderboard from './Leaderboard';
import Models from './Models';
import Auth from './Auth';
import { api } from './api';
import { supabase } from './supabase';
import './App.css';

const isElectronCodex = typeof window !== 'undefined' && Boolean(window.codex);

function App() {
  if (isElectronCodex) {
    return <ElectronCodexApp />;
  }

  return <BrowserApp />;
}

function ElectronCodexApp() {
  const [conversations, setConversations] = useState([createCodexConversation(1)]);
  const [currentConversationId, setCurrentConversationId] = useState('codex-1');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system');
  const [showSettings, setShowSettings] = useState(false);
  const [statusText, setStatusText] = useState('Starting Codex...');
  const [errorText, setErrorText] = useState('');
  const [approvalText, setApprovalText] = useState('');
  const [accountLabel, setAccountLabel] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const currentConversation = conversations.find((conversation) => conversation.id === currentConversationId) ?? null;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const unsubscribe = window.codex.onEvent((event) => {
      switch (event.type) {
        case 'status':
          setStatusText(event.message ?? 'Codex status updated.');
          if (event.phase === 'stopped') {
            setIsRunning(false);
            setIsLoading(false);
          }
          break;
        case 'account':
          setAccountLabel(event.account?.type ?? 'signed in');
          setStatusText(event.message ?? 'Codex is ready.');
          setErrorText('');
          setIsRunning(true);
          break;
        case 'threadStarted':
          setStatusText(event.message ?? 'Codex thread started.');
          break;
        case 'turnStarted':
          setApprovalText('');
          setErrorText('');
          setStatusText('Waiting for streamed response...');
          setIsLoading(true);
          break;
        case 'delta':
          setConversations((prev) => appendCodexDelta(prev, currentConversationId, event.delta ?? ''));
          break;
        case 'turnCompleted':
          setIsLoading(false);
          setStatusText('Response complete.');
          setConversations((prev) => updateConversationMeta(prev, currentConversationId));
          break;
        case 'approval':
          setApprovalText(formatApproval(event));
          setStatusText(event.message ?? 'Approval requested.');
          break;
        case 'error':
          setErrorText(event.message ?? 'Codex returned an error.');
          setStatusText(event.message ?? 'Codex returned an error.');
          setIsLoading(false);
          break;
        case 'exit':
          setIsRunning(false);
          setIsLoading(false);
          setStatusText(event.message ?? 'Codex exited.');
          break;
        default:
          break;
      }
    });

    void startCodex();

    return unsubscribe;
  }, [currentConversationId]);

  const startCodex = async () => {
    try {
      setStatusText('Starting Codex...');
      setErrorText('');
      await window.codex.start();
    } catch (error) {
      setIsRunning(false);
      setIsLoading(false);
      setErrorText(error.message);
      setStatusText(error.message);
    }
  };

  const stopCodex = async () => {
    try {
      await window.codex.stop();
      setIsRunning(false);
      setIsLoading(false);
      setStatusText('Codex is stopped.');
    } catch (error) {
      setErrorText(error.message);
      setStatusText(error.message);
    }
  };

  const handleNewConversation = () => {
    const nextConversation = createCodexConversation(conversations.length + 1);
    setConversations((prev) => [nextConversation, ...prev]);
    setCurrentConversationId(nextConversation.id);
    setSidebarOpen(false);
  };

  const handleSelectConversation = (id) => {
    setCurrentConversationId(id);
    setSidebarOpen(false);
  };

  const handleDeleteConversation = (id) => {
    const remaining = conversations.filter((conversation) => conversation.id !== id);
    if (remaining.length === 0) {
      const fallback = createCodexConversation(1);
      setConversations([fallback]);
      setCurrentConversationId(fallback.id);
      return;
    }
    setConversations(remaining);
    if (currentConversationId === id) {
      setCurrentConversationId(remaining[0].id);
    }
  };

  const handleRenameConversation = (id, title) => {
    setConversations((prev) => prev.map((conversation) => (
      conversation.id === id ? { ...conversation, title } : conversation
    )));
  };

  const handleSendMessage = async (content) => {
    if (!currentConversationId || !isRunning) {
      return;
    }

    setErrorText('');
    setApprovalText('');
    setConversations((prev) => addCodexTurn(prev, currentConversationId, content));
    setIsLoading(true);

    try {
      await window.codex.sendPrompt(content);
    } catch (error) {
      setIsLoading(false);
      setErrorText(error.message);
      setStatusText(error.message);
      setConversations((prev) => appendCodexDelta(prev, currentConversationId, `Error: ${error.message}`));
    }
  };

  return (
    <div className="app">
      <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}>
        <Menu size={20} />
      </button>

      {showSettings && <Settings onClose={() => setShowSettings(false)} theme={theme} onThemeChange={setTheme} />}

      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onShowSettings={() => setShowSettings(true)}
        onShowLeaderboard={() => {}}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={stopCodex}
        userEmail={accountLabel ? `Codex: ${accountLabel}` : 'Codex'}
        searchEnabled={false}
        showLeaderboard={false}
        appTitle="LLM Council"
      />
      <ChatInterface
        conversation={currentConversation}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        mode="codex"
        statusText={statusText}
        errorText={errorText}
        approvalText={approvalText}
        onStartCodex={startCodex}
        onStopCodex={stopCodex}
        canStartCodex={!isRunning && !isLoading}
        canStopCodex={isRunning}
        accountLabel={accountLabel}
      />
    </div>
  );
}

function BrowserApp() {
  const [user, setUser] = useState(undefined);
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system');
  const activeStreamControllerRef = useRef(null);

  const loadConversations = async () => {
    try {
      const convs = await api.listConversations();
      setConversations(convs);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    }).catch(() => {
      setUser(null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => () => {
    activeStreamControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const convs = await api.listConversations();
        if (!cancelled) {
          setConversations(convs);
        }
      } catch (error) {
        console.error('Failed to load conversations:', error);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!currentConversationId) {
      return undefined;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const conv = await api.getConversation(currentConversationId);
        if (!cancelled) {
          setCurrentConversation(conv);
        }
      } catch (error) {
        console.error('Failed to load conversation:', error);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [currentConversationId]);

  const handleNewConversation = async () => {
    try {
      const newConv = await api.createConversation();
      setConversations([
        { id: newConv.id, created_at: newConv.created_at, message_count: 0 },
        ...conversations,
      ]);
      setCurrentConversationId(newConv.id);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleSelectConversation = (id) => {
    setCurrentConversationId(id);
    setSidebarOpen(false);
  };

  const handleDeleteConversation = async (id) => {
    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversationId === id) {
        setCurrentConversationId(null);
        setCurrentConversation(null);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const handleRenameConversation = async (id, title) => {
    try {
      await api.renameConversation(id, title);
      setConversations((prev) => prev.map((c) => c.id === id ? { ...c, title } : c));
    } catch (error) {
      console.error('Failed to rename conversation:', error);
    }
  };

  const handleSendMessage = async (content) => {
    if (!currentConversationId) return;

    const abortController = new AbortController();
    activeStreamControllerRef.current = abortController;
    setIsLoading(true);
    try {
      const userMessage = { role: 'user', content };
      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
      }));

      const assistantMessage = {
        role: 'assistant',
        stage1: null,
        stage2: null,
        stage3: null,
        stage4: [],
        stage5: null,
        tldr: null,
        metadata: null,
        loading: {
          stage1: false,
          stage2: false,
          stage3: false,
          stage4: false,
          stage5: false,
          tldr: false,
        },
      };

      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
      }));

      await api.sendMessageStream(currentConversationId, content, (eventType, event) => {
        switch (eventType) {
          case 'stage1_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage1 = true;
              return { ...prev, messages };
            });
            break;

          case 'stage1_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage1 = event.data;
              lastMsg.loading.stage1 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage2_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage2 = true;
              return { ...prev, messages };
            });
            break;

          case 'stage2_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage2 = event.data;
              lastMsg.metadata = event.metadata;
              lastMsg.loading.stage2 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage3_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage3 = true;
              return { ...prev, messages };
            });
            break;

          case 'stage3_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage3 = event.data;
              lastMsg.loading.stage3 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage4_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage4 = true;
              lastMsg.stage4 = [];
              return { ...prev, messages };
            });
            break;

          case 'stage4_round_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage4 = [...(lastMsg.stage4 || []), event.data];
              return { ...prev, messages };
            });
            break;

          case 'stage4_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage4 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage5_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage5 = true;
              return { ...prev, messages };
            });
            break;

          case 'stage5_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage5 = event.data;
              lastMsg.loading.stage5 = false;
              return { ...prev, messages };
            });
            break;

          case 'tldr_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.tldr = true;
              return { ...prev, messages };
            });
            break;

          case 'tldr_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.tldr = event.data;
              lastMsg.loading.tldr = false;
              return { ...prev, messages };
            });
            break;

          case 'title_complete':
            loadConversations();
            break;

          case 'complete':
            loadConversations();
            activeStreamControllerRef.current = null;
            setIsLoading(false);
            break;

          case 'error':
            console.error('Stream error:', event.message);
            activeStreamControllerRef.current = null;
            setIsLoading(false);
            break;

          default:
            console.log('Unknown event type:', eventType);
        }
      }, abortController.signal);
    } catch (error) {
      if (error.name === 'AbortError') {
        clearAssistantLoadingState();
        activeStreamControllerRef.current = null;
        setIsLoading(false);
        return;
      }

      console.error('Failed to send message:', error);
      activeStreamControllerRef.current = null;
      setCurrentConversation((prev) => ({
        ...prev,
        messages: prev.messages.slice(0, -2),
      }));
      setIsLoading(false);
    }
  };

  const handleStopMessage = () => {
    activeStreamControllerRef.current?.abort();
    activeStreamControllerRef.current = null;
    clearAssistantLoadingState();
    setIsLoading(false);
  };

  const clearAssistantLoadingState = () => {
    setCurrentConversation((prev) => {
      if (!prev?.messages?.length) {
        return prev;
      }

      const messages = [...prev.messages];
      const lastIndex = messages.length - 1;
      const lastMessage = messages[lastIndex];

      if (lastMessage?.role !== 'assistant' || !lastMessage.loading) {
        return prev;
      }

      messages[lastIndex] = {
        ...lastMessage,
        loading: Object.keys(lastMessage.loading).reduce((acc, key) => {
          acc[key] = false;
          return acc;
        }, {}),
      };

      return { ...prev, messages };
    });
  };

  if (user === undefined) return null;
  if (user === null) return <Auth />;

  const handleLogout = () => supabase.auth.signOut();

  return (
    <div className="app">
      <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}>
        <Menu size={20} />
      </button>

      {showLeaderboard && <Leaderboard onClose={() => setShowLeaderboard(false)} />}
      {showSettings && <Settings onClose={() => setShowSettings(false)} theme={theme} onThemeChange={setTheme} />}
      {showModels && <Models onClose={() => setShowModels(false)} />}

      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={() => { handleNewConversation(); setSidebarOpen(false); }}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onShowSettings={() => setShowSettings(true)}
        onShowLeaderboard={() => setShowLeaderboard(true)}
        onShowModels={() => setShowModels(true)}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={handleLogout}
        userEmail={user.email}
      />
      <ChatInterface
        conversation={currentConversation}
        onSendMessage={handleSendMessage}
        onStopMessage={handleStopMessage}
        isLoading={isLoading}
      />
    </div>
  );
}

function createCodexConversation(index = 1) {
  const id = `codex-${index}`;
  return {
    id,
    title: `Conversation ${index}`,
    created_at: new Date().toISOString(),
    message_count: 0,
    messages: [],
  };
}

function addCodexTurn(conversations, conversationId, content) {
  return conversations.map((conversation) => {
    if (conversation.id !== conversationId) {
      return conversation;
    }

    const title = conversation.message_count === 0 ? content.slice(0, 40) || conversation.title : conversation.title;
    return {
      ...conversation,
      title,
      message_count: conversation.message_count + 2,
      messages: [
        ...conversation.messages,
        { role: 'user', content },
        { role: 'assistant', content: '' },
      ],
    };
  });
}

function appendCodexDelta(conversations, conversationId, delta) {
  return conversations.map((conversation) => {
    if (conversation.id !== conversationId) {
      return conversation;
    }

    const messages = [...conversation.messages];
    if (messages.length === 0) {
      return conversation;
    }

    const lastIndex = messages.length - 1;
    const lastMessage = messages[lastIndex];

    if (lastMessage.role !== 'assistant') {
      messages.push({ role: 'assistant', content: delta });
      return { ...conversation, messages };
    }

    messages[lastIndex] = {
      ...lastMessage,
      content: `${lastMessage.content ?? ''}${delta}`,
    };

    return { ...conversation, messages };
  });
}

function updateConversationMeta(conversations, conversationId) {
  return conversations.map((conversation) => (
    conversation.id === conversationId
      ? { ...conversation, message_count: conversation.messages.length }
      : conversation
  ));
}

function formatApproval(event) {
  if (!event?.params) {
    return event?.message ?? 'Approval requested.';
  }

  try {
    return JSON.stringify(event.params, null, 2);
  } catch {
    return event.message ?? 'Approval requested.';
  }
}

export default App;
