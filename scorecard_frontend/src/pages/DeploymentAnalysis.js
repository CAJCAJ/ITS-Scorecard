import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { apiUrl } from "../services/api";
import { getSessionState } from "../utils/auth";
import "./DeploymentAnalysis.css";

const YEARS = Array.from({ length: 24 }, (_, index) => String(2000 + index));
const MODE_ORDER = ["AM", "FM", "TM"];
const MODE_LABELS = {
  AM: "Arterial Management",
  FM: "Freeway Management",
  TM: "Transit Management",
};
const PIE_COLORS = [
  "#0b4f9c",
  "#1769aa",
  "#2479b8",
  "#3189c1",
  "#4199c9",
  "#56a8d0",
  "#6db5d6",
  "#85c1dc",
  "#9dcde3",
  "#b4d8e9",
  "#cbe3ef",
  "#dfedf5",
  "#79a7d3",
  "#4d83b8",
  "#265f97",
];

function renderPiePercentage({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}) {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.62;
  const radians = (-midAngle * Math.PI) / 180;
  const x = cx + radius * Math.cos(radians);
  const y = cy + radius * Math.sin(radians);

  return (
    <text
      x={x}
      y={y}
      fill="#0f2742"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize="12"
      fontWeight="700"
    >
      {(percent * 100).toFixed(1)}%
    </text>
  );
}

export default function DeploymentAnalysis() {
  const [selectedYear, setSelectedYear] = useState("2023");
  const [selectedState] = useState(() => getSessionState() || "New Jersey");
  const [selectedMode, setSelectedMode] = useState("AM");
  const [items, setItems] = useState([]);
  const [agencyWeights, setAgencyWeights] = useState([]);
  const [coverageScore, setCoverageScore] = useState(null);
  const [modeScores, setModeScores] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDefaults() {
      setLoading(true);
      try {
        const response = await axios.get(
          apiUrl(
            `/deployment/default-values?year=${encodeURIComponent(
              selectedYear
            )}&state=${encodeURIComponent(selectedState)}`
          )
        );
        if (cancelled) return;
        setItems(response.data.items || []);
        setAgencyWeights(response.data.agency_weights || []);
        setCoverageScore(response.data.coverage_score ?? null);
        setModeScores(response.data.mode_scores || []);
        setMessage(response.data.message || "");
      } catch (error) {
        if (cancelled) return;
        setItems([]);
        setAgencyWeights([]);
        setCoverageScore(null);
        setModeScores([]);
        setMessage(
          error.response?.data?.error ||
            "Could not load deployment default values."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDefaults();
    return () => {
      cancelled = true;
    };
  }, [selectedYear, selectedState]);

  const heading = useMemo(
    () => `Default Values for ${selectedState} (${selectedYear})`,
    [selectedState, selectedYear]
  );

  const availableModes = useMemo(() => {
    const modes = new Set(
      agencyWeights.map((item) => String(item.survey_mode || "").toUpperCase())
    );
    return MODE_ORDER.filter((mode) => modes.has(mode));
  }, [agencyWeights]);

  useEffect(() => {
    if (
      availableModes.length > 0 &&
      !availableModes.includes(selectedMode)
    ) {
      setSelectedMode(availableModes[0]);
    }
  }, [availableModes, selectedMode]);

  const agencyRows = useMemo(() => {
    const byAgency = new Map();
    agencyWeights
      .filter(
        (item) =>
          String(item.survey_mode || "").toUpperCase() === selectedMode
      )
      .forEach((item) => {
      const name = item.agency_name || "Unknown Agency";
      const agencyWeight = Number(item.agency_weight);
      const contributionScore = Number(item.contribution_score);
      const contributionPercentage = Number(item.contribution_percentage);
      if (!Number.isFinite(agencyWeight)) return;

      const existing = byAgency.get(name) || {
        agency_name: name,
        weighted_sum: 0,
        contribution_total: 0,
        fallback_sum: 0,
        fallback_count: 0,
        contribution_percentage: 0,
      };

      if (Number.isFinite(contributionScore) && contributionScore > 0) {
        existing.weighted_sum += agencyWeight * contributionScore;
        existing.contribution_total += contributionScore;
      }
      if (Number.isFinite(contributionPercentage)) {
        existing.contribution_percentage += contributionPercentage;
      }
      existing.fallback_sum += agencyWeight;
      existing.fallback_count += 1;
      byAgency.set(name, existing);
    });

    return Array.from(byAgency.values())
      .map((item) => ({
        agency_name: item.agency_name,
        agency_weight:
          item.contribution_total > 0
            ? item.weighted_sum / item.contribution_total
            : item.fallback_sum / Math.max(1, item.fallback_count),
        contribution_percentage: item.contribution_percentage,
      }))
      .sort(
        (a, b) => b.contribution_percentage - a.contribution_percentage
      );
  }, [agencyWeights, selectedMode]);

  const pieData = useMemo(
    () =>
      agencyRows
        .filter((item) => item.contribution_percentage > 0)
        .map((item) => ({
          name: item.agency_name,
          value: item.contribution_percentage,
        })),
    [agencyRows]
  );

  const formattedCoverageScore =
    coverageScore === null || coverageScore === undefined
      ? "N/A"
      : Number(coverageScore).toFixed(3);

  return (
    <div className="dashboard-container">
      <h1 className="dashboard-title">Deployment Analysis</h1>

      <div className="filters-container">
        <select
          value={selectedYear}
          onChange={(event) => setSelectedYear(event.target.value)}
          style={{
            minWidth: "190px",
            padding: "14px 18px",
            fontSize: "1.08rem",
            fontWeight: 600,
            borderRadius: "10px",
          }}
        >
          {YEARS.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>

        <select
          value={selectedState}
          disabled
          style={{
            minWidth: "220px",
            padding: "14px 18px",
            fontSize: "1.08rem",
            fontWeight: 600,
            borderRadius: "10px",
          }}
        >
          <option value={selectedState}>{selectedState}</option>
        </select>
      </div>

      <div className="deployment-analysis-grid">
        <section className="card" style={{ padding: "24px" }}>
          <h3 style={{ marginTop: 0 }}>{heading}</h3>
          <p style={{ marginTop: "-6px", fontWeight: 700 }}>
            Overall Coverage Score: {formattedCoverageScore}
          </p>
          {modeScores.length > 0 && (
            <p style={{ color: "#64748b", marginTop: "-4px" }}>
              {modeScores
                .map(
                  (item) =>
                    `${item.survey_mode}: ${Number(item.coverage_score).toFixed(
                      3
                    )}`
                )
                .join(" | ")}
            </p>
          )}

          {loading ? (
            <p>Loading default values...</p>
          ) : items.length === 0 ? (
            <p>{message || `No Data Found for Year ${selectedYear}`}</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                className="preview-table"
                style={{ minWidth: "760px", tableLayout: "auto" }}
              >
                <colgroup>
                  <col style={{ width: "480px" }} />
                  <col style={{ width: "150px" }} />
                  <col style={{ width: "170px" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Category Strength</th>
                    <th>Positive Agencies</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.domain_name}>
                      <td className="kw-cell" style={{ whiteSpace: "nowrap" }}>
                        {item.domain_name}
                      </td>
                      <td>{Number(item.default_value).toFixed(3)}</td>
                      <td>
                        {Number(
                          item.positive_agency_count ||
                            item.covered_agency_count ||
                            0
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card" style={{ padding: "24px" }}>
          <div className="deployment-agency-heading">
            <h3>Agency Weights</h3>
            <span>{MODE_LABELS[selectedMode] || selectedMode}</span>
          </div>
          {loading ? (
            <p>Loading agency weights...</p>
          ) : agencyRows.length === 0 ? (
            <p>{message || `No agency weights found for ${selectedYear}`}</p>
          ) : (
            <div style={{ overflowX: "auto", maxHeight: "640px" }}>
              <table
                className="preview-table"
                style={{ minWidth: "420px", tableLayout: "auto" }}
              >
                <colgroup>
                  <col style={{ width: "260px" }} />
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "130px" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Agency</th>
                    <th>Agency Weight</th>
                    <th>Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {agencyRows.map((item) => (
                    <tr key={item.agency_name}>
                      <td className="kw-cell">{item.agency_name}</td>
                      <td>{Number(item.agency_weight).toFixed(3)}</td>
                      <td>
                        {Number(item.contribution_percentage).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="card deployment-contribution-card">
        <div className="deployment-contribution-header">
          <div>
            <h3>Agency Contribution Percentage</h3>
            <p>
              Contribution percentages total 100% within each survey mode.
            </p>
          </div>
          <div
            className="deployment-mode-selector"
            role="group"
            aria-label="Survey mode"
          >
            {MODE_ORDER.map((mode) => (
              <button
                key={mode}
                type="button"
                className={selectedMode === mode ? "active" : ""}
                onClick={() => setSelectedMode(mode)}
                disabled={!availableModes.includes(mode)}
                aria-pressed={selectedMode === mode}
              >
                <strong>{mode}</strong>
                <span>{MODE_LABELS[mode]}</span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p>Loading contribution chart...</p>
        ) : pieData.length === 0 ? (
          <p>{message || `No contribution data found for ${selectedYear}`}</p>
        ) : (
          <div className="deployment-pie-layout">
            <div className="deployment-pie-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius="88%"
                    startAngle={90}
                    endAngle={-270}
                    labelLine={false}
                    label={renderPiePercentage}
                    isAnimationActive
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                        stroke="#ffffff"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [
                      `${Number(value).toFixed(2)}%`,
                      "Contribution",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="deployment-pie-legend">
              <h4>{MODE_LABELS[selectedMode]} agencies</h4>
              <div className="deployment-pie-legend-list">
                {pieData.map((entry, index) => (
                  <div className="deployment-pie-legend-row" key={entry.name}>
                    <span
                      className="deployment-pie-swatch"
                      style={{
                        backgroundColor:
                          PIE_COLORS[index % PIE_COLORS.length],
                      }}
                    />
                    <span className="deployment-pie-agency">{entry.name}</span>
                    <strong>{Number(entry.value).toFixed(2)}%</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
