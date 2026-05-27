import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth.js';
import { useTheme } from './hooks/useTheme.js';
import { api } from './lib/api.js';
import { LoginScreen } from './components/LoginScreen.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { SmartSearchBar } from './components/SmartSearchBar.jsx';
import { DeckCard } from './components/DeckCard.jsx';
import { PreviewModal } from './components/PreviewModal.jsx';
import { HyprLogo } from './components/HyprLogo.jsx';
import { Icon } from './lib/icons.jsx';

// Debounce para busca semântica (evita disparar request a cada tecla)
function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function App() {
  const { user, loading: authLoading, error: authError, logout, renderGoogleButton } = useAuth();
  const [dark, toggleDark] = useTheme();

  const [clients, setClients] = useState([]);
  const [activeClient, setActiveClient] = useState(null);
  const [decks, setDecks] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('all');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedDeck, setSelectedDeck] = useState(null);

  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingDecks, setLoadingDecks] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [apiError, setApiError] = useState(null);

  const debouncedQuery = useDebounce(searchQuery, 400);

  // 1) Carrega lista de clientes ao logar
  useEffect(() => {
    if (!user) return;
    setLoadingClients(true);
    api
      .clients()
      .then((data) => {
        setClients(data.clients);
        if (data.clients.length > 0 && !activeClient) {
          setActiveClient(data.clients[0].name);
        }
      })
      .catch((e) => {
        console.error('Falha ao carregar clientes:', e);
        setApiError(e.message);
      })
      .finally(() => setLoadingClients(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // 2) Carrega decks do cliente ativo
  useEffect(() => {
    if (!user || !activeClient) return;
    setLoadingDecks(true);
    api
      .decks(activeClient)
      .then((data) => setDecks(data.decks))
      .catch((e) => {
        console.error('Falha ao carregar decks:', e);
        setApiError(e.message);
      })
      .finally(() => setLoadingDecks(false));
  }, [user, activeClient]);

  // 3) Busca semântica quando query muda
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const clientFilter = searchScope === 'client' ? activeClient : null;
    api
      .search(debouncedQuery, clientFilter)
      .then((data) => setSearchResults(data.results))
      .catch((e) => {
        console.error('Falha na busca:', e);
        setApiError(e.message);
      })
      .finally(() => setIsSearching(false));
  }, [debouncedQuery, searchScope, activeClient]);

  // ============================================================
  // EARLY RETURNS
  // ============================================================
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-ink-900">
        <div className="text-ink-400">Carregando…</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLoad={renderGoogleButton} error={authError} />;
  }

  // ============================================================
  // MAIN APP
  // ============================================================
  const isSearchActive = debouncedQuery.trim().length > 0;
  const displayedDecks = isSearchActive ? searchResults : decks;
  const showClientBadge = isSearchActive && searchScope === 'all';

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-ink-900">
      <Sidebar
        clients={clients}
        activeClient={activeClient}
        onSelect={(c) => {
          setActiveClient(c);
          setSearchQuery('');
        }}
        dark={dark}
        onToggleDark={toggleDark}
        user={user}
        onLogout={logout}
      />

      <main className="flex-1 overflow-y-auto scroll-thin bg-white dark:bg-ink-900">
        {/* Top breadcrumb */}
        <div className="border-b border-ink-200/60 dark:border-ink-700/30 px-10 py-3.5 flex items-center justify-between bg-white dark:bg-ink-900">
          <div className="flex items-center gap-2 text-[11px] text-ink-400 dark:text-ink-500 tracking-wider">
            <span>BIBLIOTECA</span>
            <span className="text-ink-300 dark:text-ink-700">/</span>
            <span className="text-ink-700 dark:text-ink-200 font-medium">
              AUDIENCE DISCOVERY
            </span>
          </div>
          <HyprLogo size="sm" />
        </div>

        <div className="max-w-6xl mx-auto px-10 py-8">
          {/* Section title HYPR style */}
          <div className="flex items-baseline justify-between mb-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-0.5 h-5 bg-hypr-cyan"></div>
                <div className="text-[10px] tracking-[0.22em] font-medium text-ink-500 dark:text-ink-400">
                  {isSearchActive && searchScope === 'all'
                    ? 'BUSCA EM TODA BIBLIOTECA'
                    : 'CLIENTE SELECIONADO'}
                </div>
              </div>
              <h1 className="text-[28px] font-light text-ink-900 dark:text-ink-50 tracking-tight leading-none">
                {isSearchActive && searchScope === 'all' ? (
                  <>
                    Busca <span className="text-hypr-cyan font-light">semântica</span>
                  </>
                ) : (
                  <span className="font-light">{activeClient || 'Carregando…'}</span>
                )}
              </h1>
            </div>
            <div className="text-[11px] text-ink-500 dark:text-ink-400 px-3 py-1.5 rounded-md bg-ink-100/60 dark:bg-ink-800/40 font-medium tracking-wide border border-ink-200/40 dark:border-ink-700/30">
              {displayedDecks.length} {displayedDecks.length === 1 ? 'DECK' : 'DECKS'}
            </div>
          </div>

          <SmartSearchBar
            query={searchQuery}
            onChange={setSearchQuery}
            scope={searchScope}
            onScopeChange={setSearchScope}
            activeClient={activeClient}
            isSearching={isSearching}
          />

          {apiError && (
            <div className="mb-4 px-4 py-3 rounded-md bg-hypr-pink-soft/30 border border-hypr-pink/30 text-[13px] text-hypr-pink animate-fade-in">
              {apiError}
            </div>
          )}

          {/* Grid */}
          {(loadingDecks || loadingClients) && !isSearchActive ? (
            <LoadingGrid />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedDecks.length === 0 && isSearchActive && !isSearching && (
                <EmptyState
                  icon={<Icon.SearchOff />}
                  title="Nenhum deck encontrado"
                  subtitle="Tenta termos mais amplos como 'jovem', 'esporte', 'premium'"
                />
              )}
              {displayedDecks.length === 0 && !isSearchActive && !loadingDecks && (
                <EmptyState
                  icon={<Icon.Presentation />}
                  title="Sem decks para este cliente"
                  subtitle="A pasta deste cliente ainda não tem audience discoveries indexadas"
                />
              )}
              {displayedDecks.map((deck) => (
                <DeckCard
                  key={deck.deck_id}
                  deck={deck}
                  showClientBadge={showClientBadge}
                  onClick={() => setSelectedDeck(deck)}
                />
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="mt-16 pt-6 border-t border-ink-200/60 dark:border-ink-700/30 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-sm bg-ink-dark dark:bg-white"></div>
              <span className="text-[10px] text-ink-500 dark:text-ink-400 tracking-wider font-medium">
                FY26 OFICIAL
              </span>
            </div>
            <span className="text-[10px] text-ink-500 dark:text-ink-400 tracking-wider font-light">
              Own the Journey
            </span>
            <span className="text-[10px] text-ink-500 dark:text-ink-400 tracking-wider font-light">
              2026
            </span>
          </div>
        </div>
      </main>

      {selectedDeck && (
        <PreviewModal deck={selectedDeck} onClose={() => setSelectedDeck(null)} />
      )}
    </div>
  );
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="col-span-full py-20 flex flex-col items-center justify-center text-center">
      <div className="text-ink-300 dark:text-ink-600 mb-3">{icon}</div>
      <div className="text-[14px] font-medium text-ink-700 dark:text-ink-200 mb-1">
        {title}
      </div>
      <div className="text-[12px] text-ink-400 dark:text-ink-500 max-w-xs font-light">
        {subtitle}
      </div>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-ink-100/50 dark:bg-ink-800/30 rounded-xl border border-ink-200 dark:border-ink-700/40 animate-pulse"
        >
          <div className="aspect-[16/10] bg-ink-200/50 dark:bg-ink-700/30 rounded-t-xl" />
          <div className="p-3 px-3.5">
            <div className="h-3 bg-ink-200 dark:bg-ink-700/50 rounded mb-2 w-3/4" />
            <div className="h-2 bg-ink-200 dark:bg-ink-700/50 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
