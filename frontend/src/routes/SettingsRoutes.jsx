import ProtectedRoute from "@/components/Layout/ProtectedRoute";
import CompanySettingsHome from "@/pages/Settings/CompanySettingsHome";
import FinancialYearSettings from "@/pages/Settings/fySettings/FinancialYearSettings";
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

      {/* Add more transaction routes here */}
    </Route>
  );
}
