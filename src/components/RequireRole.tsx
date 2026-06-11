import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useViewRole } from '@/hooks/useViewRole';

// ---------------------------------------------------------------------------
// RequireRole — Route-level role guard
// ---------------------------------------------------------------------------
// Reads actualRole + loading from useViewRole (available inside AppLayout tree).
// - loading=true       → render spinner (never redirect during loading)
// - actualRole=null    → redirect to /login
// - role not in allowed → redirect to /dashboard
// - role in allowed    → render children

interface RequireRoleProps {
  allowed: string[];
  children: ReactNode;
}

export function RequireRole({ allowed, children }: RequireRoleProps) {
  const { actualRole, loading } = useViewRole();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (actualRole === null) {
    return <Navigate to="/login" replace />;
  }

  if (!allowed.includes(actualRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
