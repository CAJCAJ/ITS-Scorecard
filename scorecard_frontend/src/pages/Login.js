import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import StateLoginMap from "../components/StateLoginMap";
import {
  getPostLoginPath,
  isAuthed,
  login as authenticate,
} from "../utils/auth";

export default function Login() {
  const navigate = useNavigate();
  const [selectedState, setSelectedState] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthed()) {
      navigate(getPostLoginPath(), { replace: true });
    }
  }, [navigate]);

  const closeModal = () => {
    setSelectedState("");
    setUsername("");
    setPassword("");
    setError("");
  };

  const handleStateClick = (stateName) => {
    setSelectedState(stateName);
    setUsername("");
    setPassword("");
    setError("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const result = authenticate(username, password, selectedState);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate("/feedback-profile", { replace: true });
  };

  return (
    <div className="map-entry-page">
      <div className="map-entry-header">
        <div className="map-entry-title-main">ITS Scorecard</div>
        <div className="map-entry-title-subtitle">Please Select Your State</div>
      </div>

      <StateLoginMap onStateClick={handleStateClick} />

      {selectedState && (
        <div className="state-login-overlay" role="dialog" aria-modal="true">
          <form className="state-login-modal" onSubmit={handleSubmit}>
            <button
              type="button"
              className="state-login-close"
              aria-label="Close login"
              onClick={closeModal}
            >
              x
            </button>

            <div className="state-login-kicker">Selected State</div>
            <h2>{selectedState}</h2>

            <label>
              <span>Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </label>

            <label>
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            {error ? <div className="state-login-error">{error}</div> : null}

            <button type="submit" className="btn btn-primary state-login-submit">
              Sign In
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
