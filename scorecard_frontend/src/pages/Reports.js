import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

import DashboardCard from "../components/DashboardCard";
import { apiUrl } from "../services/api";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function buildLineData(items, label, color) {
  return {
    labels: items.map((item) => item.year),
    datasets: [
      {
        label,
        data: items.map((item) => item.count),
        borderColor: color,
        backgroundColor: `${color}33`,
        fill: true,
        tension: 0.25,
        pointRadius: 4,
      },
    ],
  };
}

function buildBarData(items, label, color) {
  return {
    labels: items.map((item) => item.label),
    datasets: [
      {
        label,
        data: items.map((item) => item.count),
        backgroundColor: color,
        borderRadius: 8,
      },
    ],
  };
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    y: { beginAtZero: true, ticks: { precision: 0 } },
  },
};

export default function Reports() {
  const [states, setStates] = useState([]);
  const [selectedState, setSelectedState] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadStates() {
      setLoadingStates(true);
      try {
        const response = await axios.get(apiUrl("/legislation/states"));
        if (cancelled) return;
        const nextStates = response.data.states || [];
        setStates(nextStates);
        if (nextStates.length > 0) {
          setSelectedState((current) => current || nextStates[0]);
        }
      } catch (err) {
        if (cancelled) return;
        setError("Could not load legislation states.");
      } finally {
        if (!cancelled) setLoadingStates(false);
      }
    }

    loadStates();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedState) return;

    let cancelled = false;

    async function loadAnalysis() {
      setLoadingAnalysis(true);
      setError("");
      try {
        const response = await axios.get(
          apiUrl(`/legislation/analysis?state=${encodeURIComponent(selectedState)}`)
        );
        if (cancelled) return;
        setAnalysis(response.data);
      } catch (err) {
        if (cancelled) return;
        setAnalysis(null);
        setError(
          err.response?.data?.error || "Could not load legislative analysis."
        );
      } finally {
        if (!cancelled) setLoadingAnalysis(false);
      }
    }

    loadAnalysis();
    return () => {
      cancelled = true;
    };
  }, [selectedState]);

  const yearlyChartData = useMemo(
    () =>
      buildLineData(
        analysis?.yearlyCounts || [],
        "Bills proposed",
        "#0057ff"
      ),
    [analysis]
  );

  const enactedChartData = useMemo(
    () =>
      buildBarData(
        analysis?.enactedCounts || [],
        "Bill count",
        "#10b981"
      ),
    [analysis]
  );

  const topicChartData = useMemo(
    () =>
      buildBarData(
        analysis?.topicCounts || [],
        "Bill count",
        "#f59e0b"
      ),
    [analysis]
  );

  const scoreChartData = useMemo(
    () =>
      buildBarData(
        (analysis?.scoreCounts || []).map((item) => ({
          label: `${item.score}`,
          count: item.count,
        })),
        "Bill count",
        "#7c3aed"
      ),
    [analysis]
  );

  return (
    <div className="dashboard-container">
      <h1 className="dashboard-title">Legislative Analysis</h1>

      <div className="filters-container">
        <select
          value={selectedState}
          onChange={(event) => setSelectedState(event.target.value)}
          style={{
            minWidth: "240px",
            padding: "14px 18px",
            fontSize: "1.05rem",
            fontWeight: 600,
            borderRadius: "10px",
          }}
        >
          <option value="">
            {loadingStates ? "Loading states..." : "Select a State"}
          </option>
          {states.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="upload-banner upload-banner-error" style={{ marginBottom: "24px" }}>
          <span>{error}</span>
        </div>
      )}

      {selectedState && analysis && !loadingAnalysis && (
        <>
          <div className="metrics-grid">
            <DashboardCard title="Total Bills" value={analysis.totalBills} />
            <DashboardCard
              title="Average Bill Score"
              value={analysis.averageRawScore.toFixed(2)}
              color="#7c3aed"
            />
            <DashboardCard
              title="Unified Score"
              value={analysis.unifiedScore.toFixed(3)}
              color="#10b981"
            />
          </div>

          <div className="charts-grid">
            <div className="card">
              <h3 className="chart-title">Bills Proposed by Year</h3>
              <div className="chart-wrapper line">
                <Line data={yearlyChartData} options={chartOptions} />
              </div>
            </div>

            <div className="card">
              <h3 className="chart-title">Enacted vs Not Enacted</h3>
              <div className="chart-wrapper bar">
                <Bar data={enactedChartData} options={chartOptions} />
              </div>
            </div>

            <div className="card">
              <h3 className="chart-title">Bills by ITS Category</h3>
              <div className="chart-wrapper bar">
                <Bar
                  data={topicChartData}
                  options={{
                    ...chartOptions,
                    scales: {
                      ...chartOptions.scales,
                      x: {
                        ticks: { autoSkip: false, maxRotation: 28, minRotation: 28 },
                      },
                    },
                  }}
                />
              </div>
            </div>

            <div className="card">
              <h3 className="chart-title">Legislation Support Score Distribution</h3>
              <div className="chart-wrapper bar">
                <Bar data={scoreChartData} options={chartOptions} />
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: "28px", padding: "24px" }}>
            <h3 style={{ marginTop: 0 }}>Bill Scores for {selectedState}</h3>
            <div style={{ overflowX: "auto" }}>
              <table className="preview-table" style={{ minWidth: "1120px" }}>
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Year</th>
                    <th>Version</th>
                    <th>Category</th>
                    <th>Score</th>
                    <th>Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.bills.map((bill) => (
                    <tr key={`${bill.bill_info}-${bill.title}`}>
                      <td className="kw-cell">
                        <div style={{ fontWeight: 600 }}>{bill.title}</div>
                        <div className="source-cell">{bill.bill_info}</div>
                      </td>
                      <td>{bill.year || "N/A"}</td>
                      <td>{bill.version || "N/A"}</td>
                      <td>{bill.category}</td>
                      <td>{bill.score}</td>
                      <td>{bill.score_label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selectedState && loadingAnalysis && <p>Loading legislative analysis...</p>}
    </div>
  );
}
