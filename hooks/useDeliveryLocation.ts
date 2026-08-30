"use client";

import { useEffect, useMemo, useState } from "react";

export interface DeliveryLocationOption {
  id: string;
  label: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  isDefaultShipping: boolean;
}

const STORAGE_KEY = "symbios:selected-delivery-address";

export function useDeliveryLocation(enabled: boolean) {
  const [addresses, setAddresses] = useState<DeliveryLocationOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setAddresses([]);
      setSelectedId(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch("/api/addresses", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : { addresses: [] }))
      .then((payload) => {
        if (cancelled) return;
        const options = (payload.addresses || []) as DeliveryLocationOption[];
        setAddresses(options);
        const stored = window.localStorage.getItem(STORAGE_KEY);
        const next =
          options.find((item) => item.id === stored && item.latitude !== null && item.longitude !== null) ||
          options.find((item) => item.isDefaultShipping && item.latitude !== null && item.longitude !== null) ||
          options.find((item) => item.latitude !== null && item.longitude !== null) ||
          null;
        setSelectedId(next?.id ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const selected = useMemo(
    () => addresses.find((item) => item.id === selectedId) ?? null,
    [addresses, selectedId],
  );

  function select(id: string) {
    setSelectedId(id || null);
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  }

  return { addresses, selected, selectedId, loading, select };
}
