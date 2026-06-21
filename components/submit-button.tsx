"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "button-primary" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();

  return (
    <button className={className} disabled={pending} type="submit">
      {pending ? "Procesando…" : children}
    </button>
  );
}
