import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

import { apiUrl } from "../services/api";

const YEARS = Array.from({ length: 24 }, (_, index) => String(2000 + index));
const STATES = ["New Jersey", "Texas"];

export default function DeploymentAnalysis() {
  const [selectedYear, setSelectedYear] = useState("2023");
  const [selectedState, setSelectedState] = useState("New Jersey");
  const [items, setItems] = useState([]);
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
        setMessage(response.data.message || "");
      } catch (error) {
        if (cancelled) return;
        setItems([]);
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
          onChange={(event) => setSelectedState(event.target.value)}
          style={{
            minWidth: "220px",
            padding: "14px 18px",
            fontSize: "1.08rem",
            fontWeight: 600,
            borderRadius: "10px",
          }}
        >
          {STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: "24px",
          alignItems: "stretch",
        }}
      >
        <section className="card" style={{ padding: "24px" }}>
          <h3 style={{ marginTop: 0 }}>{heading}</h3>

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
                  <col style={{ width: "130px" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Default Value</th>
                    <th>Scored Agencies</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.domain_name}>
                      <td className="kw-cell" style={{ whiteSpace: "nowrap" }}>
                        {item.domain_name}
                      </td>
                      <td>{Number(item.default_value).toFixed(3)}</td>
                      <td>{item.scored_agency_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card" style={{ padding: "24px" }}>
          <h3 style={{ marginTop: 0 }}>Additional Deployment Views</h3>
        </section>
      </div>
    </div>
  );
}
