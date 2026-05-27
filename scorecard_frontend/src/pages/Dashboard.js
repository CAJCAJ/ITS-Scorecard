import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDashboard } from "../context/DashboardContext";
import { apiUrl } from "../services/api";
import { getSessionState } from "../utils/auth";

import DashboardCard from "../components/DashboardCard";

const YEAR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(2000 + index));
const TREND_YEARS = YEAR_OPTIONS.slice(-12);

const DOMAIN_ROUTES = {
  benefitCost: "/scorecards/benefit-cost-analysis",
  deployment: "/scorecards/deployment-analysis",
  legislation: "/scorecards/legislative-analysis",
  planning: "/scorecards/planning-analysis",
  facility: "/scorecards/facility-analysis",
};

const DOMAIN_COLORS = {
  benefitCost: "#0ea5e9",
  deployment: "#0057ff",
  legislation: "#7c3aed",
  planning: "#f59e0b",
  facility: "#10b981",
};

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatScore(value) {
  const numeric = asNumber(value);
  return numeric === null ? "N/A" : numeric.toFixed(3);
}

function scorePercent(value) {
  const numeric = asNumber(value);
  if (numeric === null) return 0;
  return Math.max(0, Math.min(100, numeric * 100));
}

function availableScores(items) {
  return items
    .map((item) => asNumber(item.score))
    .filter((value) => value !== null);
}

function isAbortError(error) {
  return (
    axios.isCancel?.(error) ||
    error?.code === "ERR_CANCELED" ||
    error?.name === "CanceledError"
  );
}

function buildDomainRows(results) {
  const deploymentItems = results.deployment?.items || [];
  const deploymentScores = deploymentItems
    .map((item) => asNumber(item.default_value))
    .filter((value) => value !== null);
  const deploymentScore = deploymentScores.length
    ? deploymentScores.reduce((sum, value) => sum + value, 0) / deploymentScores.length
    : null;

  return [
    {
      key: "benefitCost",
      label: "B/C Analysis",
      route: DOMAIN_ROUTES.benefitCost,
      score: results.benefitCost?.unified_score,
      source: results.benefitCost?.source || "No Value Available",
      detail: results.benefitCost?.benefit_cost_ratio
        ? `B/C ratio ${Number(results.benefitCost.benefit_cost_ratio).toFixed(3)}`
        : "Benefit and cost score from uploaded defaults or survey updates.",
    },
    {
      key: "deployment",
      label: "Deployment Analysis",
      route: DOMAIN_ROUTES.deployment,
      score: deploymentScore,
      source: deploymentItems.length ? "Calculated from Upload" : "No Value Available",
      detail: deploymentItems.length
        ? `${deploymentItems.length} deployment domains summarized`
        : results.deployment?.message || "Deployment workbook defaults are not available.",
    },
    {
      key: "legislation",
      label: "Legislative Analysis",
      route: DOMAIN_ROUTES.legislation,
      score: results.legislation?.unifiedScore,
      source: results.legislation?.totalBills ? "Calculated from Upload" : "No Value Available",
      detail: results.legislation?.totalBills
        ? `${results.legislation.totalBills} bills, average raw score ${Number(
            results.legislation.averageRawScore || 0
          ).toFixed(2)}`
        : "Legislation data is not available for this state.",
    },
    {
      key: "planning",
      label: "Planning Analysis",
      route: DOMAIN_ROUTES.planning,
      score: results.planning?.unified_score,
      source: results.planning?.source || "No Value Available",
      detail:
        results.planning?.award_score !== undefined
          ? `Award ${formatScore(results.planning.award_score)}, planning ${formatScore(
              results.planning.planning_score
            )}`
          : "Planning score from uploaded defaults or survey updates.",
    },
    {
      key: "facility",
      label: "Facility Analysis",
      route: DOMAIN_ROUTES.facility,
      score: results.facility?.unified_score,
      source: results.facility?.source || "No Value Available",
      detail:
        results.facility?.aggregate_capacity !== undefined
          ? `Aggregate capacity ${Number(results.facility.aggregate_capacity || 0).toFixed(2)}`
          : "Facility score from uploaded defaults or survey updates.",
    },
  ];
}

function calculateDeploymentScore(result) {
  const deploymentItems = result?.items || [];
  const deploymentScores = deploymentItems
    .map((item) => asNumber(item.default_value))
    .filter((value) => value !== null);

  return deploymentScores.length
    ? deploymentScores.reduce((sum, value) => sum + value, 0) / deploymentScores.length
    : null;
}

function calculateOverallScore(results) {
  const scores = [
    asNumber(results.benefitCost?.unified_score),
    calculateDeploymentScore(results.deployment),
    asNumber(results.legislation?.unifiedScore),
    asNumber(results.planning?.unified_score),
    asNumber(results.facility?.unified_score),
  ].filter((value) => value !== null);

  return scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
}

export default function Dashboard() {
  const { selectedState, setSelectedState } = useDashboard();
  const [selectedYear, setSelectedYear] = useState("2023");
  const [loading, setLoading] = useState(false);
  const [trendLoading, setTrendLoading] = useState(false);
  const [error, setError] = useState("");
  const [trendError, setTrendError] = useState("");
  const [results, setResults] = useState({});
  const [trendData, setTrendData] = useState([]);
  const sessionState = getSessionState();
  const stateName = sessionState || selectedState;

  useEffect(() => {
    if (sessionState && selectedState !== sessionState) {
      setSelectedState(sessionState);
    }
  }, [sessionState, selectedState, setSelectedState]);

  useEffect(() => {
    if (!stateName) return;

    let cancelled = false;
    const controller = new AbortController();

    async function loadDashboard() {
      setLoading(true);
      setError("");

      const requests = [
        {
          key: "benefitCost",
          run: () =>
            axios.get(apiUrl("/benefit-cost/score"), {
              params: { state: stateName, year: selectedYear },
              signal: controller.signal,
            }),
        },
        {
          key: "deployment",
          run: () =>
            axios.get(apiUrl("/deployment/default-values"), {
              params: { state: stateName, year: selectedYear },
              signal: controller.signal,
            }),
        },
        {
          key: "legislation",
          run: () =>
            axios.get(apiUrl("/legislation/analysis"), {
              params: { state: stateName, year: selectedYear },
              signal: controller.signal,
            }),
        },
        {
          key: "planning",
          run: () =>
            axios.get(apiUrl("/planning/score"), {
              params: { state: stateName, year: selectedYear },
              signal: controller.signal,
            }),
        },
        {
          key: "facility",
          run: () =>
            axios.get(apiUrl("/facility/score"), {
              params: { state: stateName, year: selectedYear },
              signal: controller.signal,
            }),
        },
      ];

      const entries = [];
      for (const request of requests) {
        if (cancelled) return;
        try {
          const response = await request.run();
          entries.push([request.key, response.data || {}]);
        } catch (requestError) {
          if (isAbortError(requestError)) return;
          throw requestError;
        }
      }

      if (cancelled) return;
      setResults(Object.fromEntries(entries));
      setLoading(false);
    }

    loadDashboard().catch((requestError) => {
      if (cancelled) return;
      setError(requestError.message || "Could not load dashboard data.");
      setLoading(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [stateName, selectedYear]);

  const hasCompleteSummary = Object.keys(results).length === 5 && !loading && !error;

  useEffect(() => {
    if (!stateName || !hasCompleteSummary) return;

    let cancelled = false;
    const controller = new AbortController();

    async function loadTrend() {
      setTrendLoading(true);
      setTrendError("");

      const rows = [];
      for (const year of TREND_YEARS) {
        if (cancelled) return;
        try {
          const [benefitCost, deployment, legislation, planning, facility] = await Promise.all([
            axios.get(apiUrl("/benefit-cost/score"), {
              params: { state: stateName, year },
              signal: controller.signal,
            }),
            axios.get(apiUrl("/deployment/default-values"), {
              params: { state: stateName, year },
              signal: controller.signal,
            }),
            axios.get(apiUrl("/legislation/analysis"), {
              params: { state: stateName, year },
              signal: controller.signal,
            }),
            axios.get(apiUrl("/planning/score"), {
              params: { state: stateName, year },
              signal: controller.signal,
            }),
            axios.get(apiUrl("/facility/score"), {
              params: { state: stateName, year },
              signal: controller.signal,
            }),
          ]);

          const yearResults = {
            benefitCost: benefitCost.data || {},
            deployment: deployment.data || {},
            legislation: legislation.data || {},
            planning: planning.data || {},
            facility: facility.data || {},
          };
          rows.push({
            year,
            overall: calculateOverallScore(yearResults),
            benefitCost: asNumber(yearResults.benefitCost?.unified_score),
            deployment: calculateDeploymentScore(yearResults.deployment),
            legislation: asNumber(yearResults.legislation?.unifiedScore),
            planning: asNumber(yearResults.planning?.unified_score),
            facility: asNumber(yearResults.facility?.unified_score),
          });
        } catch (requestError) {
          if (isAbortError(requestError)) return;
          throw requestError;
        }
      }

      if (cancelled) return;
      setTrendData(rows);
      setTrendLoading(false);
    }

    loadTrend().catch((requestError) => {
      if (cancelled) return;
      setTrendError(requestError.message || "Could not load historical trend.");
      setTrendLoading(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [stateName, hasCompleteSummary]);

  const domainRows = useMemo(() => buildDomainRows(results), [results]);
  const scores = availableScores(domainRows);
  const overallScore = scores.length
    ? scores.reduce((sum, value) => sum + value, 0) / scores.length
    : null;
  const strongestDomain = domainRows
    .filter((item) => asNumber(item.score) !== null)
    .sort((a, b) => Number(b.score) - Number(a.score))[0];

  return (
    <div className="dashboard-container" style={{ maxWidth: "1380px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "20px",
          marginBottom: "24px",
        }}
      >
        <div>
          <h1 className="dashboard-title" style={{ marginBottom: "8px" }}>
            ITS Scorecard Dashboard - {stateName}
          </h1>
          <div style={{ color: "#607185", lineHeight: 1.6, maxWidth: "860px" }}>
            Dynamic summary from the Scorecards tabs for the authenticated state.
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "end" }}>
          <label>
            <div style={{ fontWeight: 700, marginBottom: "8px" }}>Year</div>
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
              style={{
                padding: "12px 14px",
                borderRadius: "8px",
                border: "1px solid #cfd8e3",
                fontSize: "1rem",
                background: "#fff",
              }}
            >
              {YEAR_OPTIONS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div style={{ fontWeight: 700, marginBottom: "8px" }}>State</div>
            <select
              value={stateName}
              disabled
              style={{
                padding: "12px 14px",
                borderRadius: "8px",
                border: "1px solid #cfd8e3",
                fontSize: "1rem",
                background: "#fff",
              }}
            >
              <option value={stateName}>{stateName}</option>
            </select>
          </label>
        </div>
      </div>

      {error ? (
        <div className="card" style={{ padding: "22px", color: "#b42318" }}>
          {error}
        </div>
      ) : null}

      <div className="metrics-grid">
        <DashboardCard
          title="Overall Score"
          value={overallScore === null ? "N/A" : overallScore.toFixed(3)}
          color="#0057ff"
        />
        <DashboardCard
          title="Available Domains"
          value={`${scores.length} / ${domainRows.length}`}
          color="#10b981"
        />
        <DashboardCard
          title="Strongest Domain"
          value={strongestDomain?.label || "N/A"}
          color="#7c3aed"
        />
      </div>

      {loading ? (
        <div className="card" style={{ padding: "24px", marginBottom: "24px" }}>
          Loading scorecard summary...
        </div>
      ) : null}

      <section className="card dashboard-trend-card">
        <div className="dashboard-section-header">
          <div>
            <h3>Historical Score Trend</h3>
            <p>Overall and domain scores by year for {stateName}</p>
          </div>
          <span>{TREND_YEARS[0]}-{TREND_YEARS[TREND_YEARS.length - 1]}</span>
        </div>
        {trendError ? (
          <div className="dashboard-trend-message">{trendError}</div>
        ) : trendLoading ? (
          <div className="dashboard-trend-message">Loading historical trend...</div>
        ) : (
          <div className="dashboard-trend-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 10, right: 22, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6ecf3" />
                <XAxis dataKey="year" tick={{ fill: "#607185", fontSize: 12 }} />
                <YAxis
                  domain={[0, 1]}
                  tick={{ fill: "#607185", fontSize: 12 }}
                  tickFormatter={(value) => Number(value).toFixed(1)}
                />
                <Tooltip
                  formatter={(value, name) => [formatScore(value), name]}
                  labelFormatter={(label) => `Year ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="overall"
                  name="Overall"
                  stroke="#111827"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="benefitCost"
                  name="B/C"
                  stroke={DOMAIN_COLORS.benefitCost}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="deployment"
                  name="Deployment"
                  stroke={DOMAIN_COLORS.deployment}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="legislation"
                  name="Legislation"
                  stroke={DOMAIN_COLORS.legislation}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="planning"
                  name="Planning"
                  stroke={DOMAIN_COLORS.planning}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="facility"
                  name="Facility"
                  stroke={DOMAIN_COLORS.facility}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="dashboard-trend-legend">
          <span style={{ "--legend-color": "#111827" }}>Overall</span>
          <span style={{ "--legend-color": DOMAIN_COLORS.benefitCost }}>B/C</span>
          <span style={{ "--legend-color": DOMAIN_COLORS.deployment }}>Deployment</span>
          <span style={{ "--legend-color": DOMAIN_COLORS.legislation }}>Legislation</span>
          <span style={{ "--legend-color": DOMAIN_COLORS.planning }}>Planning</span>
          <span style={{ "--legend-color": DOMAIN_COLORS.facility }}>Facility</span>
        </div>
      </section>

      <div className="scorecard-dashboard-grid">
        <section className="card" style={{ padding: "26px", borderRadius: "8px" }}>
          <h3 style={{ marginTop: 0, color: "#1f2d3d" }}>Scorecard Domains</h3>
          <div style={{ display: "grid", gap: "16px" }}>
            {domainRows.map((domain) => (
              <div key={domain.key}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "16px",
                    marginBottom: "7px",
                    color: "#1f2d3d",
                    fontWeight: 700,
                  }}
                >
                  <span>{domain.label}</span>
                  <span>{formatScore(domain.score)}</span>
                </div>
                <div
                  style={{
                    height: "12px",
                    borderRadius: "999px",
                    background: "#e8edf3",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${scorePercent(domain.score)}%`,
                      height: "100%",
                      background: DOMAIN_COLORS[domain.key],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card" style={{ padding: "26px", borderRadius: "8px" }}>
          <h3 style={{ marginTop: 0, color: "#1f2d3d" }}>Source Summary</h3>
          <div className="dashboard-source-scroll">
            <table className="preview-table dashboard-source-table">
              <colgroup>
                <col style={{ width: "22%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "21%" }} />
                <col style={{ width: "34%" }} />
                <col style={{ width: "12%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Score</th>
                  <th>Source</th>
                  <th>Details</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {domainRows.map((domain) => (
                  <tr key={domain.key}>
                    <td className="kw-cell">{domain.label}</td>
                    <td>{formatScore(domain.score)}</td>
                    <td className="source-cell">
                      {results[domain.key]?.error || domain.source}
                    </td>
                    <td className="source-cell">{domain.detail}</td>
                    <td className="dashboard-action-cell">
                      <Link className="btn btn-outline btn-small" to={domain.route}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
