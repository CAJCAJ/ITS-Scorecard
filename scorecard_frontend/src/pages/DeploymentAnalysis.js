import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

import { apiUrl } from "../services/api";
import { getSessionState } from "../utils/auth";

const YEARS = Array.from({ length: 24 }, (_, index) => String(2000 + index));

export default function DeploymentAnalysis() {
  const [selectedYear, setSelectedYear] = useState("2023");
  const [selectedState] = useState(() => getSessionState() || "New Jersey");
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

  const agencyRows = useMemo(() => {
    const byAgency = new Map();
    agencyWeights.forEach((item) => {
      const name = item.agency_name || "Unknown Agency";
      const agencyWeight = Number(item.agency_weight);
      const contributionScore = Number(item.contribution_score);
      if (!Number.isFinite(agencyWeight)) return;

      const existing = byAgency.get(name) || {
        agency_name: name,
        weighted_sum: 0,
        contribution_total: 0,
        fallback_sum: 0,
        fallback_count: 0,
      };

      if (Number.isFinite(contributionScore) && contributionScore > 0) {
        existing.weighted_sum += agencyWeight * contributionScore;
        existing.contribution_total += contributionScore;
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
      }))
      .sort((a, b) => b.agency_weight - a.agency_weight);
  }, [agencyWeights]);

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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(360px, 0.75fr)",
          gap: "24px",
          alignItems: "stretch",
        }}
      >
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
          <h3 style={{ marginTop: 0 }}>Agency Weights</h3>
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
                  <col style={{ width: "300px" }} />
                  <col style={{ width: "120px" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Agency</th>
                    <th>Agency Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {agencyRows.map((item) => (
                    <tr key={item.agency_name}>
                      <td className="kw-cell">{item.agency_name}</td>
                      <td>{Number(item.agency_weight).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
