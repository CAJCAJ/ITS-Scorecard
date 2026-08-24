import React, { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  FaBars,
  FaTachometerAlt,
  FaListAlt,
  FaProjectDiagram,
  FaChartBar,
  FaChartLine,
  FaChartArea,
  FaCog,
  FaUsers,
  FaChevronDown,
  FaChevronUp,
  FaSignOutAlt,
  FaUpload,
  FaFileUpload,
  FaClipboardList,
  FaBalanceScale,
  FaBuilding,
  FaUserCheck,
  FaPoll,
} from "react-icons/fa";

import "../styles/Sidebar.css";
import { logout, getRole } from "../utils/auth";

const UPLOAD_ITEMS = [
  { to: "/upload/files", label: "Upload Source Data", Icon: FaFileUpload },
  {
    to: "/upload/survey-based-updates",
    label: "Scorecard Survey Responses",
    Icon: FaClipboardList,
  },
  {
    to: "/upload/expert-panel-review",
    label: "Expert Panel Review",
    Icon: FaUserCheck,
  },
  {
    to: "/upload/its-deployment-pre-survey",
    label: "ITS Deployment Survey",
    Icon: FaPoll,
  },
];

const SCORECARD_ITEMS = [
  {
    to: "/scorecards/benefit-cost-analysis",
    label: "B/C Analysis",
    Icon: FaBalanceScale,
  },
  {
    to: "/scorecards/deployment-analysis",
    label: "Deployment Analysis",
    Icon: FaChartBar,
  },
  {
    to: "/scorecards/legislative-analysis",
    label: "Legislative Analysis",
    Icon: FaChartArea,
  },
  {
    to: "/scorecards/planning-analysis",
    label: "Planning Analysis",
    Icon: FaProjectDiagram,
  },
  {
    to: "/scorecards/facility-analysis",
    label: "Facility Analysis",
    Icon: FaBuilding,
  },
];

export default function Sidebar({ collapsed, onToggle }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showUploadSubMenu, setShowUploadSubMenu] = useState(true);
  const [showScoreSubMenu, setShowScoreSubMenu] = useState(false);
  const userRole = getRole();

  const inUploadSection = location.pathname.startsWith("/upload");
  const inScorecardsSection = location.pathname.startsWith("/scorecards");

  const toggleCollapsed = () => {
    onToggle?.();
    if (!collapsed) {
      setShowUploadSubMenu(false);
      setShowScoreSubMenu(false);
    }
  };

  const getActiveClass = ({ isActive }) =>
    `sidebar-link${isActive ? " active" : ""}`;

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-header">
        <button className="collapse-btn" onClick={toggleCollapsed}>
          <FaBars />
        </button>
        <h2 className="sidebar-title">ITS Scorecard</h2>
      </div>

      <ul className="sidebar-menu">
        <li>
          <NavLink to="/dashboard" className={getActiveClass}>
            <FaTachometerAlt className="icon" />
            <span className="link-text">Dashboard</span>
          </NavLink>
        </li>

        <li
          className={`sidebar-link collapsible${inUploadSection ? " active-parent" : ""}`}
          onClick={() => setShowUploadSubMenu((current) => !current)}
        >
          <FaUpload className="icon" />
          <span className="link-text">Data Collection &amp; Review</span>
          {showUploadSubMenu ? <FaChevronUp /> : <FaChevronDown />}
        </li>

        {(showUploadSubMenu || inUploadSection) && !collapsed && (
          <ul className="sidebar-submenu">
            {UPLOAD_ITEMS.map(({ to, label, Icon }) => (
              <li key={to}>
                <NavLink to={to} className={getActiveClass}>
                  <Icon className="icon small" />
                  <span className="link-text">{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        )}

        <li
          className={`sidebar-link collapsible${inScorecardsSection ? " active-parent" : ""}`}
          onClick={() => setShowScoreSubMenu((current) => !current)}
        >
          <FaListAlt className="icon" />
          <span className="link-text">Scorecard Analysis</span>
          {showScoreSubMenu ? <FaChevronUp /> : <FaChevronDown />}
        </li>

        {(showScoreSubMenu || inScorecardsSection) && !collapsed && (
          <ul className="sidebar-submenu">
            {SCORECARD_ITEMS.map(({ to, label, Icon }) => (
              <li key={to}>
                <NavLink to={to} className={getActiveClass}>
                  <Icon className="icon small" />
                  <span className="link-text">{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        )}

        {userRole === "admin" && (
          <li>
            <NavLink to="/users" className={getActiveClass}>
              <FaUsers className="icon" />
              <span className="link-text">Users</span>
            </NavLink>
          </li>
        )}

        <li>
          <NavLink to="/settings" className={getActiveClass}>
            <FaCog className="icon" />
            <span className="link-text">Settings</span>
          </NavLink>
        </li>
      </ul>

      <div className="sidebar-logout">
        <button onClick={handleLogout} className="logout-btn">
          <FaSignOutAlt className="icon" />
          {!collapsed && <span className="link-text">Logout</span>}
        </button>
      </div>
    </div>
  );
}
