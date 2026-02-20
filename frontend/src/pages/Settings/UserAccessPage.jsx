import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { userQueries } from "@/hooks/queries/user.queries";
import { companyMasterQueries } from "@/hooks/queries/companyMaster.queries";
import { branchMasterQueries } from "@/hooks/queries/branchMaster.queries";
import { userMutations } from "@/hooks/mutations/user.mutations";
import { getLocalStorageItem } from "@/helper/localstorage";
import { UserAccessSchema } from "@/validation/userSchema";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSelector } from "react-redux";

const UserAccessPage = () => {
  const queryClient = useQueryClient();
  const loggedInUser = getLocalStorageItem("user");
  const userId = loggedInUser?._id;
  const selectedCompanyFromStore = useSelector(
    (state) => state.companyBranch?.selectedCompany,
  );
  const selectedBranchFromStore = useSelector(
    (state) => state.companyBranch?.selectedBranch,
  );
  const lockedCompanyId = selectedCompanyFromStore?._id || null;
  const lockedBranchId = selectedBranchFromStore?._id || null;

  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [selectedBranchesByCompany, setSelectedBranchesByCompany] = useState(
    {},
  );

  const { data: userResponse, isLoading: userLoading } = useQuery({
    ...userQueries.getUserById(userId),
  });

  const { data: companiesResponse, isLoading: companyLoading } = useQuery({
    ...companyMasterQueries.search("", 1000, {}, { enabled: !!userId }),
  });

  const { data: branchesResponse, isLoading: branchLoading } = useQuery({
    ...branchMasterQueries.search("", 2000, {}, { enabled: !!userId }),
  });

  const user = userResponse?.data;
  const companies = companiesResponse?.data || [];
  const branches = branchesResponse?.data || [];

  const branchesByCompany = useMemo(() => {
    return branches.reduce((acc, branch) => {
      const key = branch.companyId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(branch);
      return acc;
    }, {});
  }, [branches]);

  useEffect(() => {
    const accessList = user?.access || [];
    const companyIds = accessList
      .map((entry) => entry?.company?._id || entry?.company)
      .filter(Boolean);
    const branchMap = {};

    accessList.forEach((entry) => {
      const companyId = entry?.company?._id || entry?.company;
      if (!companyId) return;
      branchMap[companyId] = (entry?.branches || [])
        .map((branch) => branch?._id || branch)
        .filter(Boolean);
    });

    if (lockedCompanyId && !companyIds.includes(lockedCompanyId)) {
      companyIds.push(lockedCompanyId);
    }

    if (lockedCompanyId && lockedBranchId) {
      const existing = branchMap[lockedCompanyId] || [];
      branchMap[lockedCompanyId] = [...new Set([...existing, lockedBranchId])];
    }

    setSelectedCompanies([...new Set(companyIds)]);
    setSelectedBranchesByCompany(branchMap);
  }, [user, lockedCompanyId, lockedBranchId]);

  const mutation = useMutation(userMutations.updateAccess(queryClient));

  const isLoading = userLoading || companyLoading || branchLoading;

  const handleCompanyToggle = (companyId, checked) => {
    if (!checked && lockedCompanyId && companyId === lockedCompanyId) {
      toast.error("Current selected company cannot be removed");
      return;
    }

    if (checked) {
      setSelectedCompanies((prev) => [...new Set([...prev, companyId])]);
      setSelectedBranchesByCompany((prev) => ({ ...prev, [companyId]: [] }));
      return;
    }

    setSelectedCompanies((prev) => prev.filter((id) => id !== companyId));
    setSelectedBranchesByCompany((prev) => {
      const next = { ...prev };
      delete next[companyId];
      return next;
    });
  };

  const handleBranchToggle = (companyId, branchId, checked) => {
    if (
      !checked &&
      lockedCompanyId &&
      lockedBranchId &&
      companyId === lockedCompanyId &&
      branchId === lockedBranchId
    ) {
      toast.error("Current selected branch cannot be removed");
      return;
    }

    setSelectedBranchesByCompany((prev) => {
      const current = prev[companyId] || [];
      const nextBranches = checked
        ? [...new Set([...current, branchId])]
        : current.filter((id) => id !== branchId);
      return { ...prev, [companyId]: nextBranches };
    });
  };

  const handleSave = () => {
    const accessPayload = selectedCompanies.map((companyId) => ({
      company: companyId,
      branches: selectedBranchesByCompany[companyId] || [],
    }));

    const validation = UserAccessSchema.safeParse({
      userId,
      access: accessPayload,
    });

    if (!validation.success) {
      toast.error(validation.error.issues?.[0]?.message || "Invalid user access");
      return;
    }

    mutation.mutate({ userId, access: accessPayload });
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading user details...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 bg-slate-50 min-h-[calc(100vh-72px)]">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">User Details</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <p>
              <span className="font-semibold">Name:</span> {user?.name || "-"}
            </p>
            <p>
              <span className="font-semibold">Email:</span> {user?.email || "-"}
            </p>
            <p>
              <span className="font-semibold">Role:</span> {user?.role || "-"}
            </p>
            <p>
              <span className="font-semibold">Mobile:</span> {user?.mobile || "-"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            Company & Branch Allocation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(lockedCompanyId || lockedBranchId) && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Current selected company/branch is locked and cannot be deselected.
            </div>
          )}

          {companies.length === 0 ? (
            <p className="text-sm text-slate-500">No companies available.</p>
          ) : (
            companies.map((company) => {
              const companyId = company._id;
              const isCompanySelected = selectedCompanies.includes(companyId);
              const companyBranches = branchesByCompany[companyId] || [];
              const selectedBranchIds = selectedBranchesByCompany[companyId] || [];
              const isLockedCompany =
                Boolean(lockedCompanyId) && companyId === lockedCompanyId;

              return (
                <div
                  key={companyId}
                  className="border border-slate-300 rounded-sm bg-white p-3 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`company-${companyId}`}
                        checked={isCompanySelected}
                        disabled={isLockedCompany}
                        onCheckedChange={(checked) =>
                          handleCompanyToggle(companyId, Boolean(checked))
                        }
                      />
                      <label
                        htmlFor={`company-${companyId}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {company.companyName}
                      </label>
                    </div>
                    {isLockedCompany && (
                      <span className="text-[10px] px-2 py-0.5 border border-blue-300 text-blue-700 bg-blue-50 rounded">
                        Current Company
                      </span>
                    )}
                  </div>

                  {isCompanySelected && (
                    <div className="ml-6 space-y-2 border-l border-slate-200 pl-4">
                      {companyBranches.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          No branches found for this company.
                        </p>
                      ) : (
                        companyBranches.map((branch) => {
                          const isLockedBranch =
                            isLockedCompany &&
                            Boolean(lockedBranchId) &&
                            branch._id === lockedBranchId;

                          return (
                            <div
                              key={branch._id}
                              className="flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id={`branch-${branch._id}`}
                                  checked={selectedBranchIds.includes(branch._id)}
                                  disabled={isLockedBranch}
                                  onCheckedChange={(checked) =>
                                    handleBranchToggle(
                                      companyId,
                                      branch._id,
                                      Boolean(checked),
                                    )
                                  }
                                />
                                <label
                                  htmlFor={`branch-${branch._id}`}
                                  className="text-sm cursor-pointer"
                                >
                                  {branch.branchName}
                                </label>
                              </div>
                              {isLockedBranch && (
                                <span className="text-[10px] px-2 py-0.5 border border-emerald-300 text-emerald-700 bg-emerald-50 rounded">
                                  Current Branch
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div className="pt-2">
            <Button onClick={handleSave} disabled={mutation.isPending || !userId}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Allocation"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default UserAccessPage;
