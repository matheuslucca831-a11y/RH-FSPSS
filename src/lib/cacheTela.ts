'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Memória das telas enquanto o site está aberto: ao voltar para uma aba,
 * mostra na hora o que já tinha e atualiza por trás (sem tela em branco).
 * Fica só na memória da aba do navegador e é apagada ao sair do sistema.
 */
const memoria = new Map<string, unknown>();

let dono: string | null = null;

export function limparCacheTelas() {
  memoria.clear();
}

/** Leitura/gravação direta (para telas com carregamento próprio) */
export const lerCache = <T,>(chave: string) => memoria.get(chave) as T | undefined;
export const gravarCache = (chave: string, dados: unknown) => void memoria.set(chave, dados);

/** Garante que a memória é do usuário logado (troca de login = memória limpa) */
export function definirDonoCache(usuarioId: string) {
  if (dono !== usuarioId) {
    memoria.clear();
    dono = usuarioId;
  }
}

type Resultado<T> = { dados: T | undefined; carregando: boolean; atualizando: boolean; erro: string | null; recarregar: () => void };

/**
 * `carregar` busca os dados; `deps` mudam a consulta (filtros, versão...).
 * A chave deve identificar a consulta (inclua os filtros nela).
 */
export function useConsulta<T>(chave: string, carregar: () => Promise<T>, deps: unknown[] = []): Resultado<T> {
  const [dados, setDados] = useState<T | undefined>(() => memoria.get(chave) as T | undefined);
  const [buscando, setBuscando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;

  useEffect(() => {
    let vivo = true;
    const guardado = memoria.get(chave) as T | undefined;
    if (guardado !== undefined) setDados(guardado);
    setBuscando(true);
    carregarRef.current()
      .then((d) => {
        if (!vivo) return;
        memoria.set(chave, d);
        setDados(d);
        setErro(null);
      })
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => vivo && setBuscando(false));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, versao, ...deps]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return { dados, carregando: buscando && dados === undefined, atualizando: buscando && dados !== undefined, erro, recarregar };
}
