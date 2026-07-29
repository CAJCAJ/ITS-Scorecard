import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

import { apiUrl } from "../services/api";
import { restoreDashboardSession } from "../utils/auth";
import "./ResumeDashboard.css";

const RESUME_TOKEN_KEY = "ITS_PENDING_RESUME_TOKEN";

function captureResumeToken() {
  const hash = window.location.hash.replace(/^#/, "");
  const token = new URLSearchParams(hash).get("token");
  if (token) {
    sessionStorage.setItem(RESUME_TOKEN_KEY, token);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
  return token || sessionStorage.getItem(RESUME_TOKEN_KEY) || "";
}

export default function ResumeDashboard() {
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = captureResumeToken();
    if (!token) {
      setError("This dashboard link is missing its return token.");
      return;
    }

    axios
      .post(apiUrl("/dashboard-return-links/resolve"), { token })
      .then(({ data }) => {
        const restored = restoreDashboardSession({
          state: data.state,
          agencyCompany: data.profile?.agency_company,
          displayName: data.profile?.display_name,
          email: data.profile?.email,
        });
        if (!restored) {
          throw new Error("The saved dashboard information is incomplete.");
        }
        sessionStorage.removeItem(RESUME_TOKEN_KEY);
        navigate("/dashboard", { replace: true });
      })
      .catch((requestError) => {
        sessionStorage.removeItem(RESUME_TOKEN_KEY);
        setError(
          requestError.response?.data?.error ||
            requestError.message ||
            "Could not open the saved dashboard."
        );
      });
  }, [navigate]);

  return (
    <main className="resume-dashboard-page">
      <section className="resume-dashboard-window" aria-live="polite">
        <div className="resume-dashboard-mark">ITS</div>
        <h1>{error ? "Dashboard Link Unavailable" : "Opening Your Dashboard"}</h1>
        <p>
          {error
            ? error
            : "Validating your permanent return link and restoring your information..."}
        </p>
        {error ? (
          <button type="button" onClick={() => navigate("/login", { replace: true })}>
            Back to Map
          </button>
        ) : (
          <div className="resume-dashboard-progress" aria-hidden="true">
            <span />
          </div>
        )}
      </section>
    </main>
  );
}
