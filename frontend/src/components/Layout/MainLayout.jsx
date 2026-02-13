import { Outlet } from "react-router-dom";
import Header from "./Header";
import CustomBarLoader from "../loaders/CustomBarLoader";
import RouteChangeLoader from "../loaders/RouteChangeLoader";
import { useSelector } from "react-redux";
import NoCompanyDataErrorPage from "../errors/NoCompanyDataErrorPage";
import RevaluationLoaderOverlay from "../Revaluation/RevaluationLoaderOverlay";
import RecalculationConfirmationDialog from "../modals/RecalculationConfirmationDialog";

function MainLayout() {
  const isLoading = useSelector((state) => state.loader.isLoading);

  const selectedCompanyFromStore = useSelector(
    (state) => state.companyBranch?.selectedCompany
  );
  const selectedBranchFromStore = useSelector(
    (state) => state.companyBranch?.selectedBranch
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-green-50 flex flex-col">
      {/* ✅ Header always visible */}
      <Header />

      {/* ✅ Show route loader when navigating */}
      <RouteChangeLoader />

      {/* ✅ Show API loader when global state isLoading is true */}
      {isLoading && (
        <div className="relative z-20">
          <CustomBarLoader />
        </div>
      )}

      {/* ✅ Main content area */}
      <main
        className={`relative flex-1 flex bg-[#e9f5eb] transition-opacity duration-200 ${
          isLoading ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        {/* Background */}
        <div
          className="absolute inset-0 bg-center bg-no-repeat bg-[length:500px] opacity-10"
          style={{ backgroundImage: `url('/images/background2.png')` }}
        />

        {/* Foreground */}
        <div className="relative z-10 w-full">
          {!selectedCompanyFromStore || !selectedBranchFromStore ? (
            <NoCompanyDataErrorPage />
          ) : (
            <Outlet />
          )}
        </div>

        {/* Global revaluation loader */}
        <RevaluationLoaderOverlay />
          <RecalculationConfirmationDialog />
      </main>
    </div>
  );
}

export default MainLayout;
