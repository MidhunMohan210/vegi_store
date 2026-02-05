// src/store/loaderSlice.js
import { createSlice } from "@reduxjs/toolkit";


/// Fy means financial year

const fySlice = createSlice({
  name: "fy",
  initialState: { currentFY: null, startDate: null, endDate: null },
  reducers: {
    setCurrentFY: (state, action) => {
      state.currentFY = action.payload.currentFY;
      state.startDate = action.payload.startDate;
      state.endDate = action.payload.endDate;
    },
  },
});

export const { setCurrentFY } = fySlice.actions;
export default fySlice.reducer;
