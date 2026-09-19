import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ Field */

export function Field({
  label,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/* ----------------------------------------------------------------- Select */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  error,
  disabled,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      aria-invalid={error || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-10 w-full rounded-lg border bg-background/60 px-3 text-sm text-foreground",
        "transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50 focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-60",
        error ? "border-destructive/70" : "border-border",
      )}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* --------------------------------------------------------------- Textarea */

export function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  error,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  error?: boolean;
  id?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      rows={rows}
      placeholder={placeholder}
      aria-invalid={error || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full resize-y rounded-lg border bg-background/60 px-3 py-2 text-sm text-foreground",
        "placeholder:text-muted-foreground/70",
        "transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50 focus:outline-none",
        error ? "border-destructive/70" : "border-border",
      )}
    />
  );
}

/* ------------------------------------------------------------------ Modal */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  // Close on Escape and lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 bg-black/65 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "panel relative z-10 my-8 w-full p-0 shadow-2xl",
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 py-4">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ ConfirmDialog */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  tone = "danger",
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            onClick={onClose}
            className="h-9 rounded-lg border border-border px-4 text-sm text-foreground transition-colors hover:bg-secondary/60"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "h-9 rounded-lg px-4 text-sm font-medium text-white transition-opacity disabled:opacity-50",
              tone === "danger" ? "bg-destructive hover:opacity-90" : "bg-primary hover:opacity-90",
            )}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-muted-foreground">{message}</div>
    </Modal>
  );
}
