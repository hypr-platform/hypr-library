/**
 * API client for HYPR Library backend.
 * Adds Authorization header automatically from stored Google ID token.
 */
const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  throw new Error('VITE_API_URL não está definido. Cheque .env.local');
}

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function getToken() {
  return sessionStorage.getItem('hypr_id_token');
}

export function setToken(token) {
  if (token) {
    sessionStorage.setItem('hypr_id_token', token);
  } else {
    sessionStorage.removeItem('hypr_id_token');
  }
}

export function clearToken() {
  sessionStorage.removeItem('hypr_id_token');
  sessionStorage.removeItem('hypr_user');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    // Token expirou ou domínio inválido → força logout
    if (res.status === 401) {
      clearToken();
      window.location.reload();
    }
    throw new ApiError(body?.error || res.statusText, res.status, body);
  }

  return body;
}

export const api = {
  health: () => request('/health'),
  clients: () => request('/clients'),
  stats: () => request('/stats'),
  recent: (limit = 20) => request(`/recent?limit=${limit}`),
  decks: (client) => request(`/decks?client=${encodeURIComponent(client)}`),
  deck: (deckId) => request(`/deck/${deckId}`),
  // Tags por slide (solução / feature / audiência) geradas no sync
  deckTags: (deckId) => request(`/deck/${deckId}/tags`),
  tags: (category = null, clientFilter = null) => {
    const q = [];
    if (category) q.push(`category=${encodeURIComponent(category)}`);
    if (clientFilter) q.push(`client=${encodeURIComponent(clientFilter)}`);
    return request(`/tags${q.length ? `?${q.join('&')}` : ''}`);
  },
  tagAnalytics: () => request('/tags/analytics'),
  decksByTag: (tag, clientFilter = null, limit = 50) =>
    request(
      `/tags/decks?tag=${encodeURIComponent(tag)}` +
        (clientFilter ? `&client=${encodeURIComponent(clientFilter)}` : '') +
        `&limit=${limit}`
    ),
  search: (query, clientFilter = null, limit = 20) =>
    request('/search', {
      method: 'POST',
      body: JSON.stringify({ query, client: clientFilter, limit }),
    }),
  // URL do proxy de thumbnail (servida pelo backend, com cache de 7 dias).
  // Não usa fetch() — vai direto no src de uma <img>.
  thumbnailUrl: (deckId, size = 600) =>
    `${API_URL}/thumbnail/${deckId}?size=${size}`,
};

export { ApiError };
