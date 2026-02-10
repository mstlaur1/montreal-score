"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface ContractSearchInputProps {
  placeholder: string;
  initialQuery: string;
}

export function ContractSearchInput({ placeholder, initialQuery }: ContractSearchInputProps) {
  const [value, setValue] = useState(initialQuery);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useCallback(
    (query: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (query) {
        params.set("q", query);
        params.delete("page"); // Reset page on new search
      } else {
        params.delete("q");
        params.delete("page");
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (value !== initialQuery) {
        navigate(value);
      }
    }, 400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, initialQuery, navigate]);

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-card-bg border border-card-border rounded-lg px-4 py-2.5 text-sm placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
    />
  );
}
