export const isAuthed = () => localStorage.getItem("ITS_AUTH") === "1";

export const getRole = () => localStorage.getItem("ITS_ROLE") || "viewer";

export const login = (role = "admin") => {
  localStorage.setItem("ITS_AUTH", "1");
  localStorage.setItem("ITS_ROLE", role); // default admin for now
};

export const logout = () => {
  localStorage.removeItem("ITS_AUTH");
  localStorage.removeItem("ITS_ROLE");
};
