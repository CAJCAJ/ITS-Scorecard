import React, { useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

import { apiUrl } from "../services/api";
import {
  getSessionState,
  logout,
  saveFeedbackProfile,
} from "../utils/auth";
import "./FeedbackProfile.css";

export default function FeedbackProfile() {
  const navigate = useNavigate();
  const formRef = useRef(null);
  const [form, setForm] = useState({
    agencyCompany: "",
    username: "",
    email: "",
  });
  const [consented, setConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!consented || submitting) return;

    setSubmitting(true);
    setError("");
    try {
      await axios.post(apiUrl("/dashboard-return-links"), {
        agency_company: form.agencyCompany,
        display_name: form.username,
        email: form.email,
        state: getSessionState(),
        consented,
      });
      if (!saveFeedbackProfile(form)) {
        throw new Error("Could not save identification information.");
      }
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          requestError.message ||
          "Could not send the dashboard email. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackToMap = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const handleSkipEmail = () => {
    if (!formRef.current?.reportValidity()) return;
    setError("");
    if (!saveFeedbackProfile(form)) {
      setError("Could not save identification information.");
      return;
    }
    navigate("/dashboard", { replace: true });
  };

  return (
    <main className="feedback-profile-page">
      <section
        className="feedback-profile-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-profile-title"
      >
        <div className="feedback-profile-kicker">Feedback Information</div>
        <h1 id="feedback-profile-title">Please Kindly Provide your information</h1>
        <p>
          This information identifies your feedback. You can request a permanent
          email link or skip email delivery and continue directly.
        </p>

        <form ref={formRef} onSubmit={handleSubmit}>
          <label>
            <span>Agency/Company</span>
            <input
              value={form.agencyCompany}
              onChange={(event) => updateField("agencyCompany", event.target.value)}
              autoComplete="organization"
              autoFocus
              required
            />
          </label>

          <label>
            <span>Name</span>
            <input
              value={form.username}
              onChange={(event) => updateField("username", event.target.value)}
              autoComplete="name"
              required
            />
          </label>

          <label>
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="feedback-profile-consent">
            <input
              type="checkbox"
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
              required
            />
            <span>
              By checking this box, you agree that the ITS Scorecard website may
              send an email to the address you provided.
            </span>
          </label>

          {error ? (
            <div className="feedback-profile-error" role="alert">
              {error}
            </div>
          ) : null}

          <div className="feedback-profile-actions">
            <button
              type="button"
              className="feedback-profile-back"
              onClick={handleBackToMap}
            >
              Back to Map
            </button>
            <button
              type="button"
              className="feedback-profile-skip"
              onClick={handleSkipEmail}
              disabled={submitting}
            >
              Skip Send and Continue
            </button>
            <button type="submit" disabled={!consented || submitting}>
              {submitting ? "Sending Email..." : "Continue to Dashboard"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
