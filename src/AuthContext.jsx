import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getCurrentUser, setStoredUser, removeToken, removeStoredUser } from './api';
import { academicMasterPermissions, canAccessModule, canApprove, canApproveCorrections, canDelete, canEditFinance, canManageUsers, canPay, discountPermissions, isAdminRole, normalizeRole } from './rbac';

const AuthContext = createContext({
  user: null,
  setUser: () => {},
  logout: () => {},
  isAdmin: false,
  role: 'user',
  canAccess: () => false,
  permissions: {},
});

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(getCurrentUser());

  const setUser = (nextUser) => {
    if (nextUser) {
      setStoredUser(nextUser);
    }
    setUserState(nextUser);
  };

  const logout = () => {
    removeToken();
    removeStoredUser();
    setUserState(null);
  };

  useEffect(() => {
    function handleInvalidToken() {
      removeToken();
      removeStoredUser();
      setUserState(null);
    }

    window.addEventListener('tps-auth-invalid', handleInvalidToken);
    return () => window.removeEventListener('tps-auth-invalid', handleInvalidToken);
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      logout,
      role: normalizeRole(user?.role),
      isAdmin: isAdminRole(user?.role),
      canAccess: (moduleName) => canAccessModule(user?.role, moduleName),
      permissions: {
        canDelete: canDelete(user?.role),
        canApprove: canApprove(user?.role),
        canPay: canPay(user?.role),
        canEditFinance: canEditFinance(user?.role),
        canManageUsers: canManageUsers(user?.role),
        canApproveCorrections: canApproveCorrections(user?.role),
        ...discountPermissions(user?.role),
        ...academicMasterPermissions(user?.role),
      },
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
