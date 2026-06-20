import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
}

export function Card({ children, className = "", title, description }: CardProps) {
  return (
    <div
      className={`bg-surface-raised border border-surface-border rounded-2xl shadow-card ${className}`}
    >
      {(title || description) && (
        <div className="px-6 py-4 border-b border-surface-border">
          {title && <h3 className="font-medium text-white">{title}</h3>}
          {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
