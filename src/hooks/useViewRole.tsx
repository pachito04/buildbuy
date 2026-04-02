import { createContext, useContext, useState, ReactNode } from "react";
import { AppRole } from "@/hooks/useUserRole";

interface ViewRoleContextType {
  viewRole: AppRole;
  setViewRole: (role: AppRole) => void;
}

const ViewRoleContext = createContext<ViewRoleContextType>({
  viewRole: "compras",
  setViewRole: () => {},
});

export function ViewRoleProvider({ children }: { children: ReactNode }) {
  const [viewRole, setViewRole] = useState<AppRole>("compras");

  return (
    <ViewRoleContext.Provider value={{ viewRole, setViewRole }}>
      {children}
    </ViewRoleContext.Provider>
  );
}

export function useViewRole() {
  return useContext(ViewRoleContext);
}
