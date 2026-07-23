import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

import { saveFeedbackProfile } from "../utils/auth";
import "./FeedbackProfile.css";

export default function FeedbackProfile() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    agencyCompany: "",
    username: "",
    email: "",
  });

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!saveFeedbackProfile(form)) return;
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
          This information will remain attached to the feedback form throughout
          your login session and will be cleared when you log out.
        </p>

        <form onSubmit={handleSubmit}>
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
            <span>Username</span>
            <input
              value={form.username}
              onChange={(event) => updateField("username", event.target.value)}
              autoComplete="off"
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

          <button type="submit">Continue to Dashboard</button>
        </form>
      </section>
    </main>
  );
}
