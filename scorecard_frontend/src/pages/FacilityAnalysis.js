import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import DashboardCard from "../components/DashboardCard";
import { getTopicLabel, TOPIC_KEYS } from "../config/surveySchema";
import { apiUrl } from "../services/api";
import { getTopicAnswers, loadSurveyAnswers } from "../utils/surveyUpdates";

const YEAR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(2000 + index));
const STATE_OPTIONS = ["Texas", "New Jersey"];

export default function FacilityAnalysis() {
  const [allAnswers, setAllAnswers] = useState(() => loadSurveyAnswers());
  const [facilityScore, setFacilityScore] = useState(null);
  const [selectedYear, setSelectedYear] = useState("2023");
  const [selectedState, setSelectedState] = useState("Texas");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const facilityAnswers = useMemo(
    () => getTopicAnswers(allAnswers, TOPIC_KEYS.FACILITY),
    [allAnswers]
  );

  const answeredCount = Object.values(facilityAnswers).filter((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return String(value || "").trim() !== "";
  }).length;

  const activeInputCount = facilityScore?.breakdown
    ? facilityScore.breakdown.filter((item) => Number(item.weighted_value) > 0).length
    : answeredCount;

  const fetchScore = async (answers, stateName = selectedState, year = selectedYear) => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get(apiUrl("/facility/score"), {
        params: {
          state: stateName,
          year,
        },
      });
      if (response.data?.has_input) {
        setFacilityScore(response.data);
      } else {
        const fallbackResponse = await axios.post(
          apiUrl(`/survey-scores/${TOPIC_KEYS.FACILITY}`),
          { answers }
        );
        setFacilityScore({
          ...fallbackResponse.data,
          source: fallbackResponse.data?.has_input
            ? "Local Browser Answers"
            : response.data?.source || "No Value Available",
        });
      }
    } catch (requestError) {
      setFacilityScore(null);
      setError(
        requestError.response?.data?.error ||
          "Could not calculate the facility score."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScore(facilityAnswers, selectedState, selectedYear);
  }, [facilityAnswers, selectedState, selectedYear]);

  const handleRefresh = () => {
    const latestAnswers = loadSurveyAnswers();
    setAllAnswers(latestAnswers);
    fetchScore(
      getTopicAnswers(latestAnswers, TOPIC_KEYS.FACILITY),
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
            Facility Analysis
          </h1>
          <div style={{ color: "#607185", lineHeight: 1.6, maxWidth: "900px" }}>
            Review the current facility inputs and the score generated from the
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
          Loading facility score...
        </div>
      ) : error ? (
        <div className="card" style={{ padding: "28px", borderRadius: "18px", lineHeight: 1.7 }}>
          {error}
        </div>
      ) : !facilityScore?.has_input ? (
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
              title="Aggregate Facility Capacity"
              value={facilityScore.aggregate_capacity.toFixed(2)}
              color="#7c3aed"
            />
            <DashboardCard
              title="Unified Facility Score"
              value={facilityScore.unified_score.toFixed(3)}
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
                Facility Capacity Breakdown
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table className="preview-table" style={{ minWidth: "860px" }}>
                  <thead>
                    <tr>
                      <th>Facility Component</th>
                      <th>Reported Value</th>
                      <th>Unified Score</th>
                      <th>Method Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facilityScore.breakdown.map((item) => (
                      <tr key={item.label}>
                        <td className="kw-cell">{item.label}</td>
                        <td>{item.value}</td>
                        <td>{Number(item.weighted_value).toFixed(2)}</td>
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
                  Source: {facilityScore.source || "No Value Available"}
                </p>
                {facilityScore.dataset_version ? (
                  <p>Dataset Version: {facilityScore.dataset_version}</p>
                ) : null}
                {facilityScore.evidence_level ? (
                  <p>Evidence Level: {facilityScore.evidence_level}</p>
                ) : null}
                {facilityScore.source_notes ? (
                  <p>{facilityScore.source_notes}</p>
                ) : null}
                <p>
                  If an uploaded facility default table has a matching row for
                  {` ${selectedState} ${selectedYear}`}, it is used before
                  saved Survey-Based Updates for {getTopicLabel(TOPIC_KEYS.FACILITY)}.
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
