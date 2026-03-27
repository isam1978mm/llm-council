/**
 * API client for the LLM Council backend.
 */
import { supabase } from './supabase';

/*const API_BASE = 'http://localhost:8001'; */
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { 'Authorization': `Bearer ${session.access_token}` } : {};
}

export const api = {
  async listConversations() {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      headers: await authHeaders(),
    });
    if (!response.ok) throw new Error('Failed to list conversations');
    return response.json();
  },
  async createConversation() {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...await authHeaders() },
      body: JSON.stringify({}),
    });
    if (!response.ok) throw new Error('Failed to create conversation');
    return response.json();
  },
  async getConversation(conversationId) {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
      headers: await authHeaders(),
    });
    if (!response.ok) throw new Error('Failed to get conversation');
    return response.json();
  },
  async sendMessage(conversationId, content) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await authHeaders() },
        body: JSON.stringify({ content }),
      }
    );
    if (!response.ok) throw new Error('Failed to send message');
    return response.json();
  },
  async sendMessageStream(conversationId, content, onEvent, signal) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message/stream`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await authHeaders() },
        body: JSON.stringify({ content }),
        signal,
      }
    );
    if (!response.ok) throw new Error('Failed to send message');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);
            onEvent(event.type, event);
          } catch (e) {
            console.error('Failed to parse SSE event:', e);
          }
        }
      }
    }
  },
  async searchConversations(q) {
    const response = await fetch(
      `${API_BASE}/api/conversations/search?q=${encodeURIComponent(q)}`,
      { headers: await authHeaders() }
    );
    if (!response.ok) throw new Error('Failed to search conversations');
    return response.json();
  },
  async deleteConversation(conversationId) {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete conversation');
    return response.json();
  },
  async renameConversation(conversationId, title) {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...await authHeaders() },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) throw new Error('Failed to rename conversation');
    return response.json();
  },
  async getConfig() {
    const response = await fetch(`${API_BASE}/api/config`);
    if (!response.ok) throw new Error('Failed to get config');
    return response.json();
  },
  async saveConfig(config) {
    const response = await fetch(`${API_BASE}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Failed to save config');
    return response.json();
  },
  async listPresets() {
    const response = await fetch(`${API_BASE}/api/presets`);
    if (!response.ok) throw new Error('Failed to list presets');
    return response.json();
  },
  async createPreset(name, council_models, chairman_model) {
    const response = await fetch(`${API_BASE}/api/presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, council_models, chairman_model }),
    });
    if (!response.ok) throw new Error('Failed to create preset');
    return response.json();
  },
  async deletePreset(presetId) {
    const response = await fetch(`${API_BASE}/api/presets/${presetId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete preset');
    return response.json();
  },
  async getStats() {
    const response = await fetch(`${API_BASE}/api/stats`);
    if (!response.ok) throw new Error('Failed to get stats');
    return response.json();
  },
  async listAvailableModels(activeOnly = false) {
    const response = await fetch(`${API_BASE}/api/models?active_only=${activeOnly ? 'true' : 'false'}`);
    if (!response.ok) throw new Error('Failed to load available models');
    return response.json();
  },
  async createAvailableModel(model) {
    const response = await fetch(`${API_BASE}/api/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model),
    });
    if (!response.ok) throw new Error('Failed to create model');
    return response.json();
  },
  async updateAvailableModel(modelId, updates) {
    const response = await fetch(`${API_BASE}/api/models/${modelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error('Failed to update model');
    return response.json();
  },
  async syncOpenRouterModels() {
    const response = await fetch(`${API_BASE}/api/models/sync-openrouter`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to sync OpenRouter models');
    return response.json();
  },
  async checkHealth() {
    const response = await fetch(`${API_BASE}/api/health-check`);
    if (!response.ok) throw new Error('Failed to run health check');
    return response.json();
  },
};
