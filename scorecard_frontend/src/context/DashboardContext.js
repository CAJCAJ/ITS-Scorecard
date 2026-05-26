import React, { createContext, useContext, useState } from "react";
import { getSessionState } from "../utils/auth";

const DashboardContext = createContext();

export const DashboardProvider = ({ children }) => {
  const [selectedState, setSelectedState] = useState(() => getSessionState() || "");

  return (
    <DashboardContext.Provider value={{ selectedState, setSelectedState }}>
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = () => useContext(DashboardContext);
