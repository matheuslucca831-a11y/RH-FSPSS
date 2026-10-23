type Celula = string | number | boolean | null | undefined;

/** Gera e baixa um CSV que o Excel abre com acentos (UTF-8 com BOM, separador ;) */
export function baixarCSV(nome: string, cabecalho: string[], linhas: Celula[][]) {
  const esc = (v: Celula) => {
    let t = v === null || v === undefined ? '' : String(v);
    // Evita "injeção de fórmula": texto começando com = + - @ vira texto puro no Excel
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const texto = [cabecalho, ...linhas].map((l) => l.map(esc).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
