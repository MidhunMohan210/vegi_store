import { createSlice } from '@reduxjs/toolkit';

/**
 * ============================================
 * RECALCULATION DIALOG REDUX SLICE
 * ============================================
 * 
 * Purpose: Manage recalculation confirmation dialog state
 * Used by: useUpdateMasterOpeningBalance mutation
 * 
 * ============================================
 */

const initialState = {
  isOpen: false,
  impactData: null,
  resolveCallback: null, // Will store the Promise resolve function
};

const recalculationDialogSlice = createSlice({
  name: 'recalculationDialog',
  initialState,
  reducers: {
    /**
     * Show the dialog with impact data
     */
    showDialog: (state, action) => {
      state.isOpen = true;
      state.impactData = action.payload.impactData;
      // Note: resolveCallback is handled separately (not serializable)
    },

    /**
     * User confirmed - proceed with recalculation
     */
    confirmDialog: (state) => {
      state.isOpen = false;
      state.impactData = null;
      // resolveCallback will be called separately
    },

    /**
     * User cancelled
     */
    cancelDialog: (state) => {
      state.isOpen = false;
      state.impactData = null;
      // resolveCallback will be called separately with false
    },

    /**
     * Close dialog without action
     */
    closeDialog: (state) => {
      state.isOpen = false;
      state.impactData = null;
    },
  },
});

export const { showDialog, confirmDialog, cancelDialog, closeDialog } = recalculationDialogSlice.actions;
export default recalculationDialogSlice.reducer;
