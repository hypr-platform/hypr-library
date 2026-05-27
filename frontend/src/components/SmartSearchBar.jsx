import { Icon } from '../lib/icons';

export function SmartSearchBar({
  query,
  onChange,
  scope,
  onScopeChange,
  activeClient,
  isSearching,
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
      {query && (
        <div className="mt-2.5 text-[11px] text-ink-400 dark:text-ink-400 flex items-center gap-1.5 px-1 animate-fade-in tracking-wide">
          <div className="w-1 h-1 rounded-full bg-hypr-cyan"></div>
          BUSCA SEMÂNTICA · RESULTADOS ORDENADOS POR RELEVÂNCIA
        </div>
      )}
    </div>
  );
}
