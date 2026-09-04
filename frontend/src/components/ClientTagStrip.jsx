import { useMemo } from 'react';

/**
 * Faixa compacta de tags mais usadas nos decks de um cliente.
 * facets: [{category, tag, deck_count}] já filtradas pelo cliente.
 * activeTag: {tag, category} selecionada (ou null).
 */
export function ClientTagStrip({ facets, loading, activeTag, onSelect, onClear, maxPerGroup = 10 }) {
  const { products, audiences } = useMemo(() => {
    const products = [];
    const audiences = [];
    for (const f of facets || []) {
      if (f.category === 'audiencia') audiences.push(f);
      else if (f.category === 'solucao' || f.category === 'feature') products.push(f);
    }
    return { products: products.slice(0, maxPerGroup), audiences: audiences.slice(0, maxPerGroup) };
  }, [facets, maxPerGroup]);

  if (loading) {
    return (
      <div className="mb-6 flex flex-wrap gap-1.5 animate-pulse">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-7 rounded-md bg-ink-100 dark:bg-ink-800/40" style={{ width: 64 + (i % 4) * 20 }} />
        ))}
      </div>
    );
  }
  if (!products.length && !audiences.length) return null;

  return (
    <div className="mb-6 rounded-xl border border-ink-200 dark:border-ink-700/40 bg-ink-50/40 dark:bg-ink-800/30 px-4 py-3 animate-fade-in">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-[10px] tracking-[0.2em] font-medium text-ink-500 dark:text-ink-400">
          TAGS MAIS USADAS NESTE CLIENTE
        </div>
        {activeTag && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-ink-500 hover:text-hypr-cyan transition-colors"
          >
            limpar filtro ×
          </button>
        )}
      </div>

      {products.length > 0 && (
        <Row label="Soluções & Features" items={products} tone="cyan" activeTag={activeTag} onSelect={onSelect} />
      )}
      {audiences.length > 0 && (
        <Row label="Audiências" items={audiences} tone="amber" activeTag={activeTag} onSelect={onSelect} />
      )}
    </div>
  );
}

function Row({ label, items, tone, activeTag, onSelect }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1">
      <span className="text-[10px] text-ink-400 dark:text-ink-500 w-full sm:w-auto sm:mr-1">{label}</span>
      {items.map((f) => {
        const active = activeTag?.tag === f.tag && activeTag?.category === f.category;
        const toneCls =
          tone === 'amber'
            ? active
              ? 'bg-amber-500/15 border-amber-400 text-amber-800 dark:text-amber-200'
              : 'border-amber-300/60 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/20'
            : active
              ? 'bg-hypr-cyan/15 border-hypr-cyan text-hypr-cyan-dark dark:text-hypr-cyan'
              : 'border-hypr-cyan/40 text-hypr-cyan-dark dark:text-hypr-cyan hover:bg-hypr-cyan/5';
        return (
          <button
            key={`${f.category}|${f.tag}`}
            type="button"
            onClick={() => onSelect(active ? null : { tag: f.tag, category: f.category })}
            className={`h-7 pl-2.5 pr-1.5 rounded-md border text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors ${toneCls}`}
            title={`${f.deck_count} deck${f.deck_count === 1 ? '' : 's'}`}
          >
            <span className="truncate max-w-[200px]">{f.tag}</span>
            <span className="text-[9px] px-1 rounded bg-black/5 dark:bg-white/10 opacity-80 tabular-nums">{f.deck_count}</span>
          </button>
        );
      })}
    </div>
  );
}
