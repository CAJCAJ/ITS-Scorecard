const AUTH_KEY = "ITS_AUTH";
const ROLE_KEY = "ITS_ROLE";
const USER_KEY = "ITS_USER";
const STATE_KEY = "ITS_STATE";
const FEEDBACK_PROFILE_KEY = "ITS_FEEDBACK_PROFILE";

export const SUPPORTED_STATES = ["New Jersey", "Texas"];

const USER_ACCOUNTS = {
  dev: {
    username: "Dev",
    password: "letmein",
    role: "admin",
    allowedStates: SUPPORTED_STATES,
  },
  itsnj: {
    username: "ITSNJ",
    password: "NJITS2026",
    role: "viewer",
    allowedStates: ["New Jersey"],
  },
  njdot: {
    username: "NJDOT",
    password: "NJDOT2026",
    role: "viewer",
    allowedStates: ["New Jersey"],
  },
  itstx: {
    username: "ITSTX",
    password: "TXITS2026",
    role: "viewer",
    allowedStates: ["Texas"],
  },
  txdot: {
    username: "TXDOT",
    password: "TXDOT2026",
    role: "viewer",
    allowedStates: ["Texas"],
  },
  user: {
    username: "User",
    password: "letmein",
    role: "viewer",
    allowedStates: SUPPORTED_STATES,
  },
  project: {
    username: "Project",
    password: "Team",
    role: "viewer",
    allowedStates: SUPPORTED_STATES,
  },
};

export function normalizeStateName(stateName) {
  const value = String(stateName || "").trim().toLowerCase();
  if (value === "nj" || value === "new jersey") return "New Jersey";
  if (value === "tx" || value === "texas") return "Texas";
  return String(stateName || "").trim();
}

export const isAuthed = () =>
  localStorage.getItem(AUTH_KEY) === "1" &&
  SUPPORTED_STATES.includes(getSessionState());

export const getRole = () => localStorage.getItem(ROLE_KEY) || "viewer";

export const getUsername = () => localStorage.getItem(USER_KEY) || "";

export const getSessionState = () => normalizeStateName(localStorage.getItem(STATE_KEY));

export function getFeedbackProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(FEEDBACK_PROFILE_KEY) || "{}");
    return {
      agencyCompany: String(profile.agencyCompany || "").trim(),
      username: String(profile.username || "").trim(),
      email: String(profile.email || "").trim(),
    };
  } catch {
    return { agencyCompany: "", username: "", email: "" };
  }
}

export const hasFeedbackProfile = () => {
  const profile = getFeedbackProfile();
  return Boolean(profile.agencyCompany && profile.username && profile.email);
};

export function saveFeedbackProfile(profile) {
  const normalized = {
    agencyCompany: String(profile?.agencyCompany || "").trim(),
    username: String(profile?.username || "").trim(),
    email: String(profile?.email || "").trim(),
  };
  if (!normalized.agencyCompany || !normalized.username || !normalized.email) {
    return false;
  }
  localStorage.setItem(FEEDBACK_PROFILE_KEY, JSON.stringify(normalized));
  return true;
}

export const getPostLoginPath = () =>
  hasFeedbackProfile() ? "/dashboard" : "/feedback-profile";

export function getAccount(username) {
  return USER_ACCOUNTS[String(username || "").trim().toLowerCase()] || null;
}

export function canAccountAccessState(account, stateName) {
  const scopedState = normalizeStateName(stateName);
  return Boolean(
    account &&
      SUPPORTED_STATES.includes(scopedState) &&
      account.allowedStates.includes(scopedState)
  );
}

export function login(username, password, stateName) {
  const account = getAccount(username);
  const scopedState = normalizeStateName(stateName);

  if (!SUPPORTED_STATES.includes(scopedState)) {
    return {
      ok: false,
      error: "Only New Jersey and Texas are enabled for scorecard login.",
    };
  }

  if (!account || account.password !== password) {
    return { ok: false, error: "Invalid username or password." };
  }

  if (!canAccountAccessState(account, scopedState)) {
    return {
      ok: false,
      error: `${account.username} is not authorized for ${scopedState}.`,
    };
  }

  localStorage.setItem(AUTH_KEY, "1");
  localStorage.setItem(ROLE_KEY, account.role);
  localStorage.setItem(USER_KEY, account.username);
  localStorage.setItem(STATE_KEY, scopedState);

  return { ok: true, account, state: scopedState };
}

export const logout = () => {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(STATE_KEY);
  localStorage.removeItem(FEEDBACK_PROFILE_KEY);
};
