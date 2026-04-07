import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { AppRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";

interface ViewRoleContextType {
  viewRole: AppRole | null;
  setViewRole: (role: AppRole) => void;
  actualRole: AppRole | null;
  companyId: string | null;
  loading: boolean;
}

const ViewRoleContext = createContext<ViewRoleContextType>({
  viewRole: null,
  setViewRole: () => {},
  actualRole: null,
  companyId: null,
  loading: true,
});

export function ViewRoleProvider({ children }: { children: ReactNode }) {
  const [viewRole, setViewRole] = useState<AppRole | null>(null);
  const [actualRole, setActualRole] = useState<AppRole | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) {
        setLoading(false);
        return;
      }

      // Fetch profile (company_id) and role in parallel
      const [profileRes, roleRes] = await Promise.all([
        supabase.from("profiles").select("company_id").eq("id", session.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle(),
      ]);

      if (profileRes.data?.company_id) {
        setCompanyId(profileRes.data.company_id);
      }

      if (roleRes.data?.role) {
        const role = roleRes.data.role as AppRole;
        setActualRole(role);
        setViewRole(role);
      }

      setLoading(false);
    });
  }, []);

  return (
    <ViewRoleContext.Provider value={{ viewRole, setViewRole, actualRole, companyId, loading }}>
      {children}
    </ViewRoleContext.Provider>
  );
}

export function useViewRole() {
  return useContext(ViewRoleContext);
}
