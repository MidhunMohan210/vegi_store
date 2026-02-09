import { useState, useEffect, useCallback, useMemo } from "react";
import {
  User,
  Building2,
  GitBranch,
  Settings,
  Database,
  Power,
  CodeXml,
  FileText,
  ChevronDown,
  LogOut,
  UserCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useDispatch, useSelector } from "react-redux";
import {
  getLocalStorageItem,
  setLocalStorageItem,
} from "@/helper/localstorage";
import { truncate } from "../../../../shared/utils/string";
import { useNavigate } from "react-router-dom";
import { showLoader, hideLoader } from "@/store/slices/loaderSlice";
import { toast } from "sonner";
import {
  setBranchesInStore,
  SetSelectedBranchInStore,
  SetSelectedCompanyInStore,
} from "@/store/slices/companyBranchSlice";
import { useAuth } from "@/hooks/queries/auth.queries";
import { userQueries } from "@/hooks/queries/user.queries";
import RunRevaluation from "../Revaluation/RunRevaluation";
import { setCurrentFY } from "@/store/slices/fySlice";

// --- Memoized Sub-components ---

const UserInfoSection = ({ user, initials, displayName }) => (
  <div className="px-4 py-4 bg-slate-900 text-white">
    <div className="flex items-center gap-3">
      <Avatar className="w-10 h-10 border-2 border-slate-700">
        <AvatarFallback className="bg-blue-600 text-white font-bold">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate text-slate-50">
          {displayName}
        </p>
        <p className="text-xs text-slate-400 truncate">{user?.email}</p>
        <Badge
          variant="outline"
          className="mt-2 text-[10px] h-5 border-slate-600 text-slate-300 font-normal px-2"
        >
          {user?.role || "User"}
        </Badge>
      </div>
    </div>
  </div>
);

const CurrentSelection = ({ selectedCompany, selectedBranch }) => (
  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
        Workspace
      </span>
    </div>
    <div className="space-y-2">
      <div className="flex items-center justify-between group">
        <div className="flex items-center gap-2 text-slate-600">
          <Building2 className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">Company</span>
        </div>
        <span className="text-xs text-slate-800 font-semibold truncate max-w-[120px]">
          {truncate(selectedCompany?.companyName, 15) || "None"}
        </span>
      </div>
      <div className="flex items-center justify-between group">
        <div className="flex items-center gap-2 text-slate-600">
          <GitBranch className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">Branch</span>
        </div>
        <span className="text-xs text-slate-800 font-semibold truncate max-w-[120px]">
          {truncate(selectedBranch?.branchName, 15) || "None"}
        </span>
      </div>
    </div>
  </div>
);

const CompanyMenuItem = ({ companyAccess, selectedCompany, onSelect }) => (
  <DropdownMenuItem
    key={companyAccess?._id}
    onClick={() => onSelect(companyAccess)}
    className="cursor-pointer text-xs py-2 focus:bg-slate-50"
  >
    <div
      className={`mr-2 p-1 rounded-sm ${
        selectedCompany?._id === companyAccess?.company?._id
          ? "bg-blue-100 text-blue-600"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      <Building2 className="w-3.5 h-3.5" />
    </div>
    <span className="truncate flex-1">
      {companyAccess?.company?.companyName}
    </span>
    {selectedCompany?._id === companyAccess?.company?._id && (
      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
    )}
  </DropdownMenuItem>
);

const BranchMenuItem = ({ branch, selectedBranch, onSelect }) => (
  <DropdownMenuItem
    key={branch?._id}
    onClick={() => onSelect(branch)}
    className="cursor-pointer text-xs py-2 focus:bg-slate-50"
  >
    <div
      className={`mr-2 p-1 rounded-sm ${
        selectedBranch?._id === branch?._id
          ? "bg-emerald-100 text-emerald-600"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      <GitBranch className="w-3.5 h-3.5" />
    </div>
    <span className="truncate flex-1">{branch?.branchName}</span>
    {selectedBranch?._id === branch._id && (
      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
    )}
  </DropdownMenuItem>
);

const ProfileDropdown = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const selectedCompanyFromStore = useSelector(
    (state) => state.companyBranch?.selectedCompany
  );
  const selectedBranchFromStore = useSelector(
    (state) => state.companyBranch?.selectedBranch
  );

  const [selectedCompany, setSelectedCompany] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);

  const userData = useMemo(() => getLocalStorageItem("user"), []);
  const { isLoading: authLoading, logout } = useAuth();

  const {
    data: apiResponse,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    ...userQueries.getUserById(
      userData?._id,
      userData?.companyId,
      userData?.branchId
    ),
    enabled: !!userData?._id,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 15,
    retry: 2,
  });

  const loggedUser = useMemo(
    () => apiResponse?.data || null,
    [apiResponse?.data]
  );

  const { initials, displayName } = useMemo(() => {
    if (!loggedUser?.email) return { initials: "U", displayName: "User" };
    const name = loggedUser?.name || "User";
    return {
      initials: name?.substring(0, 2).toUpperCase(),
      displayName: name,
    };
  }, [loggedUser?.email, loggedUser?.name]);

  useEffect(() => {
    if (isLoading || authLoading) dispatch(showLoader());
    else dispatch(hideLoader());
  }, [isLoading, authLoading, dispatch]);

  useEffect(() => {
    if (isError) {
      console.error("User fetch error:", error);
      toast.error("Failed to fetch user details.");
    }
  }, [isError, error]);



useEffect(() => {
  if (loggedUser && !isLoading && !isError) {
    const storedCompany = getLocalStorageItem("selectedCompany");
    const storedBranch = getLocalStorageItem("selectedBranch");
    const storedBranches = getLocalStorageItem("companyBranches");

    // 1) Hydrate company/branch from localStorage into Redux (existing logic)
    if (!selectedCompanyFromStore && storedCompany)
      dispatch(SetSelectedCompanyInStore(storedCompany));
    if (!selectedBranchFromStore && storedBranch)
      dispatch(SetSelectedBranchInStore(storedBranch));
    if (storedBranches) dispatch(setBranchesInStore(storedBranches));

    // 2) If nothing stored, fall back to first access entry
    if (
      !storedCompany &&
      !selectedCompanyFromStore &&
      loggedUser.access?.[0]
    ) {
      const { company, branches } = loggedUser.access[0];

      if (company) {
        dispatch(SetSelectedCompanyInStore(company));
        setLocalStorageItem("selectedCompany", company);
      }

      if (branches?.length > 0) {
        dispatch(SetSelectedBranchInStore(branches[0]));
        setLocalStorageItem("selectedBranch", branches[0]);
        dispatch(setBranchesInStore(branches));
        setLocalStorageItem("companyBranches", branches);
      }
    }

    // 3) Decide the active company (priority: store > local > first access)
    const firstAccess = loggedUser.access?.[0];
    const activeCompany =
      selectedCompanyFromStore ||
      storedCompany ||
      firstAccess?.company ||
      null;

    // 4) Push FY to Redux if available
    //    If later you attach settings, change to activeCompany.settings?.financialYear

    
    if (activeCompany?.financialYear) {
      const fySettings = activeCompany.settings;
      dispatch(
        setCurrentFY({
          currentFY: fySettings.currentFY,      // e.g. "2025-26" or "2025-2026"
          startDate: fySettings.startDate,   // ISO string from backend
          endDate: fySettings.endDate,
        })
      );
    }else{
      dispatch(
        setCurrentFY({
          currentFY: null,
          startDate: null,
          endDate: null,
        })
      );
    }
  }
}, [
  loggedUser,
  isLoading,
  isError,
  dispatch,
  selectedCompanyFromStore,
  selectedBranchFromStore,
]);


  useEffect(() => {
    if (selectedCompanyFromStore) setSelectedCompany(selectedCompanyFromStore);
  }, [selectedCompanyFromStore]);

  useEffect(() => {
    if (selectedBranchFromStore) setSelectedBranch(selectedBranchFromStore);
  }, [selectedBranchFromStore]);

  const handleLogOut = useCallback(() => logout(), [logout]);

  const handleSelectCompany = useCallback(
    (companyAccess) => {
      dispatch(showLoader());
      const { branches, company } = companyAccess;
      if (company) {
        dispatch(SetSelectedCompanyInStore(company));
        setLocalStorageItem("selectedCompany", company);
      }
      if (branches?.length > 0) {
        dispatch(setBranchesInStore(branches));
        setLocalStorageItem("companyBranches", branches);
        dispatch(SetSelectedBranchInStore(branches[0]));
        setLocalStorageItem("selectedBranch", branches[0]);
      } else {
        dispatch(SetSelectedBranchInStore(null));
        setLocalStorageItem("selectedBranch", null);
      }
      navigate("/");
      setTimeout(() => dispatch(hideLoader()), 1000);
    },
    [dispatch, navigate]
  );

  const handleSelectBranch = useCallback(
    (branch) => {
      dispatch(showLoader());
      dispatch(SetSelectedBranchInStore(branch));
      setLocalStorageItem("selectedBranch", branch);
      navigate("/");
      setTimeout(() => dispatch(hideLoader()), 1000);
    },
    [dispatch, navigate]
  );

  const handleNavigate = useCallback((path) => navigate(path), [navigate]);
  const handleRetry = useCallback(() => refetch(), [refetch]);

  const masterMenuItems = useMemo(
    () => [
      {
        path: "/master/company-master",
        label: "Company Master",
        icon: Building2,
      },
      {
        path: "/master/branch-master",
        label: "Branch Master",
        icon: GitBranch,
      },
      { path: "/masters/user", label: "User Master", icon: User },
    ],
    []
  );

  const developerMenuItems = useMemo(
    () => [
      { path: "/reports/item-report", label: "Item Report", icon: FileText },
      {
        path: "/reports/item-monthly-report",
        label: "Item Monthly Report",
        icon: FileText,
      },
      {
        path: "/reports/account-report",
        label: "Account Report",
        icon: FileText,
      },
      {
        path: "/reports/account-monthly-report",
        label: "Account Monthly Report",
        icon: FileText,
      },
      {
        path: "/reports/outstanding-report",
        label: "Outstanding Report",
        icon: FileText,
      },
    ],
    []
  );

  if (isLoading)
    return (
      <Button variant="ghost" size="sm" disabled className="text-white">
        <User className="w-4 h-4 animate-pulse" />
      </Button>
    );
  if (isError)
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRetry}
        className="text-red-400"
      >
        <User className="w-4 h-4" />
      </Button>
    );
  if (!loggedUser)
    return (
      <Button variant="ghost" size="sm" disabled className="text-gray-400">
        <User className="w-4 h-4" />
      </Button>
    );

  return (
    <div className="ml-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="relative h-9 w-9 rounded-full p-0 hover:bg-gray-800 transition-colors group"
          >
            <Avatar className="h-8 w-8 border border-gray-600 group-hover:border-gray-400 transition-colors">
              <AvatarFallback className="bg-gray-700 text-[11px] font-bold text-gray-100 group-hover:bg-gray-600 group-hover:text-white transition-colors">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          className="w-80 p-0 border-slate-200 shadow-xl rounded-lg overflow-hidden"
          align="end"
          sideOffset={8}
        >
          <UserInfoSection
            user={loggedUser}
            initials={initials}
            displayName={displayName}
          />

          <CurrentSelection
            selectedCompany={selectedCompany}
            selectedBranch={selectedBranch}
          />

          <div className="p-1.5">
            {/* Context Switchers */}
            <div className="mb-2 px-2 pt-2 pb-1 text-[10px] uppercase font-bold text-slate-400">
              Context
            </div>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="flex items-center gap-2 text-xs py-2 text-slate-700 focus:bg-slate-50 cursor-pointer rounded-md">
                <Building2 className="w-4 h-4 text-slate-500" />
                <span>Switch Company</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56 p-1 bg-white shadow-lg border-slate-100">
                <DropdownMenuLabel className="text-[10px] text-slate-400">
                  Select Company
                </DropdownMenuLabel>
                {loggedUser?.access?.length > 0 ? (
                  loggedUser.access.map((acc) => (
                    <CompanyMenuItem
                      key={acc?._id}
                      companyAccess={acc}
                      selectedCompany={selectedCompany}
                      onSelect={handleSelectCompany}
                    />
                  ))
                ) : (
                  <DropdownMenuItem disabled className="text-xs">
                    No companies
                  </DropdownMenuItem>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="flex items-center gap-2 text-xs py-2 text-slate-700 focus:bg-slate-50 cursor-pointer rounded-md">
                <GitBranch className="w-4 h-4 text-slate-500" />
                <span>Switch Branch</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56 p-1 bg-white shadow-lg border-slate-100">
                <DropdownMenuLabel className="text-[10px] text-slate-400">
                  Select Branch
                </DropdownMenuLabel>
                {loggedUser?.access?.find(
                  (a) => a.company?._id === selectedCompany?._id
                )?.branches?.length > 0 ? (
                  loggedUser?.access
                    .find((a) => a?.company?._id === selectedCompany?._id)
                    .branches.map((b) => (
                      <BranchMenuItem
                        key={b?._id}
                        branch={b}
                        selectedBranch={selectedBranch}
                        onSelect={handleSelectBranch}
                      />
                    ))
                ) : (
                  <DropdownMenuItem disabled className="text-xs">
                    No branches
                  </DropdownMenuItem>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator className="my-1.5 bg-slate-100" />

            {/* Account Settings */}
            <div className="mb-1 px-2 pt-1 text-[10px] uppercase font-bold text-slate-400">
              Account
            </div>

            <DropdownMenuItem
              onClick={() => handleNavigate("/profile")}
              className="cursor-pointer text-xs py-2 rounded-md focus:bg-slate-50 text-slate-700"
            >
              <UserCircle className="w-4 h-4 mr-2 text-slate-500" />
              Personal Info
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => handleNavigate("/settings/company-settings")}
              className="cursor-pointer text-xs py-2 rounded-md focus:bg-slate-50 text-slate-700"
            >
              <Settings className="w-4 h-4 mr-2 text-slate-500" />
              Settings
            </DropdownMenuItem>

            {/* Advanced / Developer */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="flex items-center gap-2 text-xs py-2 text-slate-700 focus:bg-slate-50 cursor-pointer rounded-md">
                <Database className="w-4 h-4 text-slate-500" />
                <span>Master Data</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48 p-1">
                {masterMenuItems.map(({ path, label, icon: Icon }) => (
                  <DropdownMenuItem
                    key={path}
                    onClick={() => handleNavigate(path)}
                    className="text-xs cursor-pointer rounded-md"
                  >
                    <Icon className="w-3.5 h-3.5 mr-2 text-slate-400" />
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="flex items-center gap-2 text-xs py-2 text-slate-700 focus:bg-slate-50 cursor-pointer rounded-md">
                <CodeXml className="w-4 h-4 text-slate-500" />
                <span>Developer Tools</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56 p-1 max-h-[300px] overflow-y-auto">
                <DropdownMenuLabel className="text-[10px] text-slate-400">
                  Internal Reports
                </DropdownMenuLabel>
                {developerMenuItems.map(({ path, label, icon: Icon }) => (
                  <DropdownMenuItem
                    key={path}
                    onClick={() => handleNavigate(path)}
                    className="text-xs cursor-pointer rounded-md"
                  >
                    <Icon className="w-3.5 h-3.5 mr-2 text-slate-400" />
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <div className="px- py-1">
              <RunRevaluation />
            </div>

            <DropdownMenuSeparator className="my-1.5 bg-slate-100" />

            <DropdownMenuItem
              onClick={handleLogOut}
              className="flex items-center gap-2 text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer font-medium text-xs py-2 rounded-md"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default ProfileDropdown;
