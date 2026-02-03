import React, { useEffect, useMemo, useState } from "react";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("profile");

  // Theme (same approach you already use)
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

  // Form state
  const initialForm = useMemo(
    () => ({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      organization: "",
      title: "",
      bio: "",
      timezone: "CST",
      language: "en",
      dateFormat: "MM/DD/YYYY",
      defaultView: "dashboard",
      refreshRate: "60",
      emailNotifications: true,
      dashboardAlerts: true,
      systemMaintenance: true,
      autoSave: true,
      compactView: false,
    }),
    []
  );

  const [formData, setFormData] = useState(initialForm);
  const [savedMessage, setSavedMessage] = useState("");

  // Apply theme globally
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Small helper to show "Saved" feedback without annoying alerts
  const flashSaved = (msg = "Saved successfully ✅") => {
    setSavedMessage(msg);
    window.clearTimeout(flashSaved._t);
    flashSaved._t = window.setTimeout(() => setSavedMessage(""), 2200);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSave = (e) => {
    e?.preventDefault?.();

    // Later: send to backend here
    // await fetch("/api/settings", { method: "POST", body: JSON.stringify({ theme, ...formData }) })

    flashSaved();
  };

  const handleCancel = () => {
    setFormData(initialForm);
    flashSaved("Reverted changes ↩️");
  };

  const tabs = [
    { id: "profile", label: "Profile" },
    { id: "account", label: "Account" },
    { id: "notifications", label: "Notifications" },
    { id: "security", label: "Security" },
    { id: "preferences", label: "Preferences" },
  ];

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>Settings</h1>
        <p>Manage your account settings and preferences</p>
      </div>

      {savedMessage && (
        <div style={{ marginBottom: 16 }} className="card">
          <strong>{savedMessage}</strong>
        </div>
      )}

      <nav className="settings-nav">
        <ul>
          {tabs.map((tab) => (
            <li
              key={tab.id}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </li>
          ))}
        </ul>
      </nav>

      <div className="settings-content">
        {/* ================= PROFILE ================= */}
        {activeTab === "profile" && (
          <div className="settings-section">
            <h2>Profile Information</h2>

            <div className="profile-image-section">
              <div className="profile-image">👤</div>
              <button className="btn btn-outline" type="button">
                Change Photo
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="form-row">
                <div className="form-group">
                  <label>First Name</label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="form-group">
                  <label>Last Name</label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                />
              </div>

              <div className="form-group">
                <label>Phone Number</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                />
              </div>

              <div className="form-group">
                <label>Organization</label>
                <input
                  type="text"
                  name="organization"
                  value={formData.organization}
                  onChange={handleInputChange}
                />
              </div>

              <div className="form-group">
                <label>Job Title</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                />
              </div>

              <div className="form-group">
                <label>Bio</label>
                <textarea
                  name="bio"
                  rows="3"
                  value={formData.bio}
                  onChange={handleInputChange}
                  placeholder="Tell us about yourself..."
                />
              </div>

              <div className="project-actions">
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ================= ACCOUNT ================= */}
        {activeTab === "account" && (
          <div className="settings-section">
            <h2>Account Settings</h2>

            <div className="form-group">
              <label>Timezone</label>
              <select
                name="timezone"
                value={formData.timezone}
                onChange={handleInputChange}
              >
                <option value="EST">Eastern (EST)</option>
                <option value="CST">Central (CST)</option>
                <option value="MST">Mountain (MST)</option>
                <option value="PST">Pacific (PST)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Language</label>
              <select
                name="language"
                value={formData.language}
                onChange={handleInputChange}
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
            </div>

            <div className="form-group">
              <label>Date Format</label>
              <select
                name="dateFormat"
                value={formData.dateFormat}
                onChange={handleInputChange}
              >
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>

            <button type="button" className="btn btn-primary" onClick={handleSave}>
              Save Changes
            </button>
          </div>
        )}

        {/* ================= NOTIFICATIONS ================= */}
        {activeTab === "notifications" && (
          <div className="settings-section">
            <h2>Notification Preferences</h2>

            <div className="notification-item">
              <div>
                <strong>Email Notifications</strong>
                <p>Receive email updates about reports and system alerts</p>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  name="emailNotifications"
                  checked={formData.emailNotifications}
                  onChange={handleInputChange}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="notification-item">
              <div>
                <strong>Dashboard Alerts</strong>
                <p>Show real-time alerts on the dashboard</p>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  name="dashboardAlerts"
                  checked={formData.dashboardAlerts}
                  onChange={handleInputChange}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="notification-item">
              <div>
                <strong>System Maintenance</strong>
                <p>Notify me about scheduled maintenance</p>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  name="systemMaintenance"
                  checked={formData.systemMaintenance}
                  onChange={handleInputChange}
                />
                <span className="slider"></span>
              </label>
            </div>

            <button type="button" className="btn btn-primary" onClick={handleSave}>
              Save Preferences
            </button>
          </div>
        )}

        {/* ================= SECURITY ================= */}
        {activeTab === "security" && (
          <div className="settings-section">
            <h2>Security Settings</h2>

            <div className="security-item">
              <h4>Password</h4>
              <p>Update your password regularly.</p>
              <button className="btn btn-outline" type="button">
                Change Password
              </button>
            </div>

            <div className="security-item">
              <h4>Two-Factor Authentication</h4>
              <p>Add an extra layer of security to your account.</p>
              <span className="status-badge status-disabled">Disabled</span>
              <button className="btn btn-outline" type="button" style={{ marginLeft: 12 }}>
                Enable 2FA
              </button>
            </div>

            <div className="security-item">
              <h4>Active Sessions</h4>
              <p>Manage where you're logged in.</p>
              <button className="btn btn-outline" type="button">
                View Sessions
              </button>
            </div>
          </div>
        )}

        {/* ================= PREFERENCES ================= */}
        {activeTab === "preferences" && (
          <div className="settings-section">
            <h2>Application Preferences</h2>

            <div className="form-group">
              <label>Theme</label>
              <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            <div className="form-group">
              <label>Default Dashboard View</label>
              <select
                name="defaultView"
                value={formData.defaultView}
                onChange={handleInputChange}
              >
                <option value="dashboard">Dashboard</option>
                <option value="analytics">Analytics</option>
                <option value="projects">Projects</option>
              </select>
            </div>

            <div className="form-group">
              <label>Data Refresh Rate</label>
              <select
                name="refreshRate"
                value={formData.refreshRate}
                onChange={handleInputChange}
              >
                <option value="30">30 seconds</option>
                <option value="60">1 minute</option>
                <option value="300">5 minutes</option>
                <option value="600">10 minutes</option>
              </select>
            </div>

            <div className="notification-item">
              <div>
                <strong>Auto-save Changes</strong>
                <p>Automatically save changes as you make them</p>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  name="autoSave"
                  checked={formData.autoSave}
                  onChange={handleInputChange}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="notification-item">
              <div>
                <strong>Compact View</strong>
                <p>Use compact layout for better data density</p>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  name="compactView"
                  checked={formData.compactView}
                  onChange={handleInputChange}
                />
                <span className="slider"></span>
              </label>
            </div>

            <button type="button" className="btn btn-primary" onClick={handleSave}>
              Save Preferences
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
