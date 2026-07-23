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
import { getSessionState } from "../utils/auth";
import "./Reports.css";

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

const YEAR_OPTIONS = Array.from({ length: 25 }, (_, index) => String(2000 + index));

export default function Reports() {
  const [states, setStates] = useState([]);
  const [selectedState, setSelectedState] = useState(() => getSessionState() || "");
  const [selectedYear, setSelectedYear] = useState("2024");
  const [analysis, setAnalysis] = useState(null);
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadStates() {
      setLoadingStates(true);
      try {
        if (cancelled) return;
        const scopedState = getSessionState();
        const nextStates = scopedState ? [scopedState] : [];
        setStates(nextStates);
        if (nextStates.length > 0) {
          setSelectedState(nextStates[0]);
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
          apiUrl(
            `/legislation/analysis?state=${encodeURIComponent(
              selectedState
            )}&year=${encodeURIComponent(selectedYear)}`
          )
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
  }, [selectedState, selectedYear]);

  const yearlyChartData = useMemo(
    () =>
      buildLineData(
        analysis?.yearlyCounts || [],
        "Bills enacted",
        "#0057ff"
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
          disabled
          style={{
            minWidth: "240px",
            padding: "14px 18px",
            fontSize: "1.05rem",
            fontWeight: 600,
            borderRadius: "10px",
          }}
        >
          <option value="">
            {loadingStates ? "Loading state..." : "Select a State"}
          </option>
          {states.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
        <select
          value={selectedYear}
          onChange={(event) => setSelectedYear(event.target.value)}
          style={{
            minWidth: "140px",
            padding: "14px 18px",
            fontSize: "1.05rem",
            fontWeight: 600,
            borderRadius: "10px",
          }}
        >
          {YEAR_OPTIONS.map((year) => (
            <option key={year} value={year}>
              {year}
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
            <DashboardCard
              title="Cumulative Bills"
              value={analysis.totalBills}
            />
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

          <div className="legislation-charts-grid">
            <div className="card legislation-year-chart-card">
              <h3 className="chart-title">Bills Enacted by Year</h3>
              <div className="chart-wrapper line">
                <Line data={yearlyChartData} options={chartOptions} />
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
            <h3 style={{ marginTop: 0 }}>
              Enacted Bill Scores for {selectedState} Through {selectedYear}
            </h3>
            <div className="legislation-table-wrap">
              <table className="legislation-bill-table">
                <colgroup>
                  <col style={{ width: "34%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "14%" }} />
                </colgroup>
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
                      <td className="legislation-bill-name">
                        <div>{bill.title}</div>
                        <span>{bill.bill_info}</span>
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
