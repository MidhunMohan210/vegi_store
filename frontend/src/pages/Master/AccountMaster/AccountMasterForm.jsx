// components/AccountMasterForm.jsx
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, UserPlus, Pencil, AlertCircle, FileBarChart, Edit2 } from "lucide-react";
import BranchSelector from "@/components/BranchSelector";
import { accountMasterMutations } from "@/hooks/mutations/accountMaster.mutations";
import { priceLevelQueries } from "@/hooks/queries/priceLevel.queries";
import OpeningBalanceManagement from "@/components/modals/OpeningBalanceManagement";
import OpeningBalanceEditDialog from "@/components/modals/OpeningBalanceEditDialog";


const AccountMasterForm = ({
  companyId,
  branchId,
  editingId,
  editData,
  onClearEdit,
}) => {
  const queryClient = useQueryClient();
  const [showOpeningBalanceModal, setShowOpeningBalanceModal] = useState(false);
  const [showEditBalanceDialog, setShowEditBalanceDialog] = useState(false);


  const {
    data: priceLevelsResponse,
    isLoading: isPriceLevelLoading,
    isError: isPriceLevelError,
    refetch: refetchPriceLevels,
  } = useQuery({
    ...priceLevelQueries.getAll(companyId, branchId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });


  const priceLevels = priceLevelsResponse?.data || [];


  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
    watch,
  } = useForm({
    defaultValues: {
      company: companyId,
      branches: [],
      accountName: "",
      accountType: "customer",
      address: "",
      openingBalance: 0,
      openingBalanceType: "dr",
      phoneNo: "",
      email: "",
      priceLevel: null,
      status: "active",
    },
  });


  const [selectedBranches, setSelectedBranches] = useState([]);
  const accountType = watch("accountType");
  const accountName = watch("accountName");


  useEffect(() => {
    setValue("branches", selectedBranches);
  }, [selectedBranches, setValue]);


  useEffect(() => {
    if (editData) {
      reset({
        ...editData,
        openingBalance: Math.abs(editData.openingBalance),
        branches: editData.branches || [],
        priceLevel: editData.priceLevel?._id || null,
      });
      setSelectedBranches(editData.branches || []);
    } else {
      reset({
        company: companyId,
        branches: [],
        accountName: "",
        accountType: "customer",
        address: "",
        openingBalance: 0,
        openingBalanceType: "dr",
        phoneNo: "",
        email: "",
        priceLevel: null,
        status: "active",
      });
      if (branchId) setSelectedBranches([branchId]);
      else setSelectedBranches([]);
    }
  }, [editData, companyId, reset, branchId]);


  const mutation = useMutation(
    editingId
      ? accountMasterMutations.update(queryClient)
      : accountMasterMutations.create(queryClient)
  );


  const isLoading = mutation.isPending || mutation.isLoading;


  const onSubmit = (formData) => {
    if (selectedBranches.length === 0) {
      toast.error("Please select at least one branch.");
      return;
    }


    if (formData.priceLevel === "") formData.priceLevel = null;


    if (editingId) {
      mutation.mutate(
        { id: editingId, formData },
        {
          onSuccess: () => {
            onClearEdit();
            reset();
            if (branchId) setSelectedBranches([branchId]);
            else setSelectedBranches([]);
          },
        }
      );
    } else {
      mutation.mutate(formData, {
        onSuccess: () => {
          reset();
          if (branchId) setSelectedBranches([branchId]);
          else setSelectedBranches([]);
        },
      });
    }
  };


  const InputLabel = ({ label, required }) => (
    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
  );


  const ErrorMessage = ({ message }) => (
    <p className="flex items-center gap-1 text-[10px] text-red-500 mt-1 font-medium">
       <AlertCircle className="w-3 h-3" /> {message}
    </p>
  );


  const inputClass = " rounded-xs w-full text-xs border border-slate-300 rounded-md px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white disabled:bg-slate-50 disabled:text-slate-500";
  const selectClass = " rounded-xs w-full text-xs border border-slate-300 rounded-md px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white disabled:bg-slate-50 disabled:text-slate-500 appearance-none";


  return (
    <>
      <div className="h-full flex flex-col bg-slate-50 border-l border-slate-200 shadow-sm relative overflow-hidden">
        
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] z-50 flex items-center justify-center flex-col gap-2">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <span className="text-xs font-medium text-slate-600">Processing...</span>
          </div>
        )}


        {/* Header */}
        <div className="flex-none px-6 py-4 bg-white border-b border-slate-200 flex items-center gap-3">
          <div className={`p-2 rounded-sm ${editingId ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
             {editingId ? <Pencil className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          </div>
          <div>
             <h2 className="text-sm font-bold text-slate-800">
               {editingId ? "Edit Account" : "New Account"}
             </h2>
             <p className="text-[11px] text-slate-500 font-medium">
               {editingId ? "Update account details below" : "Fill in details to create a new account"}
             </p>
          </div>
        </div>


        {/* Scrollable Form Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            
            {/* Section: Basic Info */}
            <div className="bg-white p-4 rounded-sm border border-slate-200 shadow-sm space-y-4">
               <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Basic Details</span>
               </div>


               <div className="grid grid-cols-1 gap-4">
                 <div>
                   <InputLabel label="Account Name" required />
                   <input
                     {...register("accountName", { required: "Name is required", maxLength: 100 })}
                     className={inputClass}
                     placeholder="e.g., John Doe Enterprises"
                     disabled={isLoading}
                   />
                   {errors.accountName && <ErrorMessage message={errors.accountName.message} />}
                 </div>


                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <InputLabel label="Account Type" required />
                     <div className="relative">
                        <select {...register("accountType", { required: "Type is required" })} className={selectClass} disabled={isLoading}>
                          <option value="customer">Customer</option>
                          <option value="supplier">Supplier</option>
                          <option value="cash">Cash</option>
                          <option value="bank">Bank</option>
                          <option value="other">Other</option>
                        </select>
                     </div>
                     {errors.accountType && <ErrorMessage message={errors.accountType.message} />}
                   </div>
                   
                   <div>
                      <InputLabel label="Status" required />
                      <select {...register("status")} className={selectClass} disabled={isLoading}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="blocked">Blocked</option>
                      </select>
                   </div>
                 </div>
                 
                 <div>
                    <InputLabel label="Price Level" required={accountType === 'customer'} />
                    {isPriceLevelLoading ? (
                      <div className="flex items-center gap-2 text-xs text-slate-400 py-2"><Loader2 className="w-3 h-3 animate-spin" /> Loading levels...</div>
                    ) : isPriceLevelError ? (
                      <button type="button" onClick={refetchPriceLevels} className="text-xs text-red-500 hover:underline">Retry loading</button>
                    ) : (
                      <select
                        {...register("priceLevel", { required: accountType === "customer" ? "Required for Customers" : false })}
                        className={selectClass}
                        disabled={isLoading}
                      >
                        <option value="">Select Price Level</option>
                        {priceLevels.map((pl) => (
                          <option key={pl._id} value={pl._id}>{pl.priceLevelName}</option>
                        ))}
                      </select>
                    )}
                    {errors.priceLevel && <ErrorMessage message={errors.priceLevel.message} />}
                 </div>


               </div>
            </div>


            {/* Section: Contact Info */}
            <div className="bg-white p-4 rounded-sm border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Contact Info</span>
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                  <div>
                    <InputLabel label="Phone Number" />
                    <input
                      {...register("phoneNo", { pattern: { value: /^[6-9]\d{9}$/, message: "Invalid mobile number" } })}
                      className={inputClass}
                      placeholder="10-digit mobile"
                      disabled={isLoading}
                    />
                    {errors.phoneNo && <ErrorMessage message={errors.phoneNo.message} />}
                  </div>


                  <div>
                    <InputLabel label="Email Address" />
                    <input
                      {...register("email", { pattern: { value: /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, message: "Invalid email" } })}
                      className={inputClass}
                      placeholder="email@example.com"
                      disabled={isLoading}
                    />
                    {errors.email && <ErrorMessage message={errors.email.message} />}
                  </div>
               </div>


               <div>
                  <InputLabel label="Address" />
                  <textarea
                    {...register("address")}
                    className={`${inputClass} h-20 resize-none`}
                    placeholder="Full billing address..."
                    disabled={isLoading}
                  />
                  {errors.address && <ErrorMessage message={errors.address.message} />}
               </div>
            </div>


            {/* Section: Financials */}
            <div className="bg-white p-4 rounded-sm border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Financials</span>
               </div>


               <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <InputLabel label="Opening Balance" />
                    <div className="relative">
                      <input
                        {...register("openingBalance", { valueAsNumber: true, min: 0 })}
                        type="number"
                        className={`${inputClass} font-mono pr-10`}
                        placeholder="0.00"
                        disabled={isLoading || editingId}
                      />
                      {editingId && (
                        <button
                          type="button"
                          onClick={() => setShowEditBalanceDialog(true)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors"
                          title="Edit Master Opening Balance"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {errors.openingBalance && <ErrorMessage message={errors.openingBalance.message} />}
                  </div>
                  <div>
                     <InputLabel label="Type" />
                     <select
                      {...register("openingBalanceType")}
                      className={selectClass}
                      disabled={isLoading || editingId}
                     >
                      <option value="dr">Dr (Rec)</option>
                      <option value="cr">Cr (Pay)</option>
                     </select>
                  </div>
               </div>

               {/* NEW: Manage Opening Balances Button */}
               {editingId && (
                 <button
                   type="button"
                   onClick={() => setShowOpeningBalanceModal(true)}
                   className="w-full bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 text-blue-700 text-xs font-bold py-3 rounded-md hover:from-blue-100 hover:to-indigo-100 hover:border-blue-300 transition-all flex items-center justify-center gap-2 shadow-sm"
                 >
                   <FileBarChart className="w-4 h-4" />
                   Manage Year-wise Opening Balances
                 </button>
               )}


               <div>
                  <InputLabel label="Branch Access" />
                  <div className="mt-1">
                     <BranchSelector
                      selectedBranches={selectedBranches}
                      setSelectedBranches={setSelectedBranches}
                     />
                  </div>
                  {errors.branches && <ErrorMessage message={errors.branches.message} />}
               </div>
            </div>


          </form>
        </div>


        {/* Fixed Footer Buttons */}
        <div className="flex-none p-4 bg-white border-t border-slate-200 flex flex-col gap-3 z-10">
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={isLoading}
            className="w-full bg-slate-800 text-white text-xs font-bold py-3 rounded-sm hover:bg-slate-700 active:bg-slate-900 transition-all shadow-md disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? "Update Account" : "Create Account")}
          </button>


          {editingId && (
            <button
              type="button"
              onClick={() => {
                reset();
                setSelectedBranches([]);
                onClearEdit();
              }}
              disabled={isLoading}
              className="w-full bg-white text-slate-600 border border-slate-200 text-xs font-bold py-2.5 rounded-sm hover:bg-slate-50 hover:text-slate-800 transition-all"
            >
              Cancel
            </button>
          )}
        </div>


      </div>

      {/* Opening Balance Management Modal */}
      <OpeningBalanceManagement
        open={showOpeningBalanceModal}
        onOpenChange={setShowOpeningBalanceModal}
        entityType="party"
        entityId={editingId}
        entityName={accountName || "Account"}
        
      />

      {/* Edit Master Opening Balance Dialog */}
      <OpeningBalanceEditDialog
        open={showEditBalanceDialog}
        onOpenChange={setShowEditBalanceDialog}
        currentBalance={watch("openingBalance") || 0}
        currentBalanceType={watch("openingBalanceType") || "dr"}
        accountName={accountName || "Account"}
        entityType="party"
        entityId={editingId}
        companyId={companyId}
        branchId={branchId}
        onUpdated={(data) => {
          // Handle the updated values (dummy for now)
          toast.success(
            `Master balance updated to ${data.openingBalanceType === 'dr' ? 'Dr' : 'Cr'} ₹${data.newOpeningBalance.toLocaleString('en-IN')}`
          );
          console.log("Updated opening balance:", data);
        }}
      />
    </>
  );
};


export default AccountMasterForm;
