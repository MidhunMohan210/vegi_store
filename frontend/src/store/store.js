import { configureStore } from "@reduxjs/toolkit";
import companyBranchReducer from "./slices/companyBranchSlice";
import LoaderReducer from "./slices/loaderSlice";
import transactionSlice from "./slices/transactionSlice";
import revaluationLoaderReducer from "./slices/revaluationLoaderSlice";
import filtersSliceReducer from "./slices/filtersSlice";
import fySlice from "./slices/fySlice";
import recalculationDialogReducer from "./slices/recalculationDialogSlice";

export const store = configureStore({
  reducer: {
    companyBranch: companyBranchReducer,
    loader: LoaderReducer,
    transaction: transactionSlice,
    revaluationLoader: revaluationLoaderReducer,
    filters: filtersSliceReducer,
    fy: fySlice,
    recalculationDialog: recalculationDialogReducer

  },
});
