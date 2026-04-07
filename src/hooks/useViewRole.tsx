import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { AppRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";

interface ViewRoleContextType {
  viewRole: AppRole | null;
  setViewRole: (role: AppRole) => void;
  actualRole: AppRole | null;
  loading: boolean;
}

const ViewRoleContext = createContext<ViewRoleContextType>({
  viewRole: null,
  setViewRole: () => {},
  actualRole: null,
  loading: true,
});

export function ViewRoleProvider({ children }: { children: ReactNode }) {
  const [viewRole, setViewRole] = useState<AppRole | null>(null);
  const [actualRole, setActualRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get current session and fetch role
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (data?.role) {
        const role = data.role as AppRole;
        setActualRole(role);
        setViewRole(role);
      }
      setLoading(false);
    });
  }, []);

  return (
    <ViewRoleContext.Provider value={{ viewRole, setViewRole, actualRole, loading }}>
      {children}
    </ViewRoleContext.Provider>
  );
}

export function useViewRole() {
  return useContext(ViewRoleContext);
}
