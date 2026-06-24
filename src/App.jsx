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
import EnquiryPage from './pages/EnquiryPage';
import LandingPage from './pages/LandingPage';
import Expenses from './pages/Expenses';
import Fees from './pages/Fees';
import FeeStructuresPage from './pages/FeeStructuresPage';
import FollowUps from './pages/FollowUps';
import OntologyAdmin from './pages/Ontology';
import ParentPortal from './pages/ParentPortal';
import Reports from './pages/Reports';
import Students from './pages/Students';
import TeacherPerformance from './pages/TeacherPerformance';
import Teachers from './pages/Teachers';
import TestPerformance from './pages/TestPerformance';
import SuperAdminLayout from './pages/super-admin/SuperAdminLayout';
import OverviewPage from './pages/super-admin/OverviewPage';
import InstitutesPage from './pages/super-admin/InstitutesPage';
import TrialsPage from './pages/super-admin/TrialsPage';
import PaidCustomersPage from './pages/super-admin/PaidCustomersPage';
import ExpiredTrialsPage from './pages/super-admin/ExpiredTrialsPage';
import SuspendedTenantsPage from './pages/super-admin/SuspendedTenantsPage';
import RevenuePage from './pages/super-admin/RevenuePage';
import UsagePage from './pages/super-admin/UsagePage';
import SupportAccessPage from './pages/super-admin/SupportAccessPage';
import AuditLogsPage from './pages/super-admin/AuditLogsPage';
import { BatchDetailPage, BatchesPage, BranchesPage, CoursesPage, SubjectsPage } from './pages/AcademicMasters';

function ModuleRoute({ moduleName, children }) {
  const { canAccess } = useAuth();
  return canAccess(moduleName) ? children : <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route index element={<LandingPage />} />
      <Route path="/enquiry" element={<EnquiryPage />} />
      <Route path="/super-admin" element={<SuperAdminLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="institutes" element={<InstitutesPage />} />
        <Route path="trials" element={<TrialsPage />} />
        <Route path="paid-customers" element={<PaidCustomersPage />} />
        <Route path="expired-trials" element={<ExpiredTrialsPage />} />
        <Route path="suspended" element={<SuspendedTenantsPage />} />
        <Route path="revenue" element={<RevenuePage />} />
        <Route path="usage" element={<UsagePage />} />
        <Route path="support-access" element={<SupportAccessPage />} />
        <Route path="audit-logs" element={<AuditLogsPage />} />
      </Route>
      <Route element={<CRMLayout />}>
        <Route path="/dashboard" element={<ModuleRoute moduleName="dashboard"><Dashboard /></ModuleRoute>} />
        <Route path="/teachers" element={<ModuleRoute moduleName="teachers"><Teachers /></ModuleRoute>} />
        <Route path="/students" element={<ModuleRoute moduleName="students"><Students /></ModuleRoute>} />
        <Route path="/admissions" element={<ModuleRoute moduleName="admissions"><Admissions /></ModuleRoute>} />
        <Route path="/attendance" element={<ModuleRoute moduleName="attendance"><Attendance /></ModuleRoute>} />
        <Route path="/academic" element={<ModuleRoute moduleName="academic"><Academic /></ModuleRoute>} />
        <Route path="/academic/batches" element={<ModuleRoute moduleName="academicMasters"><BatchesPage /></ModuleRoute>} />
        <Route path="/academic/batches/:id" element={<ModuleRoute moduleName="academicMasters"><BatchDetailPage /></ModuleRoute>} />
        <Route path="/settings/branches" element={<ModuleRoute moduleName="academicMasters"><BranchesPage /></ModuleRoute>} />
        <Route path="/settings/courses" element={<ModuleRoute moduleName="academicMasters"><CoursesPage /></ModuleRoute>} />
        <Route path="/settings/subjects" element={<ModuleRoute moduleName="academicMasters"><SubjectsPage /></ModuleRoute>} />
        <Route path="/test-performance" element={<ModuleRoute moduleName="tests"><TestPerformance /></ModuleRoute>} />
        <Route path="/automation" element={<ModuleRoute moduleName="automation"><Automation /></ModuleRoute>} />
        <Route path="/ai-lab" element={<ModuleRoute moduleName="aiLab"><AiLab /></ModuleRoute>} />
        <Route path="/fees" element={<ModuleRoute moduleName="fees"><Fees /></ModuleRoute>} />
        <Route path="/fees/structures" element={<ModuleRoute moduleName="fees"><FeeStructuresPage /></ModuleRoute>} />
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
