import { useState, useMemo } from 'react';
import { HyprLogo } from './HyprLogo.jsx';
import { Icon } from '../lib/icons.jsx';

export function Sidebar({
  clients,
  activeClient,
  onSelect,
  onHome,
  dark,
  onToggleDark,
  user,
  onLogout,
  isOpen = false,
  onClose,
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () =>
      clients.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase())
      ),
    [clients, query]
  );

  const userInitials = user?.name
    ? user.name
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'HY';

  // Wrapper de seleção que também fecha o drawer no mobile
  const handleSelect = (name) => {
    onSelect(name);
    onClose?.();
  };
  const handleHome = () => {
    onHome();
    onClose?.();
  };

  return (
    <>
      {/* Overlay escuro no mobile quando drawer aberto */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-72 lg:w-64 shrink-0
          border-r border-ink-200 dark:border-ink-700/40
          bg-ink-50 dark:bg-ink-900 flex flex-col h-screen
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
      {/* Brand + Theme toggle */}
      <div className="px-5 pt-6 pb-4 flex items-center justify-between border-b border-ink-200/60 dark:border-ink-700/30">
        <button
          onClick={handleHome}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          aria-label="Voltar para Início"
        >
          <div className="w-8 h-8 rounded-md bg-ink-dark dark:bg-white flex items-center justify-center">
            <span className="text-white dark:text-ink-900 font-medium text-[11px] tracking-wider">
              BH
            </span>
          </div>
          <div className="flex flex-col leading-tight items-start">
            <HyprLogo size="sm" />
            <span className="text-[10px] text-ink-400 tracking-[0.18em] mt-0.5">
              BIBLIOTECA
            </span>
          </div>
        </button>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleDark}
            className="w-8 h-8 rounded-md border border-ink-200 dark:border-ink-700 hover:bg-white dark:hover:bg-ink-800 transition-colors flex items-center justify-center text-ink-500 dark:text-ink-400"
            aria-label="Alternar tema"
          >
            {dark ? <Icon.Sun /> : <Icon.Moon />}
          </button>
          {/* Botão fechar - só no mobile */}
          <button
            onClick={onClose}
            className="lg:hidden w-8 h-8 rounded-md border border-ink-200 dark:border-ink-700 hover:bg-white dark:hover:bg-ink-800 transition-colors flex items-center justify-center text-ink-500 dark:text-ink-400"
            aria-label="Fechar menu"
          >
            <Icon.X />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400">
            <Icon.Search />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente"
            className="w-full h-9 pl-9 pr-3 text-[13px] rounded-md bg-white dark:bg-ink-800/60 border border-ink-200 dark:border-ink-700 text-ink-900 dark:text-ink-50 placeholder:text-ink-400 dark:placeholder:text-ink-500 focus:outline-none focus:border-hypr-cyan focus:ring-2 focus:ring-hypr-cyan/20 font-normal"
          />
        </div>
      </div>

      {/* Label */}
      <div className="px-5 pt-3 pb-1.5 flex items-center gap-2">
        <div className="w-0.5 h-3 bg-hypr-cyan"></div>
        <div className="text-[10px] tracking-[0.2em] font-medium text-ink-500 dark:text-ink-400">
          NAVEGAÇÃO
        </div>
      </div>

      {/* Home button */}
      <div className="px-2">
        <button
          onClick={handleHome}
          className={`w-full text-left px-3 py-2 lg:py-1.5 rounded-md text-[14px] lg:text-[13px] transition-all flex items-center gap-2 group ${
            activeClient === null
              ? 'bg-hypr-cyan/10 dark:bg-hypr-cyan/15 text-hypr-cyan font-medium border-l-2 border-hypr-cyan -ml-[2px] pl-[14px]'
              : 'text-ink-600 dark:text-ink-300 hover:bg-white dark:hover:bg-ink-800/40 hover:text-ink-900 dark:hover:text-ink-50 font-normal border-l-2 border-transparent -ml-[2px] pl-[14px]'
          }`}
        >
          <Icon.Sparkles />
          <span>Início</span>
        </button>
      </div>

      {/* Label CLIENTES */}
      <div className="px-5 pt-4 pb-1.5 flex items-center gap-2">
        <div className="w-0.5 h-3 bg-hypr-cyan"></div>
        <div className="text-[10px] tracking-[0.2em] font-medium text-ink-500 dark:text-ink-400">
          CLIENTES{' '}
          <span className="text-ink-400 dark:text-ink-500 font-normal ml-0.5">
            / {filtered.length}
          </span>
        </div>
      </div>

      {/* Client list */}
      <div className="flex-1 overflow-y-auto scroll-thin px-2 pb-4">
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-xs text-ink-400 text-center font-light">
            Nenhum cliente encontrado
          </div>
        )}
        {filtered.map((c) => (
          <button
            key={c.name}
            onClick={() => handleSelect(c.name)}
            className={`w-full text-left px-3 py-2 lg:py-1.5 rounded-md text-[14px] lg:text-[13px] transition-all flex items-center justify-between gap-2 group ${
              activeClient === c.name
                ? 'bg-hypr-cyan/10 dark:bg-hypr-cyan/15 text-hypr-cyan font-medium border-l-2 border-hypr-cyan -ml-[2px] pl-[14px]'
                : 'text-ink-600 dark:text-ink-300 hover:bg-white dark:hover:bg-ink-800/40 hover:text-ink-900 dark:hover:text-ink-50 font-normal border-l-2 border-transparent -ml-[2px] pl-[14px]'
            }`}
          >
            <span className="truncate">{c.name}</span>
            <span
              className={`text-[10px] font-normal ${
                activeClient === c.name
                  ? 'text-hypr-cyan'
                  : 'text-ink-400 dark:text-ink-500 group-hover:text-ink-500'
              }`}
            >
              {c.deck_count}
            </span>
          </button>
        ))}
      </div>

      {/* Footer with user */}
      <div className="px-4 py-3 border-t border-ink-200/60 dark:border-ink-700/30">
        <div className="flex items-center gap-2.5">
          {user?.picture ? (
            <img
              src={user.picture}
              alt={user.name}
              className="w-7 h-7 rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-hypr-cyan/15 dark:bg-hypr-cyan/20 flex items-center justify-center text-hypr-cyan font-medium text-[10px]">
              {userInitials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-ink-700 dark:text-ink-100 text-[12px] font-medium truncate">
              {user?.name || 'Usuário'}
            </div>
            <div className="text-[10px] text-ink-400 truncate font-light">
              {user?.email || ''}
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-7 h-7 rounded-md hover:bg-white dark:hover:bg-ink-800 text-ink-400 hover:text-ink-700 dark:hover:text-ink-200 transition-colors flex items-center justify-center"
            aria-label="Sair"
            title="Sair"
          >
            <Icon.Logout />
          </button>
        </div>
      </div>
      </aside>
    </>
  );
}
