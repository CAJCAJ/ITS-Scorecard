import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useDashboard } from "../context/DashboardContext";
import { apiUrl } from "../services/api";
import { getSessionState } from "../utils/auth";

import DashboardCard from "../components/DashboardCard";

const YEAR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(2000 + index));

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

const REQUEST_TIMEOUT_MS = 30000;
const REQUEST_RETRY_DELAY_MS = 800;

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

function isTimeoutError(error) {
  return error?.code === "ECONNABORTED" || /timeout/i.test(error?.message || "");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(requestFactory) {
  try {
    return await requestFactory();
  } catch (error) {
    if (!isTimeoutError(error) || isAbortError(error)) {
      throw error;
    }
    await wait(REQUEST_RETRY_DELAY_MS);
    return requestFactory();
  }
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

export default function Dashboard() {
  const { selectedState, setSelectedState } = useDashboard();
  const [selectedYear, setSelectedYear] = useState("2023");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState({});
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
              timeout: REQUEST_TIMEOUT_MS,
              signal: controller.signal,
            }),
        },
        {
          key: "deployment",
          run: () =>
            axios.get(apiUrl("/deployment/default-values"), {
              params: { state: stateName, year: selectedYear },
              timeout: REQUEST_TIMEOUT_MS,
              signal: controller.signal,
            }),
        },
        {
          key: "legislation",
          run: () =>
            axios.get(apiUrl("/legislation/analysis"), {
              params: { state: stateName },
              timeout: REQUEST_TIMEOUT_MS,
              signal: controller.signal,
            }),
        },
        {
          key: "planning",
          run: () =>
            axios.get(apiUrl("/planning/score"), {
              params: { state: stateName, year: selectedYear },
              timeout: REQUEST_TIMEOUT_MS,
              signal: controller.signal,
            }),
        },
        {
          key: "facility",
          run: () =>
            axios.get(apiUrl("/facility/score"), {
              params: { state: stateName, year: selectedYear },
              timeout: REQUEST_TIMEOUT_MS,
              signal: controller.signal,
            }),
        },
      ];

      const entries = [];
      for (const request of requests) {
        if (cancelled) return;
        try {
          const response = await requestWithRetry(request.run);
          entries.push([request.key, response.data || {}]);
        } catch (requestError) {
          if (isAbortError(requestError)) return;
          entries.push([
            request.key,
            {
              error:
                requestError.response?.data?.error ||
                requestError.message ||
                "Could not load this domain.",
            },
          ]);
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
