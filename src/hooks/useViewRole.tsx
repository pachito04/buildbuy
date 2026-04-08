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

  async function fetchUserData(userId: string) {
    setLoading(true); // ensure loading=true while fetching to block premature redirects
    const [profileRes, roleRes] = await Promise.all([
      supabase.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    ]);

    setCompanyId(profileRes.data?.company_id ?? null);

    if (roleRes.data?.role) {
      const role = roleRes.data.role as AppRole;
      setActualRole(role);
      setViewRole(role);
    } else {
      setActualRole(null);
      setViewRole(null);
    }

    setLoading(false);
  }

  useEffect(() => {
    // ViewRoleProvider mounts AFTER RequireAuth passes, so INITIAL_SESSION has
    // already fired. Use getSession() to bootstrap, then onAuthStateChange for
    // future sign-in/sign-out events.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setCompanyId(null);
        setActualRole(null);
        setViewRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
