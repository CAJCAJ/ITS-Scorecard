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

const DOMAIN_EXPLANATIONS = {
  "Active Traffic and Demand Management":
    "Uses survey responses about active traffic management, demand management, ramp or lane controls, and operational strategies. Higher scores reflect more deployed or active capabilities reported by agencies.",
  "Connected, Automated, and Emerging Vehicle Technology":
    "Uses survey responses about connected vehicle, automated vehicle, roadside unit, V2X, and emerging technology deployments. Positive deployment or higher coverage responses increase the score.",
  "ITS Program Planning and Operational Support":
    "Uses survey responses about ITS planning, operations support, coordination, staffing, procedures, and program-level readiness. Agencies with active planning and support functions contribute higher values.",
  "Road Weather Information and Response":
    "Uses survey responses about road weather sensors, weather-responsive operations, warning systems, and maintenance response tools. Deployed systems and broader coverage increase the category score.",
  "Safety Enforcement and Incident Response":
    "Uses survey responses about incident detection, emergency response, enforcement support, preemption, safety warning, and response coordination technologies. Positive deployment answers raise the score.",
  "Signal Management and Intersection Control":
    "Uses survey responses about signal systems, adaptive control, detection, preemption, priority, timing, and intersection management. More deployed signal-related capabilities lead to a higher score.",
  "Traffic Monitoring and Data Collection":
    "Uses survey responses about detectors, sensors, cameras, traffic counts, data collection systems, and monitoring coverage. Positive responses and higher deployment extent increase the score.",
  "Transit and Fleet ITS Technology":
    "Uses survey responses about transit management, fleet tracking, vehicle technology, traveler information for transit, and fleet operations tools. Deployed transit or fleet ITS capabilities increase the score.",
  "Traveler Information and User Services":
    "Uses survey responses about traveler information, alerts, websites, apps, dynamic signs, data feeds, and public-facing user services. More active information services increase the score.",
  "Vulnerable Road User Safety Applications":
    "Uses survey responses about pedestrian, bicyclist, and vulnerable road user detection, warning, safety, and crossing-support technologies. Positive safety application responses increase the score.",
  "Work Zone ITS and Queue Warning":
    "Uses survey responses about work zone traffic management, queue warning, temporary sensors, portable signs, and construction-area information systems. Deployed systems increase the score.",
};

function shortQuestionLabel(item) {
  const raw = String(item.question || item.answer_variable || "Survey item").trim();
  if (raw.length <= 72) return raw;
  return `${raw.slice(0, 69)}...`;
}

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
  const [sourceDocuments, setSourceDocuments] = useState([]);
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
        setSourceDocuments(response.data.source_documents || []);
        setCoverageScore(response.data.coverage_score ?? null);
        setModeScores(response.data.mode_scores || []);
        setMessage(response.data.message || "");
      } catch (error) {
        if (cancelled) return;
        setItems([]);
        setAgencyWeights([]);
        setSourceDocuments([]);
        setCoverageScore(null);
        setModeScores([]);
        setMessage(
          error.response?.data?.error ||
            "Could not load deployment coverage results."
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
    () => `Coverage Analysis Results for ${selectedState} (${selectedYear})`,
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
            <p>Loading coverage analysis results...</p>
          ) : items.length === 0 ? (
            <p>{message || `No Data Found for Year ${selectedYear}`}</p>
          ) : (
            <div className="deployment-table-wrap">
              <table className="deployment-coverage-table">
                <colgroup>
                  <col style={{ width: "64%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "18%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>ITS Technology</th>
                    <th>Coverage Score</th>
                    <th>Positive Agencies</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.domain_name}>
                      <td className="deployment-technology-cell">
                        <span className="deployment-technology-name">
                          {item.domain_name}
                        </span>
                        <div className="deployment-category-tooltip">
                          <h4>{item.domain_name}</h4>
                          <p>
                            {DOMAIN_EXPLANATIONS[item.domain_name] ||
                              "Uses mapped ITS Deployment Survey questions for this category. Positive deployment, active use, or broader coverage responses increase the coverage score."}
                          </p>
                          <p>
                            The score summarizes positive deployment evidence
                            across agencies for this technology area and is
                            weighted by agency scale where available.
                          </p>
                          <div className="deployment-tooltip-bars">
                            <strong>Top survey items</strong>
                            {(item.top_items || []).length === 0 ? (
                              <span className="deployment-tooltip-empty">
                                No item detail available.
                              </span>
                            ) : (
                              item.top_items.map((detail, detailIndex) => {
                                const positiveRate = Number(
                                  detail.positive_rate || 0
                                );
                                const barWidth = `${Math.max(
                                  4,
                                  Math.min(100, positiveRate * 100)
                                )}%`;
                                return (
                                  <div
                                    className="deployment-tooltip-bar-row"
                                    key={`${detail.answer_variable}-${detail.question_id}-${detailIndex}`}
                                  >
                                    <div className="deployment-tooltip-bar-label">
                                      {shortQuestionLabel(detail)}
                                    </div>
                                    <div className="deployment-tooltip-bar-track">
                                      <span style={{ width: barWidth }} />
                                    </div>
                                    <div className="deployment-tooltip-bar-value">
                                      {Number(positiveRate * 100).toFixed(0)}%
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
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
            <h3>Agency Scores</h3>
            <span>{MODE_LABELS[selectedMode] || selectedMode}</span>
          </div>
          {loading ? (
            <p>Loading agency scores...</p>
          ) : agencyRows.length === 0 ? (
            <p>{message || `No agency scores found for ${selectedYear}`}</p>
          ) : (
            <div className="deployment-agency-table-wrap">
              <table className="deployment-agency-table">
                <colgroup>
                  <col style={{ width: "56%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "24%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Agency</th>
                    <th>Agency Score</th>
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

      <section className="card deployment-source-card">
        <h3>Score Based on Following Data Resource ({selectedYear})</h3>
        {loading ? (
          <p>Loading uploaded source tables...</p>
        ) : sourceDocuments.length === 0 ? (
          <p>No uploaded deployment survey tables found for {selectedYear}.</p>
        ) : (
          <div className="deployment-table-wrap">
            <table className="deployment-source-table">
              <colgroup>
                <col style={{ width: "36%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "14%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Table Name</th>
                  <th>Category</th>
                  <th>Survey Type</th>
                  <th>Scope</th>
                  <th>Rows</th>
                </tr>
              </thead>
              <tbody>
                {sourceDocuments.map((document) => (
                  <tr key={document.id}>
                    <td>{document.table_name || document.original_name}</td>
                    <td>{document.category || "ITS Deployment Coverage Data"}</td>
                    <td>{document.agency_type || "N/A"}</td>
                    <td>{document.survey_scope || "N/A"}</td>
                    <td>{Number(document.row_count || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
