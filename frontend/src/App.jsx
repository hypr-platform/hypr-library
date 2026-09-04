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
import { HomeDashboard } from './components/HomeDashboard.jsx';
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
  // activeClient === null → tela inicial (Home)
  const [activeClient, setActiveClient] = useState(null);
  const [decks, setDecks] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('all');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedDeck, setSelectedDeck] = useState(null);
  // Modo TAG: { tag, category } selecionada na Home (ou via chip)
  const [activeTag, setActiveTag] = useState(null);
  const [tagDecks, setTagDecks] = useState([]);
  const [loadingTag, setLoadingTag] = useState(false);
  const [tagFacets, setTagFacets] = useState([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Estado da Home (dashboard quando nenhum cliente selecionado)
  const [stats, setStats] = useState(null);
  const [recentDecks, setRecentDecks] = useState([]);
  const [loadingHome, setLoadingHome] = useState(false);

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
        // Não auto-seleciona mais nenhum cliente — fica na Home por padrão
      })
      .catch((e) => {
        console.error('Falha ao carregar clientes:', e);
        setApiError(e.message);
      })
      .finally(() => setLoadingClients(false));
  }, [user]);

  // 2) Carrega stats + recentes ao mostrar a Home
  useEffect(() => {
    if (!user || activeClient !== null) return;
    setLoadingHome(true);
    Promise.all([api.stats(), api.recent(18)])
      .then(([statsData, recentData]) => {
        setStats(statsData);
        setRecentDecks(recentData.decks);
      })
      .catch((e) => {
        console.error('Falha ao carregar home:', e);
        setApiError(e.message);
      })
      .finally(() => setLoadingHome(false));
  }, [user, activeClient]);

  // 2b) Facetas de tags (uma vez por sessão; falha silenciosa se tabela vazia)
  useEffect(() => {
    if (!user) return;
    setLoadingTags(true);
    api
      .tags()
      .then((data) => setTagFacets(data?.tags || []))
      .catch(() => setTagFacets([]))
      .finally(() => setLoadingTags(false));
  }, [user]);

  // 2c) Decks da tag ativa
  useEffect(() => {
    if (!user || !activeTag) return;
    setLoadingTag(true);
    api
      .decksByTag(activeTag.tag, null, 100)
      .then((data) => setTagDecks(data?.decks || []))
      .catch((e) => {
        console.error('Falha ao carregar decks da tag:', e);
        setApiError(e.message);
      })
      .finally(() => setLoadingTag(false));
  }, [user, activeTag]);

  // 3) Carrega decks do cliente ativo
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

  // 4) Busca semântica quando query muda
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
  const isTagMode = !!activeTag && !isSearchActive;
  const isHome = !activeClient && !isSearchActive && !isTagMode;
  const displayedDecks = isSearchActive ? searchResults : isTagMode ? tagDecks : decks;
  const showClientBadge = (isSearchActive && searchScope === 'all') || isTagMode;

  // Título e label do header
  let sectionLabel, sectionTitle;
  if (isSearchActive && searchScope === 'all') {
    sectionLabel = 'BUSCA EM TODA BIBLIOTECA';
    sectionTitle = (
      <>
        Busca <span className="text-hypr-cyan font-light">semântica</span>
      </>
    );
  } else if (isSearchActive && searchScope === 'client') {
    sectionLabel = `BUSCA EM ${activeClient?.toUpperCase()}`;
    sectionTitle = (
      <>
        Busca <span className="text-hypr-cyan font-light">semântica</span>
      </>
    );
  } else if (isTagMode) {
    sectionLabel = activeTag.category === 'audiencia' ? 'AUDIÊNCIA' : 'SOLUÇÃO / FEATURE';
    sectionTitle = <span className="font-light">{activeTag.tag}</span>;
  } else if (isHome) {
    sectionLabel = 'VISÃO GERAL';
    sectionTitle = <span className="font-light">Biblioteca HYPR</span>;
  } else {
    sectionLabel = 'CLIENTE SELECIONADO';
    sectionTitle = <span className="font-light">{activeClient}</span>;
  }

  // Contador de decks no badge superior
  let deckBadgeCount;
  if (isSearchActive || isTagMode) {
    deckBadgeCount = displayedDecks.length;
  } else if (isHome) {
    deckBadgeCount = stats?.total_decks ?? '—';
  } else {
    deckBadgeCount = displayedDecks.length;
  }
  const deckBadgeLabel = deckBadgeCount === 1 ? 'DECK' : 'DECKS';

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-ink-900">
      <Sidebar
        clients={clients}
        activeClient={activeClient}
        onSelect={(c) => {
          setActiveClient(c);
          setActiveTag(null);
          setSearchQuery('');
        }}
        onHome={() => {
          setActiveClient(null);
          setActiveTag(null);
          setSearchQuery('');
        }}
        dark={dark}
        onToggleDark={toggleDark}
        user={user}
        onLogout={logout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 overflow-y-auto scroll-thin bg-white dark:bg-ink-900 w-full">
        {/* Top breadcrumb */}
        <div className="border-b border-ink-200/60 dark:border-ink-700/30 px-4 lg:px-10 py-3.5 flex items-center justify-between bg-white dark:bg-ink-900 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {/* Hamburger - só mobile */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden w-9 h-9 -ml-1 rounded-md hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center justify-center text-ink-600 dark:text-ink-300"
              aria-label="Abrir menu"
            >
              <Icon.Menu />
            </button>
            <div className="flex items-center gap-2 text-[11px] text-ink-400 dark:text-ink-500 tracking-wider">
              <button
                onClick={() => {
                  setActiveClient(null);
                  setActiveTag(null);
                  setSearchQuery('');
                }}
                className="hover:text-ink-700 dark:hover:text-ink-200 transition-colors"
              >
                BIBLIOTECA
              </button>
              {isTagMode && (
                <>
                  <span className="text-ink-300 dark:text-ink-700">/</span>
                  <span className="text-ink-700 dark:text-ink-200 font-medium hidden sm:inline">TAG</span>
                </>
              )}
              <span className="text-ink-300 dark:text-ink-700">/</span>
              <span className="text-ink-700 dark:text-ink-200 font-medium hidden sm:inline">
                AUDIENCE DISCOVERY
              </span>
            </div>
          </div>
          <HyprLogo size="sm" />
        </div>

        <div className="max-w-6xl mx-auto px-4 lg:px-10 py-6 lg:py-8">
          {/* Section title HYPR style */}
          <div className="flex items-baseline justify-between mb-6 lg:mb-8 gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-2 lg:mb-3">
                <div className="w-0.5 h-5 bg-hypr-cyan shrink-0"></div>
                <div className="text-[10px] tracking-[0.22em] font-medium text-ink-500 dark:text-ink-400 truncate">
                  {sectionLabel}
                </div>
              </div>
              <h1 className="text-[22px] lg:text-[28px] font-light text-ink-900 dark:text-ink-50 tracking-tight leading-none truncate">
                {sectionTitle}
              </h1>
            </div>
            <div className="text-[11px] text-ink-500 dark:text-ink-400 px-3 py-1.5 rounded-md bg-ink-100/60 dark:bg-ink-800/40 font-medium tracking-wide border border-ink-200/40 dark:border-ink-700/30 shrink-0 whitespace-nowrap">
              {deckBadgeCount} {deckBadgeLabel}
            </div>
          </div>

          <SmartSearchBar
            query={searchQuery}
            onChange={setSearchQuery}
            scope={searchScope}
            onScopeChange={setSearchScope}
            activeClient={activeClient}
            isSearching={isSearching}
            showSuggestions={true}
          />

          {apiError && (
            <div className="mb-4 px-4 py-3 rounded-md bg-hypr-pink-soft/30 border border-hypr-pink/30 text-[13px] text-hypr-pink animate-fade-in">
              {apiError}
            </div>
          )}

          {/* Conteúdo principal: 3 modos */}
          {isSearchActive ? (
            // Modo BUSCA
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedDecks.length === 0 && !isSearching && (
                <EmptyState
                  icon={<Icon.SearchOff />}
                  title="Nenhum deck encontrado"
                  subtitle="Tenta termos mais amplos como 'jovem', 'esporte', 'premium'"
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
          ) : isTagMode ? (
            // Modo TAG (decks que têm a tag, com o slide onde aparece)
            loadingTag ? (
              <LoadingGrid />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="col-span-full -mt-2 mb-1 flex items-center gap-2 text-[11px] text-ink-500 dark:text-ink-400">
                  <button
                    onClick={() => setActiveTag(null)}
                    className="px-2 h-6 rounded-md border border-ink-200 dark:border-ink-700 hover:border-hypr-cyan hover:text-hypr-cyan transition-colors"
                  >
                    ← Todas as tags
                  </button>
                  <span>Abrir um deck já cai no slide da tag.</span>
                </div>
                {displayedDecks.length === 0 && (
                  <EmptyState
                    icon={<Icon.SearchOff />}
                    title="Nenhum deck com essa tag"
                    subtitle="O tagging roda no sync diário — decks novos aparecem aqui no dia seguinte"
                  />
                )}
                {displayedDecks.map((deck) => (
                  <DeckCard
                    key={deck.deck_id}
                    deck={deck}
                    showClientBadge={true}
                    onClick={() => setSelectedDeck(deck)}
                  />
                ))}
              </div>
            )
          ) : isHome ? (
            // Modo HOME (dashboard de visão geral)
            <HomeDashboard
              stats={stats}
              recentDecks={recentDecks}
              onDeckClick={setSelectedDeck}
              loading={loadingHome}
              tagFacets={tagFacets}
              loadingTags={loadingTags}
              onTagSelect={(t) => {
                setActiveClient(null);
                setSearchQuery('');
                setActiveTag(t);
              }}
            />
          ) : (
            // Modo CLIENTE selecionado
            loadingDecks || loadingClients ? (
              <LoadingGrid />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayedDecks.length === 0 && (
                  <EmptyState
                    icon={<Icon.Presentation />}
                    title="Sem decks para este cliente"
                    subtitle="A pasta deste cliente ainda não tem audience discoveries de 2025+ indexadas"
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
            )
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
        <PreviewModal
          deck={selectedDeck}
          initialSlide={selectedDeck.slides?.[0]?.slide_object_id || null}
          onClose={() => setSelectedDeck(null)}
        />
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
