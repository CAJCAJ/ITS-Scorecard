import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import DashboardCard from "../components/DashboardCard";
import { getTopicLabel, TOPIC_KEYS } from "../config/surveySchema";
import { apiUrl } from "../services/api";
import { getTopicAnswers, loadSurveyAnswers } from "../utils/surveyUpdates";
import { getSessionState } from "../utils/auth";
import "./BenefitCostAnalysis.css";

const YEAR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(2000 + index));
const PROVENANCE_LABELS = {
  Exact_Dataset: "Exact Dataset",
  Authorized_Derived: "Authorized Derived",
  Mock_Default: "Mock Default",
};

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function formatValue(label, value) {
  if (
    label.includes("Benefit") ||
    label.includes("Cost")
  ) {
    return formatMoney(value);
  }
  return value;
}

function evidenceLabel(detail) {
  if (!detail) return "Provided Input";
  return PROVENANCE_LABELS[detail.provenance_type] || "Uploaded Value";
}

function tooltipId(componentKey) {
  return `bc-detail-${String(componentKey || "component").replace(/[^a-z0-9_-]/gi, "-")}`;
}

export default function BenefitCostAnalysis() {
  const [allAnswers, setAllAnswers] = useState(() => loadSurveyAnswers());
  const [result, setResult] = useState(null);
  const [selectedYear, setSelectedYear] = useState("2023");
  const [selectedState] = useState(() => getSessionState() || "Texas");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const bcAnswers = useMemo(
    () => getTopicAnswers(allAnswers, TOPIC_KEYS.BENEFIT_COST),
    [allAnswers]
  );

  const answeredCount = Object.values(bcAnswers).filter((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return String(value || "").trim() !== "";
  }).length;

  const activeInputCount = result?.breakdown
    ? result.breakdown.filter((item) => Number(item.value) > 0).length
    : answeredCount;

  const reviewRequiredCount = useMemo(() => {
    if (!result?.breakdown) return 0;
    return result.breakdown.filter(
      (item) => item.source_detail?.review_required
    ).length;
  }, [result]);

  const fetchScore = async (answers, stateName = selectedState, year = selectedYear) => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get(apiUrl("/benefit-cost/score"), {
        params: {
          state: stateName,
          year,
        },
      });
      if (response.data?.has_required_input) {
        setResult(response.data);
      } else {
        const fallbackResponse = await axios.post(apiUrl("/benefit-cost/score"), {
          answers,
        });
        setResult({
          ...fallbackResponse.data,
          source: fallbackResponse.data?.has_required_input
            ? "Local Browser Answers"
            : response.data?.source || "No Value Available",
        });
      }
    } catch (requestError) {
      setResult(null);
      setError(
        requestError.response?.data?.error ||
          "Could not calculate the benefit/cost score."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScore(bcAnswers, selectedState, selectedYear);
  }, [bcAnswers, selectedState, selectedYear]);

  const handleRefresh = () => {
    const latestAnswers = loadSurveyAnswers();
    setAllAnswers(latestAnswers);
    fetchScore(
      getTopicAnswers(latestAnswers, TOPIC_KEYS.BENEFIT_COST),
      selectedState,
      selectedYear
    );
  };

  const noUsableInput =
    !loading &&
    !error &&
    (!result || !result.has_input || !result.has_required_input);

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
            B/C Analysis
          </h1>
          <div style={{ color: "#607185", lineHeight: 1.6, maxWidth: "900px" }}>
            Review the current benefit and cost inputs and the score generated
            from the saved answers.
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "end", flexWrap: "wrap" }}>
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
              value={selectedState}
              disabled
              style={{
                padding: "12px 14px",
                borderRadius: "8px",
                border: "1px solid #cfd8e3",
                fontSize: "1rem",
                background: "#fff",
              }}
            >
              <option value={selectedState}>{selectedState}</option>
            </select>
          </label>
          <button type="button" className="btn btn-outline" onClick={handleRefresh}>
            Refresh Inputs
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: "28px", borderRadius: "18px" }}>
          Loading B/C score...
        </div>
      ) : error ? (
        <div
          className="card"
          style={{ padding: "28px", borderRadius: "18px", lineHeight: 1.7 }}
        >
          {error}
        </div>
      ) : noUsableInput ? (
        <div
          className="card"
          style={{
            padding: "28px",
            borderRadius: "18px",
            fontSize: "1.06rem",
            lineHeight: 1.7,
          }}
        >
          No Available Input for Scoring, Please Upload and Answer the Questions!
        </div>
      ) : (
        <>
          <div className="metrics-grid">
            <DashboardCard
              title="Active Inputs"
              value={activeInputCount}
              color="#0057ff"
            />
            <DashboardCard
              title="Annual Benefits"
              value={formatMoney(result.total_benefit)}
              color="#7c3aed"
            />
            <DashboardCard
              title="Annual Costs"
              value={formatMoney(result.total_cost)}
              color="#f59e0b"
            />
            <DashboardCard
              title="B/C Ratio"
              value={result.benefit_cost_ratio.toFixed(3)}
              color="#0ea5e9"
            />
            <DashboardCard
              title="Unified B/C Score"
              value={result.unified_score.toFixed(3)}
              color="#10b981"
            />
            <DashboardCard
              title="Defaults to Review"
              value={reviewRequiredCount}
              color="#dc6b19"
            />
          </div>

          <div
            className="bc-analysis-grid"
          >
            <section className="card" style={{ padding: "26px", borderRadius: "18px" }}>
              <h3 style={{ marginTop: 0, color: "#1f2d3d" }}>
                Benefit and Cost Breakdown
              </h3>
              <div className="bc-table-wrap">
                <table className="bc-breakdown-table">
                  <colgroup>
                    <col style={{ width: "36%" }} />
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "26%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th>Reported Value</th>
                      <th>Unified Score</th>
                      <th>Evidence Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.breakdown.map((item) => {
                      const detail = item.source_detail;
                      const detailId = tooltipId(item.component_key);
                      return (
                      <tr
                        key={item.component_key || item.label}
                        className={detail?.review_required ? "bc-review-row" : ""}
                      >
                        <td className="bc-component-cell">
                          <span
                            className="bc-component-name"
                            tabIndex={0}
                            aria-describedby={detailId}
                          >
                            {item.label}
                          </span>
                          <div
                            id={detailId}
                            className="bc-component-tooltip"
                            role="tooltip"
                          >
                            <h4>{item.label}</h4>
                            <p>
                              <strong>Scoring use:</strong> {item.note}
                            </p>
                            {detail ? (
                              <>
                                <p>
                                  <strong>Evidence:</strong>{" "}
                                  {evidenceLabel(detail)}
                                  {detail.review_required
                                    ? " - expert review required"
                                    : ""}
                                </p>
                                {detail.source_title ? (
                                  <p>
                                    <strong>Source:</strong> {detail.source_title}
                                    {detail.source_publication_year
                                      ? ` (${detail.source_publication_year})`
                                      : ""}
                                  </p>
                                ) : null}
                                {detail.evidence_scope ? (
                                  <p>
                                    <strong>Scope:</strong> {detail.evidence_scope}
                                  </p>
                                ) : null}
                                {detail.source_value_note ? (
                                  <p>
                                    <strong>Source value:</strong>{" "}
                                    {detail.source_value_note}
                                  </p>
                                ) : null}
                                {detail.derivation_method ? (
                                  <p>
                                    <strong>Derivation:</strong>{" "}
                                    {detail.derivation_method}
                                  </p>
                                ) : null}
                                {detail.technologies?.length ? (
                                  <p>
                                    <strong>Technologies:</strong>{" "}
                                    {detail.technologies.join(", ")}
                                  </p>
                                ) : null}
                              </>
                            ) : (
                              <p>
                                Component-level source metadata is not available
                                for this input.
                              </p>
                            )}
                          </div>
                        </td>
                        <td>{formatValue(item.label, item.value)}</td>
                        <td>
                          {Number(item.weighted_value).toFixed(3)}
                        </td>
                        <td>
                          <span
                            className={`bc-evidence-badge ${
                              detail?.review_required
                                ? "review-required"
                                : "review-complete"
                            }`}
                          >
                            {detail?.review_required
                              ? "Review Required"
                              : evidenceLabel(detail)}
                          </span>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </section>

            <aside
              className="card bc-summary-card"
              style={{ padding: "26px", borderRadius: "18px" }}
            >
              <h3 style={{ marginTop: 0, color: "#1f2d3d" }}>Summary</h3>
              <div style={{ color: "#607185", lineHeight: 1.7 }}>
                <p>
                  Source: {result.source || "No Value Available"}
                </p>
                {result.dataset_version ? (
                  <p>Dataset Version: {result.dataset_version}</p>
                ) : null}
                {result.evidence_level ? (
                  <p>Evidence Level: {result.evidence_level}</p>
                ) : null}
                {result.provenance_counts
                  ? Object.entries(result.provenance_counts).map(
                      ([provenanceType, count]) => (
                        <p key={provenanceType}>
                          {PROVENANCE_LABELS[provenanceType] || provenanceType}:{" "}
                          {count}
                        </p>
                      )
                    )
                  : null}
                <p>
                  Expert Review:{" "}
                  {reviewRequiredCount > 0
                    ? `${reviewRequiredCount} default value${
                        reviewRequiredCount === 1 ? "" : "s"
                      } require review`
                    : "No mock defaults require review"}
                </p>
                {result.conversion_basis ? (
                  <p>{result.conversion_basis}</p>
                ) : null}
                {result.source_notes ? (
                  <p>{result.source_notes}</p>
                ) : null}
                <p>
                  If an uploaded B/C default table has a matching row for
                  {` ${selectedState} ${selectedYear}`}, it is used before
                  saved Scorecard Survey Responses for {getTopicLabel(TOPIC_KEYS.BENEFIT_COST)}.
                </p>
                <p>
                  Use the refresh button if you updated the answers in another
                  tab or window.
                </p>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
