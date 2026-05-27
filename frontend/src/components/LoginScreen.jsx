import { useEffect } from 'react';
import { HyprLogo } from './HyprLogo.jsx';
import { Icon } from '../lib/icons.jsx';

export function LoginScreen({ onLoad, error }) {
  useEffect(() => {
    // Espera o GSI carregar e renderiza o botão
    const tryRender = () => {
      if (window.google) {
        onLoad('google-signin-btn');
      } else {
        setTimeout(tryRender, 200);
      }
    };
    tryRender();
  }, [onLoad]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-ink-900 px-6">
      <div className="max-w-md w-full">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-md bg-ink-dark dark:bg-white flex items-center justify-center">
            <span className="text-white dark:text-ink-900 font-medium text-sm tracking-wider">
              BH
            </span>
          </div>
          <div className="flex flex-col leading-tight">
            <HyprLogo size="md" />
            <span className="text-[11px] text-ink-400 tracking-[0.18em] mt-1">
              BIBLIOTECA · AUDIENCE DISCOVERY
            </span>
          </div>
        </div>

        {/* Section title HYPR style */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-0.5 h-5 bg-hypr-cyan"></div>
          <div className="text-[10px] tracking-[0.22em] font-medium text-ink-500 dark:text-ink-400">
            ACESSO INTERNO
          </div>
        </div>

        <h1 className="text-[28px] font-light text-ink-900 dark:text-ink-50 mb-3 leading-tight">
          Entre com sua conta{' '}
          <span className="text-hypr-cyan">@hypr.mobi</span>
        </h1>

        <p className="text-[14px] text-ink-500 dark:text-ink-400 leading-relaxed mb-8 font-light">
          A biblioteca está disponível apenas para colaboradores HYPR.
          O acesso é validado via Google Workspace.
        </p>

        {/* Google Sign-In button (renderizado pelo GSI) */}
        <div id="google-signin-btn" className="mb-4" />

        {error && (
          <div className="mt-4 px-4 py-3 bg-hypr-pink-soft/30 border border-hypr-pink/30 rounded-md text-[13px] text-hypr-pink-soft dark:text-hypr-pink animate-fade-in">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="mt-20 pt-6 border-t border-ink-200/60 dark:border-ink-700/30 flex justify-between items-center">
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
    </div>
  );
}
