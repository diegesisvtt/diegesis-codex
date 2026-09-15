import React from 'react';
import { X } from 'lucide-react';

export const Button = ({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) => {
  const base =
    'px-3 py-1.5 rounded-md font-medium transition-colors duration-100 flex items-center gap-1.5 select-none text-sm';
  const variants = {
    primary: 'bg-accent hover:bg-accent-hover text-white',
    secondary: 'bg-elevated hover:bg-overlay text-ink-1 border border-line',
    danger: 'bg-danger-soft text-danger hover:bg-[rgba(235,87,87,0.22)]',
    ghost: 'text-ink-2 hover:text-ink-1 hover:bg-hover',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

export const IconButton = ({
  icon: Icon,
  active,
  className = '',
  title,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>;
  active?: boolean;
}) => (
  <button
    title={title}
    className={`p-1.5 rounded-md transition-colors flex items-center justify-center ${
      active ? 'text-accent-ink bg-accent-soft' : 'text-ink-3 hover:text-ink-1 hover:bg-hover'
    } ${className}`}
    {...props}
  >
    <Icon size={17} strokeWidth={1.75} />
  </button>
);

export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  actions,
}: {
  isOpen: boolean;
  onClose(): void;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-elevated border border-line rounded-lg shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-fade-up">
        <div className="px-4 py-3 border-b border-line flex justify-between items-center">
          <h3 className="text-sm font-semibold text-ink-1">{title}</h3>
          <IconButton icon={X} onClick={onClose} className="!p-1" />
        </div>
        <div className="p-5 text-ink-2 text-sm">{children}</div>
        {actions && (
          <div className="px-4 py-3 border-t border-line bg-sidebar flex justify-end gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
};
