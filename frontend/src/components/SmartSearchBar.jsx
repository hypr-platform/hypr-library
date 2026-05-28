import { Icon } from '../lib/icons.jsx';

// Chips de busca sugeridos — mostrados quando não há query ativa
const SEARCH_SUGGESTIONS = [
  'gen z e moda',
  'alta renda automobilismo',
  'corredores e fitness',
  'gamers mobile',
  'campanhas back-to-school',
  'fintech e bancarizado',
];

export function SmartSearchBar({
  query,
  onChange,
  scope,
  onScopeChange,
  activeClient,
  isSearching,
  showSuggestions = true,
}) {
  return (
    <div className="mb-6">
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-hypr-cyan">
          {isSearching ? (
            <Icon.Loader className="animate-spin" />
          ) : (
            <Icon.Sparkles />
          )}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Descreva o que você procura: 'corredores premium', 'gamers gen z', 'alta renda automobilismo'…"
          className="w-full h-12 pl-12 pr-48 text-[14px] font-normal rounded-lg bg-ink-100/50 dark:bg-ink-800/40 border border-ink-200 dark:border-ink-700 text-ink-900 dark:text-ink-50 placeholder:text-ink-400 dark:placeholder:text-ink-500 focus:outline-none focus:border-hypr-cyan focus:ring-4 focus:ring-hypr-cyan/10 focus:bg-white dark:focus:bg-ink-800 transition-all"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query && (
            <button
              onClick={() => onChange('')}
              className="w-7 h-7 rounded-md hover:bg-ink-100 dark:hover:bg-ink-700/40 flex items-center justify-center text-ink-400"
              aria-label="Limpar"
            >
              <Icon.X />
            </button>
          )}
          <button
            onClick={() => onScopeChange(scope === 'all' ? 'client' : 'all')}
            disabled={!activeClient}
            className={`h-8 px-3 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-colors tracking-wide ${
              scope === 'client' && activeClient
                ? 'bg-hypr-cyan text-white'
                : 'bg-white dark:bg-ink-700/60 text-ink-600 dark:text-ink-300 border border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-700'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title={
              activeClient
                ? `Limitar busca a ${activeClient}`
                : 'Selecione um cliente'
            }
          >
            <Icon.Filter />
            {scope === 'client' && activeClient
              ? activeClient
              : 'Toda biblioteca'}
          </button>
        </div>
      </div>

      {/* Estado: busca ativa → mostra info de relevância */}
      {query && (
        <div className="mt-2.5 text-[11px] text-ink-400 dark:text-ink-400 flex items-center gap-1.5 px-1 animate-fade-in tracking-wide">
          <div className="w-1 h-1 rounded-full bg-hypr-cyan"></div>
          BUSCA HÍBRIDA · TEXTO + SEMÂNTICA · ORDEM POR DATA
        </div>
      )}

      {/* Estado: sem busca → mostra chips de sugestão */}
      {!query && showSuggestions && (
        <div className="mt-3 flex flex-wrap gap-2 animate-fade-in">
          <span className="text-[10px] tracking-[0.18em] font-medium text-ink-400 dark:text-ink-500 self-center mr-1">
            SUGESTÕES
          </span>
          {SEARCH_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => onChange(suggestion)}
              className="group inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-ink-100/60 dark:bg-ink-800/40 border border-ink-200/80 dark:border-ink-700/40 text-[12px] font-normal text-ink-700 dark:text-ink-300 hover:bg-hypr-cyan/10 hover:border-hypr-cyan/40 hover:text-hypr-cyan transition-all"
            >
              <span className="text-hypr-cyan/70 group-hover:text-hypr-cyan transition-colors">
                <Icon.Sparkles />
              </span>
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
