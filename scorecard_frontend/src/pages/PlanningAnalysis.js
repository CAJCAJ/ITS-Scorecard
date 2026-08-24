import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import DashboardCard from "../components/DashboardCard";
import { getTopicLabel, TOPIC_KEYS } from "../config/surveySchema";
import { apiUrl } from "../services/api";
import { getTopicAnswers, loadSurveyAnswers } from "../utils/surveyUpdates";
import { getSessionState } from "../utils/auth";
import "./PlanningAnalysis.css";

const YEAR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(2000 + index));

function formatValue(label, value) {
  if (label === "Award Funding") {
    return value > 0 ? `$${Number(value).toLocaleString()}` : 0;
  }
  return value;
}

function formatMoney(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "$0";
  return `$${number.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function PlanningAnalysis() {
  const [allAnswers, setAllAnswers] = useState(() => loadSurveyAnswers());
  const [planningScore, setPlanningScore] = useState(null);
  const [selectedYear, setSelectedYear] = useState("2023");
  const [selectedState] = useState(() => getSessionState() || "Texas");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const planningAnswers = useMemo(
    () => getTopicAnswers(allAnswers, TOPIC_KEYS.PROJECT_PLANNING),
    [allAnswers]
  );

  const answeredCount = Object.values(planningAnswers).filter((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return String(value || "").trim() !== "";
  }).length;

  const awardSummary = useMemo(() => {
    const details = planningScore?.award_details || [];
    const totalFunding = details.reduce(
      (sum, award) => sum + Number(award.amount || 0),
      0
    );
    return {
      count: details.length,
      totalFunding,
    };
  }, [planningScore]);

  const fetchScore = async (answers, stateName = selectedState, year = selectedYear) => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get(apiUrl("/planning/score"), {
        params: {
          state: stateName,
          year,
        },
      });
      if (response.data?.has_input) {
        setPlanningScore(response.data);
      } else {
        const fallbackResponse = await axios.post(
          apiUrl(`/survey-scores/${TOPIC_KEYS.PROJECT_PLANNING}`),
          { answers }
        );
        setPlanningScore({
          ...fallbackResponse.data,
          source: fallbackResponse.data?.has_input
            ? "Local Browser Answers"
            : response.data?.source || "No Value Available",
        });
      }
    } catch (requestError) {
      setPlanningScore(null);
      setError(
        requestError.response?.data?.error ||
          "Could not calculate the planning score."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScore(planningAnswers, selectedState, selectedYear);
  }, [planningAnswers, selectedState, selectedYear]);

  const handleRefresh = () => {
    const latestAnswers = loadSurveyAnswers();
    setAllAnswers(latestAnswers);
    fetchScore(
      getTopicAnswers(latestAnswers, TOPIC_KEYS.PROJECT_PLANNING),
      selectedState,
      selectedYear
    );
  };

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
            Planning Analysis
          </h1>
          <div style={{ color: "#607185", lineHeight: 1.6, maxWidth: "900px" }}>
            Review the current planning inputs and the score generated from the
            saved answers.
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
          Loading planning score...
        </div>
      ) : error ? (
        <div className="card" style={{ padding: "28px", borderRadius: "18px", lineHeight: 1.7 }}>
          {error}
        </div>
      ) : !planningScore?.has_input ? (
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
              title="Answered Inputs"
              value={answeredCount}
              color="#0057ff"
            />
            <DashboardCard
              title="Award Score"
              value={planningScore.award_score.toFixed(3)}
              color="#7c3aed"
            />
            <DashboardCard
              title="Planning Score"
              value={planningScore.planning_score.toFixed(3)}
              color="#f59e0b"
            />
            <DashboardCard
              title="Unified Planning Score"
              value={planningScore.unified_score.toFixed(3)}
              color="#10b981"
            />
          </div>

          <div
            className="analysis-summary-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)",
              gap: "24px",
              alignItems: "start",
            }}
          >
            <section className="card" style={{ padding: "26px", borderRadius: "18px" }}>
              <h3 style={{ marginTop: 0, color: "#1f2d3d" }}>
                Planning Score Breakdown
              </h3>
              <div className="planning-table-wrap">
                <table className="planning-breakdown-table">
                  <colgroup>
                    <col style={{ width: "44%" }} />
                    <col style={{ width: "28%" }} />
                    <col style={{ width: "28%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Planning Component</th>
                      <th>Reported Value</th>
                      <th>Unified Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planningScore.breakdown.map((item) => (
                      <tr key={item.label}>
                        <td className="planning-component-cell">
                          <span className="planning-component-name">
                            {item.label}
                          </span>
                          <div className="planning-method-tooltip">
                            <h4>{item.label}</h4>
                            <p>{item.note}</p>
                          </div>
                        </td>
                        <td>{formatValue(item.label, item.value)}</td>
                        <td>{Number(item.weighted_value).toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="card" style={{ padding: "26px", borderRadius: "18px" }}>
              <h3 style={{ marginTop: 0, color: "#1f2d3d" }}>Summary</h3>
              <div style={{ color: "#607185", lineHeight: 1.7 }}>
                <p>
                  Source: {planningScore.source || "No Value Available"}
                </p>
                {planningScore.dataset_version ? (
                  <p>Dataset Version: {planningScore.dataset_version}</p>
                ) : null}
                {planningScore.evidence_level ? (
                  <p>Evidence Level: {planningScore.evidence_level}</p>
                ) : null}
                {planningScore.source_notes ? (
                  <p>{planningScore.source_notes}</p>
                ) : null}
                <p>
                  If an uploaded planning default table has a matching row for
                  {` ${selectedState} ${selectedYear}`}, it is used before
                  saved Scorecard Survey Responses for {getTopicLabel(TOPIC_KEYS.PROJECT_PLANNING)}.
                </p>
                <p>
                  Use the refresh button if you updated the answers in another
                  tab or window.
                </p>
              </div>
            </aside>
          </div>

          <section className="card planning-award-card">
            <div className="planning-award-header">
              <div>
                <h3>Award Funding Details for {selectedState} ({selectedYear})</h3>
                <p>
                  {awardSummary.count
                    ? `${awardSummary.count} award rows used for this year's planning score.`
                    : "No award rows used for this year's planning score."}
                </p>
              </div>
              <div className="planning-award-total">
                <span>Total Award Funding</span>
                <strong>{formatMoney(awardSummary.totalFunding)}</strong>
              </div>
            </div>
            {!planningScore.award_details?.length ? (
              <p>No award funding details available for this year.</p>
            ) : (
              <div className="planning-table-wrap">
                <table className="planning-award-table">
                  <colgroup>
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "26%" }} />
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "9%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Funding Name</th>
                      <th>Awarded Project</th>
                      <th>Awarded Agency</th>
                      <th>Funding Level</th>
                      <th>Amount</th>
                      <th>Duration</th>
                      <th>Unified Score Contribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planningScore.award_details.map((award, index) => (
                      <tr key={`${award.awarded_project || award.funding_name}-${index}`}>
                        <td>{award.funding_name || award.funding_title || "N/A"}</td>
                        <td>{award.awarded_project || award.funding_title || "N/A"}</td>
                        <td>{award.awarded_agency || award.award_agency || "N/A"}</td>
                        <td>{award.funding_level || "N/A"}</td>
                        <td>{formatMoney(award.amount)}</td>
                        <td>{award.duration || "N/A"}</td>
                        <td>
                          {Number(award.unified_score_contribution || 0).toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
