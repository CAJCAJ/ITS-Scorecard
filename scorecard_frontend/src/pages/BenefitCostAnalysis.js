import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import DashboardCard from "../components/DashboardCard";
import { getTopicLabel, TOPIC_KEYS } from "../config/surveySchema";
import { apiUrl } from "../services/api";
import { getTopicAnswers, loadSurveyAnswers } from "../utils/surveyUpdates";

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

export default function BenefitCostAnalysis() {
  const [allAnswers, setAllAnswers] = useState(() => loadSurveyAnswers());
  const [result, setResult] = useState(null);
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

  const fetchScore = async (answers) => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.post(apiUrl("/benefit-cost/score"), {
        answers,
      });
      setResult(response.data);
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
    fetchScore(bcAnswers);
  }, [bcAnswers]);

  const handleRefresh = () => {
    const latestAnswers = loadSurveyAnswers();
    setAllAnswers(latestAnswers);
    fetchScore(getTopicAnswers(latestAnswers, TOPIC_KEYS.BENEFIT_COST));
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

        <button type="button" className="btn btn-outline" onClick={handleRefresh}>
          Refresh Inputs
        </button>
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
              title="Answered Inputs"
              value={answeredCount}
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
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)",
              gap: "24px",
              alignItems: "start",
            }}
          >
            <section className="card" style={{ padding: "26px", borderRadius: "18px" }}>
              <h3 style={{ marginTop: 0, color: "#1f2d3d" }}>
                Benefit and Cost Breakdown
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table className="preview-table" style={{ minWidth: "860px" }}>
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th>Reported Value</th>
                      <th>Scoring Contribution</th>
                      <th>Method Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.breakdown.map((item) => (
                      <tr key={item.label}>
                        <td className="kw-cell">{item.label}</td>
                        <td>{formatValue(item.label, item.value)}</td>
                        <td>
                          {item.label.includes("Benefit") || item.label.includes("Cost")
                            ? formatMoney(item.weighted_value)
                            : Number(item.weighted_value).toFixed(0)}
                        </td>
                        <td className="source-cell">{item.note}</td>
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
                  The score shown here is based on the answers currently saved
                  under Survey-Based Updates for {getTopicLabel(TOPIC_KEYS.BENEFIT_COST)}.
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
