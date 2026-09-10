"use client";

import { useEffect, useState } from "react";

// Devuelve el valor retrasado `ms` tras la última actualización.
// Evita disparar un fetch por cada tecla en los buscadores.
export function useDebounce<T>(valor: T, ms = 300): T {
  const [debounced, setDebounced] = useState(valor);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);

  return debounced;
}
