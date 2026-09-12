import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

type PageTransitionProps = {
  children: ReactNode;
  className?: string;
};

export default function PageTransition({ children, className = '' }: PageTransitionProps) {
  const location = useLocation();

  return (
    <div
      key={location.pathname}
      className={`page-transition ${className}`.trim()}
    >
      {children}
    </div>
  );
}
