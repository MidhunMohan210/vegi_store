import ProtectedRoute from "@/components/Layout/ProtectedRoute";
import CompanySettingsHome from "@/pages/Settings/CompanySettingsHome";
import FinancialYearSettings from "@/pages/Settings/fySettings/FinancialYearSettings";
import UserAccessPage from "@/pages/Settings/UserAccessPage";
import { Outlet, Route } from "react-router-dom";

export default function SettingsRoutes() {
  return (
    <Route
      path="settings"
      element={
        <ProtectedRoute>
          <Outlet /> {/* Renders child routes */}
        </ProtectedRoute>
      }
    >
      <Route path="company-settings" element={<CompanySettingsHome />} />
      <Route path="financial-year" element={<FinancialYearSettings />} />
      <Route path="user-access" element={<UserAccessPage />} />

      {/* Add more transaction routes here */}
    </Route>
  );
}
