import { Icon } from '../lib/icons.jsx';
import { DeckCard } from './DeckCard.jsx';
import { formatDate } from '../lib/utils.js';
import { TagExplorer } from './TagExplorer.jsx';

export function HomeDashboard({
  stats,
  recentDecks,
  onDeckClick,
  loading,
  tagFacets = [],
  loadingTags = false,
  onTagSelect,
}) {
  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="animate-fade-in">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <StatCard
          label="CLIENTES"
          value={stats?.total_clients ?? '—'}
          icon={<Icon.Users />}
        />
        <StatCard
          label="DECKS INDEXADOS"
          value={stats?.total_decks ?? '—'}
          icon={<Icon.PresentationSm />}
        />
        <StatCard
          label="VOLUME TOTAL"
          value={stats?.total_gb ? `${stats.total_gb} GB` : '—'}
          icon={<Icon.Database />}
        />
        <StatCard
          label="ATUALIZAÇÃO"
          value={stats?.most_recent ? formatDate(stats.most_recent) : '—'}
          icon={<Icon.Clock />}
        />
      </div>

      {/* Tag explorer */}
      <TagExplorer facets={tagFacets} loading={loadingTags} onSelect={onTagSelect} />

      {/* Recent decks section */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-0.5 h-4 bg-hypr-cyan"></div>
          <div className="text-[10px] tracking-[0.22em] font-medium text-ink-500 dark:text-ink-400">
            ADICIONADOS RECENTEMENTE
          </div>
        </div>
      </div>

      {recentDecks && recentDecks.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recentDecks.map((deck) => (
            <DeckCard
              key={deck.deck_id}
              deck={deck}
              showClientBadge={true}
              onClick={() => onDeckClick(deck)}
            />
          ))}
        </div>
      ) : (
        <div className="py-12 text-center text-[12px] text-ink-400 font-light">
          Nenhum deck encontrado.
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div className="rounded-xl bg-ink-50/60 dark:bg-ink-800/40 border border-ink-200 dark:border-ink-700/40 p-4 transition-colors hover:border-hypr-cyan/40">
      <div className="flex items-start justify-between mb-3">
        <div className="text-ink-400 dark:text-ink-500">{icon}</div>
      </div>
      <div className="text-[20px] font-light text-ink-900 dark:text-ink-50 tracking-tight leading-none mb-1.5">
        {value}
      </div>
      <div className="text-[9px] tracking-[0.18em] font-medium text-ink-500 dark:text-ink-400">
        {label}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl bg-ink-100 dark:bg-ink-800/40"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-ink-100/50 dark:bg-ink-800/30 rounded-xl border border-ink-200 dark:border-ink-700/40"
          >
            <div className="aspect-[16/10] bg-ink-200/50 dark:bg-ink-700/30 rounded-t-xl" />
            <div className="p-3 px-3.5">
              <div className="h-3 bg-ink-200 dark:bg-ink-700/50 rounded mb-2 w-3/4" />
              <div className="h-2 bg-ink-200 dark:bg-ink-700/50 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
