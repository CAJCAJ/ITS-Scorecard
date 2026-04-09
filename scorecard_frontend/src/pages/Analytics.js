import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Chart, registerables } from "chart.js";
import { apiUrl } from "../services/api";

Chart.register(...registerables);

const Analytics = () => {
  const [stateSummary, setStateSummary] = useState([]);
  const [scorecards, setScorecards] = useState({});

  const regionalChartRef = useRef(null);
  const adoptionChartRef = useRef(null);
  const areaChartRef = useRef(null);
  const chartInstances = useRef({});

  useEffect(() => {
    axios
      .get(apiUrl("/state-summary"))
      .then((res) => setStateSummary(res.data))
      .catch(console.error);

    axios
      .get(apiUrl("/state-scorecards"))
      .then((res) => setScorecards(res.data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (stateSummary.length === 0) return;

    Object.values(chartInstances.current).forEach((chart) => chart?.destroy());
    chartInstances.current = {};

    if (regionalChartRef.current) {
      const ctx = regionalChartRef.current.getContext("2d");
      chartInstances.current.regional = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: ["South", "West", "Midwest", "Northeast"],
          datasets: [
            {
              data: [35, 28, 22, 15],
              backgroundColor: ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4"],
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
        },
      });
    }

    if (adoptionChartRef.current) {
      const ctx = adoptionChartRef.current.getContext("2d");
      chartInstances.current.adoption = new Chart(ctx, {
        type: "bar",
        data: {
          labels: [
            "Signals",
            "CCTV",
            "ASCT",
            "Connected Vehicle",
            "Enforcement",
            "Pedestrian",
          ],
          datasets: [
            {
              label: "Adoption Rate (%)",
              data: [78, 45, 32, 18, 28, 23],
              backgroundColor: [
                "#28a745",
                "#ffc107",
                "#ffc107",
                "#dc3545",
                "#ffc107",
                "#dc3545",
              ],
              borderRadius: 5,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              title: { display: true, text: "Adoption Percentage" },
            },
          },
          plugins: { legend: { display: false } },
        },
      });
    }

    if (areaChartRef.current) {
      const ctx = areaChartRef.current.getContext("2d");
      chartInstances.current.area = new Chart(ctx, {
        type: "radar",
        data: {
          labels: [
            "Signals",
            "CCTV",
            "ASCT",
            "Connected Vehicle",
            "Enforcement",
          ],
          datasets: [
            {
              label: "Large Metro",
              data: [85, 65, 45, 28, 40],
              borderColor: "#0057ff",
              backgroundColor: "rgba(0, 87, 255, 0.2)",
              borderWidth: 2,
            },
            {
              label: "Small Metro",
              data: [70, 35, 25, 15, 20],
              borderColor: "#28a745",
              backgroundColor: "rgba(40, 167, 69, 0.1)",
              borderWidth: 2,
            },
            {
              label: "Rural",
              data: [45, 15, 8, 5, 10],
              borderColor: "#dc3545",
              backgroundColor: "rgba(220, 53, 69, 0.1)",
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { r: { min: 0, max: 100, ticks: { stepSize: 20 } } },
        },
      });
    }

    return () => {
      Object.values(chartInstances.current).forEach((chart) => chart?.destroy());
    };
  }, [stateSummary]);

  const totalBills = stateSummary.reduce((acc, s) => acc + s.total, 0);
  const totalEnacted = stateSummary.reduce((acc, s) => acc + s.enacted, 0);
  const statesWithData = Object.keys(scorecards).length;
  const avgScore =
    Object.values(scorecards).length > 0
      ? Math.round(
          Object.values(scorecards).reduce((acc, s) => acc + (s.score || 0), 0) /
            Object.values(scorecards).length
        )
      : 0;

  return (
    <div className="analytics-container">
      <div className="analytics-header">
        <h1>ITS Survey Analytics</h1>
        <p>
          Analysis of Arterial Management, Freeway Management, and Traffic
          Management Survey Data
        </p>
      </div>

      <div className="survey-info">
        <h3>Survey Overview</h3>
        <p>
          Analysis based on responses from transportation agencies across the
          United States
        </p>
        <div className="info-stats">
          <div className="info-stat">
            <div className="stat-number">{totalBills}</div>
            <div className="stat-label">Total Bills</div>
          </div>
          <div className="info-stat">
            <div className="stat-number">{totalEnacted}</div>
            <div className="stat-label">Enacted Bills</div>
          </div>
          <div className="info-stat">
            <div className="stat-number">{statesWithData}</div>
            <div className="stat-label">States Analyzed</div>
          </div>
          <div className="info-stat">
            <div className="stat-number">{avgScore}%</div>
            <div className="stat-label">Avg Score</div>
          </div>
        </div>
      </div>

      <div className="technology-adoption">
        <h2 className="section-title">ITS Technology Adoption Rates</h2>
        <div className="tech-grid">
          <div className="tech-card">
            <div className="tech-icon">🚦</div>
            <div className="tech-name">Signalized Intersections</div>
            <div className="adoption-rate high-adoption">78%</div>
            <div className="adoption-label">Agencies Operating</div>
          </div>
          <div className="tech-card">
            <div className="tech-icon">📹</div>
            <div className="tech-name">CCTV Traffic Monitoring</div>
            <div className="adoption-rate medium-adoption">45%</div>
            <div className="adoption-label">Implementation Rate</div>
          </div>
          <div className="tech-card">
            <div className="tech-icon">🧠</div>
            <div className="tech-name">Adaptive Signal Control</div>
            <div className="adoption-rate medium-adoption">32%</div>
            <div className="adoption-label">ASCT Deployment</div>
          </div>
          <div className="tech-card">
            <div className="tech-icon">📡</div>
            <div className="tech-name">Connected Vehicle Tech</div>
            <div className="adoption-rate low-adoption">18%</div>
            <div className="adoption-label">CV Development</div>
          </div>
          <div className="tech-card">
            <div className="tech-icon">🚨</div>
            <div className="tech-name">Automated Enforcement</div>
            <div className="adoption-rate medium-adoption">28%</div>
            <div className="adoption-label">Deployment Rate</div>
          </div>
          <div className="tech-card">
            <div className="tech-icon">🚶</div>
            <div className="tech-name">Pedestrian ITS</div>
            <div className="adoption-rate low-adoption">23%</div>
            <div className="adoption-label">Warning Systems</div>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-container">
          <h3 className="chart-title">Regional Distribution</h3>
          <div className="chart-canvas">
            <canvas ref={regionalChartRef}></canvas>
          </div>
        </div>
        <div className="chart-container">
          <h3 className="chart-title">Technology Adoption Comparison</h3>
          <div className="chart-canvas">
            <canvas ref={adoptionChartRef}></canvas>
          </div>
        </div>
        <div className="chart-container" style={{ gridColumn: "span 2" }}>
          <h3 className="chart-title">Statistical Area Analysis</h3>
          <div className="chart-canvas">
            <canvas ref={areaChartRef}></canvas>
          </div>
        </div>
      </div>

      <div className="insights-grid">
        <div className="insight-card">
          <h3 className="insight-title">Key Survey Findings</h3>
          <ul className="key-findings">
            <li>
              <span className="finding-icon">🚦</span>
              <span>78% of agencies operate signalized intersections</span>
            </li>
            <li>
              <span className="finding-icon">📹</span>
              <span>45% use CCTV for traffic monitoring</span>
            </li>
            <li>
              <span className="finding-icon">🧠</span>
              <span>Only 32% have deployed adaptive signal control</span>
            </li>
            <li>
              <span className="finding-icon">📡</span>
              <span>18% are developing connected vehicle technology</span>
            </li>
            <li>
              <span className="finding-icon">🚨</span>
              <span>28% use automated enforcement</span>
            </li>
          </ul>
        </div>
        <div className="insight-card">
          <h3 className="insight-title">Recommendations</h3>
          <ul className="key-findings">
            <li>
              <span className="finding-icon">🎯</span>
              <span>Focus on adaptive signal control in medium-sized metros</span>
            </li>
            <li>
              <span className="finding-icon">🔗</span>
              <span>Develop connected vehicle pilot programs</span>
            </li>
            <li>
              <span className="finding-icon">📈</span>
              <span>Increase CCTV adoption through funding incentives</span>
            </li>
            <li>
              <span className="finding-icon">🤝</span>
              <span>Foster regional collaboration for technology sharing</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
