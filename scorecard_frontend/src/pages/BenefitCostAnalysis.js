import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import DashboardCard from "../components/DashboardCard";
import { getTopicLabel, TOPIC_KEYS } from "../config/surveySchema";
import { apiUrl } from "../services/api";
import { getTopicAnswers, loadSurveyAnswers } from "../utils/surveyUpdates";

const YEAR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(2000 + index));
const STATE_OPTIONS = ["Texas", "New Jersey"];

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
  const [selectedYear, setSelectedYear] = useState("2023");
  const [selectedState, setSelectedState] = useState("Texas");
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
              onChange={(event) => setSelectedState(event.target.value)}
              style={{
                padding: "12px 14px",
                borderRadius: "8px",
                border: "1px solid #cfd8e3",
                fontSize: "1rem",
                background: "#fff",
              }}
            >
              {STATE_OPTIONS.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
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
                      <th>Unified Score</th>
                      <th>Method Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.breakdown.map((item) => (
                      <tr key={item.label}>
                        <td className="kw-cell">{item.label}</td>
                        <td>{formatValue(item.label, item.value)}</td>
                        <td>
                          {Number(item.weighted_value).toFixed(3)}
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
                  Source: {result.source || "No Value Available"}
                </p>
                {result.dataset_version ? (
                  <p>Dataset Version: {result.dataset_version}</p>
                ) : null}
                {result.evidence_level ? (
                  <p>Evidence Level: {result.evidence_level}</p>
                ) : null}
                {result.conversion_basis ? (
                  <p>{result.conversion_basis}</p>
                ) : null}
                {result.source_notes ? (
                  <p>{result.source_notes}</p>
                ) : null}
                <p>
                  If an uploaded B/C default table has a matching row for
                  {` ${selectedState} ${selectedYear}`}, it is used before
                  saved Survey-Based Updates for {getTopicLabel(TOPIC_KEYS.BENEFIT_COST)}.
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
