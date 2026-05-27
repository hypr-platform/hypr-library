import { useState, useEffect, useCallback } from 'react';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { setToken, clearToken } from '../lib/api';

const ALLOWED_HD = import.meta.env.VITE_ALLOWED_HD || 'hypr.mobi';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/**
 * Hook que gerencia auth Google + restrição @hypr.mobi.
 * Usa Google Identity Services (GSI) direto via script global pra obter ID token.
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Restaura sessão existente
  useEffect(() => {
    const stored = sessionStorage.getItem('hypr_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        sessionStorage.removeItem('hypr_user');
      }
    }
    setLoading(false);
  }, []);

  // Carrega o script GSI uma única vez
  useEffect(() => {
    if (document.getElementById('gsi-script')) return;
    const script = document.createElement('script');
    script.id = 'gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  const handleCredentialResponse = useCallback((response) => {
    try {
      const decoded = jwtDecode(response.credential);

      if (decoded.hd !== ALLOWED_HD) {
        setError(
          `Acesso restrito a contas @${ALLOWED_HD}. ` +
            `Você fez login com ${decoded.email}.`
        );
        return;
      }

      const u = {
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
        hd: decoded.hd,
        sub: decoded.sub,
      };

      setToken(response.credential);
      sessionStorage.setItem('hypr_user', JSON.stringify(u));
      setUser(u);
      setError(null);
    } catch (e) {
      console.error('Erro no login:', e);
      setError('Falha ao validar token. Tente novamente.');
    }
  }, []);

  const login = useCallback(() => {
    if (!window.google) {
      setError('Google Identity Services ainda carregando, tenta de novo em 1s');
      return;
    }
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      hd: ALLOWED_HD,
    });
    window.google.accounts.id.prompt();
  }, [handleCredentialResponse]);

  const renderGoogleButton = useCallback(
    (elementId) => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        hd: ALLOWED_HD,
      });
      const el = document.getElementById(elementId);
      if (el) {
        window.google.accounts.id.renderButton(el, {
          type: 'standard',
          theme: 'filled_blue',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: 280,
        });
      }
    },
    [handleCredentialResponse]
  );

  const logout = useCallback(() => {
    googleLogout();
    clearToken();
    setUser(null);
  }, []);

  return { user, loading, error, login, logout, renderGoogleButton };
}
