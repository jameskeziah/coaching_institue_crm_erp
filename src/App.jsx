import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { CRMLayout } from '@/components/crm-layout';
import { AuthProvider, useAuth } from './AuthContext';
import Admissions from './pages/Admissions';
import Academic from './pages/Academic';
import AiLab from './pages/AiLab';
import Attendance from './pages/Attendance';
import Automation from './pages/Automation';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import Fees from './pages/Fees';
import FollowUps from './pages/FollowUps';
import OntologyAdmin from './pages/Ontology';
import ParentPortal from './pages/ParentPortal';
import Reports from './pages/Reports';
import Students from './pages/Students';
import TeacherPerformance from './pages/TeacherPerformance';
import Teachers from './pages/Teachers';
import TestPerformance from './pages/TestPerformance';

function ModuleRoute({ moduleName, children }) {
  const { canAccess } = useAuth();
  return canAccess(moduleName) ? children : <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<CRMLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<ModuleRoute moduleName="dashboard"><Dashboard /></ModuleRoute>} />
        <Route path="/teachers" element={<ModuleRoute moduleName="teachers"><Teachers /></ModuleRoute>} />
        <Route path="/students" element={<ModuleRoute moduleName="students"><Students /></ModuleRoute>} />
        <Route path="/admissions" element={<ModuleRoute moduleName="admissions"><Admissions /></ModuleRoute>} />
        <Route path="/attendance" element={<ModuleRoute moduleName="attendance"><Attendance /></ModuleRoute>} />
        <Route path="/academic" element={<ModuleRoute moduleName="academic"><Academic /></ModuleRoute>} />
        <Route path="/test-performance" element={<ModuleRoute moduleName="tests"><TestPerformance /></ModuleRoute>} />
        <Route path="/automation" element={<ModuleRoute moduleName="automation"><Automation /></ModuleRoute>} />
        <Route path="/ai-lab" element={<ModuleRoute moduleName="aiLab"><AiLab /></ModuleRoute>} />
        <Route path="/fees" element={<ModuleRoute moduleName="fees"><Fees /></ModuleRoute>} />
        <Route path="/follow-ups" element={<ModuleRoute moduleName="followUps"><FollowUps /></ModuleRoute>} />
        <Route path="/expenses" element={<ModuleRoute moduleName="expenses"><Expenses /></ModuleRoute>} />
        <Route path="/reports" element={<ModuleRoute moduleName="reports"><Reports /></ModuleRoute>} />
        <Route path="/parent-portal" element={<ModuleRoute moduleName="parentPortal"><ParentPortal /></ModuleRoute>} />
        <Route path="/teacher-performance" element={<ModuleRoute moduleName="teacherPerformance"><TeacherPerformance /></ModuleRoute>} />
        <Route path="/ontology" element={<ModuleRoute moduleName="ontology"><OntologyAdmin /></ModuleRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
