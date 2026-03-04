import React, { useState, useEffect } from "react";
import axios from "axios";

const Projects = () => {
  const [states, setStates] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    axios.get('/api/states')
      .then(res => setStates(res.data.states || []))
      .catch(console.error);
  }, []);

  const projects = [
    {
      id: "PROJECT-2024-001",
      title: "Traffic Signal Optimization",
      status: "active",
      category: "traffic-management",
      description: "Implementation of adaptive traffic signal control systems to reduce congestion and improve traffic flow at major intersections.",
      startDate: "Jan 15, 2024",
      budget: "$2.5M",
      location: "Arterial",
      progress: 75,
      files: [
        { name: "Traffic_Analysis_Report_Q1.pdf", size: "2.4 MB", category: "reports" },
        { name: "Signal_Timing_Plans.dwg", size: "1.8 MB", category: "plans" },
        { name: "Performance_Metrics.xlsx", size: "856 KB", category: "reports" },
        { name: "Technical_Specifications.docx", size: "1.2 MB", category: "specs" }
      ]
    },
    {
      id: "PROJECT-2024-002",
      title: "Smart Highway Monitoring",
      status: "planning",
      category: "infrastructure",
      description: "Deployment of IoT sensors and cameras for real-time highway monitoring and incident detection along I-95 corridor.",
      startDate: "Mar 1, 2024",
      budget: "$4.2M",
      location: "I-95 Corridor",
      progress: 25,
      files: [
        { name: "Environmental_Impact_Study.pdf", size: "5.2 MB", category: "reports" },
        { name: "Sensor_Placement_Plan.pdf", size: "3.1 MB", category: "plans" },
        { name: "Vendor_Contracts.pdf", size: "2.7 MB", category: "contracts" }
      ]
    },
    {
      id: "PROJECT-2024-003",
      title: "Connected Vehicle Infrastructure",
      status: "active",
      category: "connected-vehicles",
      description: "Installation of V2X communication infrastructure to support connected and autonomous vehicles in the metro area.",
      startDate: "Feb 10, 2024",
      budget: "$6.8M",
      location: "Metro Area",
      progress: 60,
      files: [
        { name: "V2X_Technical_Standards.pdf", size: "4.1 MB", category: "specs" },
        { name: "RSU_Installation_Plans.dwg", size: "6.3 MB", category: "plans" },
        { name: "Network_Coverage_Analysis.xlsx", size: "1.4 MB", category: "reports" }
      ]
    },
    {
      id: "PROJECT-2023-008",
      title: "Safety System",
      status: "completed",
      category: "safety",
      description: "Integrated incident management safety system.",
      startDate: "May 15, 2023",
      budget: "$3.1M",
      location: "Arterial",
      progress: 100,
      files: [
        { name: "Final_Project_Report.pdf", size: "8.7 MB", category: "reports" },
        { name: "System_Documentation.docx", size: "3.2 MB", category: "specs" }
      ]
    }
  ];

  const filteredProjects = projects.filter(p => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (categoryFilter && p.category !== categoryFilter) return false;
    if (searchTerm && !p.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const getStatusClass = (status) => {
    const classes = {
      active: "status-active",
      planning: "status-planning",
      completed: "status-completed",
      "on-hold": "status-on-hold"
    };
    return classes[status] || "";
  };

  const getCategoryClass = (category) => {
    const classes = {
      reports: "category-reports",
      plans: "category-plans",
      specs: "category-specs",
      contracts: "category-contracts"
    };
    return classes[category] || "category-other";
  };

  return (
    <div className="projects-container">
      <div className="projects-header">
        <div>
          <h1>ITS Projects</h1>
          <p>Manage and track Intelligent Transportation System projects and files</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline">Upload Files</button>
          <button className="btn btn-primary">+ New Project</button>
        </div>
      </div>

      <div className="summary-stats">
        <div className="stat-card">
          <div className="stat-number">{projects.filter(p => p.status === "active").length}</div>
          <div className="stat-label">Active Projects</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{projects.reduce((acc, p) => acc + p.files.length, 0)}</div>
          <div className="stat-label">Total Files</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{projects.filter(p => p.status === "completed").length}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{states.length}</div>
          <div className="stat-label">States with Data</div>
        </div>
      </div>

      <div className="filters-section">
        <div className="filters-row">
          <div className="filter-group">
            <label>Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="planning">Planning</option>
              <option value="completed">Completed</option>
              <option value="on-hold">On Hold</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Category</label>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="">All Categories</option>
              <option value="traffic-management">Traffic Management</option>
              <option value="infrastructure">Infrastructure</option>
              <option value="safety">Safety Systems</option>
              <option value="connected-vehicles">Connected Vehicles</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Search</label>
            <input
              type="text"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="btn btn-outline btn-small" onClick={() => {
            setStatusFilter("");
            setCategoryFilter("");
            setSearchTerm("");
          }}>Clear All</button>
        </div>
      </div>

      <div className="projects-grid">
        {filteredProjects.map(project => (
          <div key={project.id} className="project-card">
            <div className="project-header">
              <div>
                <h3 className="project-title">{project.title}</h3>
                <p className="project-id">{project.id}</p>
              </div>
              <span className={`project-status ${getStatusClass(project.status)}`}>
                {project.status}
              </span>
            </div>
            <p className="project-description">{project.description}</p>
            <div className="project-meta">
              <div className="meta-item">
                <div className="meta-label">Start Date</div>
                <div className="meta-value">{project.startDate}</div>
              </div>
              <div className="meta-item">
                <div className="meta-label">Budget</div>
                <div className="meta-value">{project.budget}</div>
              </div>
              <div className="meta-item">
                <div className="meta-label">Location</div>
                <div className="meta-value">{project.location}</div>
              </div>
              <div className="meta-item">
                <div className="meta-label">Progress</div>
                <div className="meta-value">{project.progress}%</div>
              </div>
            </div>
            <div className="files-section">
              <div className="files-header">
                <span className="files-count">{project.files.length} Files</span>
                <button className="btn btn-outline btn-small">+ Add</button>
              </div>
              <div className="files-list">
                {project.files.map((file, idx) => (
                  <div key={idx} className="file-item">
                    <div className="file-info">
                      <div className="file-name">{file.name}</div>
                      <div className="file-size">{file.size}</div>
                    </div>
                    <span className={`file-category ${getCategoryClass(file.category)}`}>
                      {file.category}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="project-actions">
              <button className="btn btn-primary btn-small">View Details</button>
              <button className="btn btn-outline btn-small">Edit</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Projects;
