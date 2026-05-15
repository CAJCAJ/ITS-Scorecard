import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  FaBookOpen,
  FaCheckCircle,
  FaExternalLinkAlt,
  FaRegSave,
  FaSearch,
  FaTimes,
} from "react-icons/fa";
import { apiUrl } from "../services/api";

const YEAR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(2000 + index));
const STATE_OPTIONS = ["Texas", "New Jersey"];
const JUDGMENT_OPTIONS = [
  "Reasonable",
  "Too High",
  "Too Low",
  "Insufficient Evidence",
  "Needs Method Revision",
];
const CONFIDENCE_OPTIONS = ["Low", "Medium", "High"];
const TECHNICAL_REPORT_URL = `${process.env.PUBLIC_URL || ""}/ITS%20Scorecard%20Technical%20Report%20Reference.pdf`;

function emptyForm() {
  return {
    id: "",
    reviewer_name: "",
    review_year: "2023",
    state: "Texas",
    domain_key: "",
    dataset_version: "",
    overall_comment: "",
    status: "draft",
  };
}

function fieldStyle() {
  return {
    width: "100%",
    padding: "12px 14px",
    border: "1px solid #d5dfec",
    borderRadius: "8px",
    background: "#fff",
    fontSize: "0.98rem",
    boxSizing: "border-box",
  };
}

export default function ExpertPanelReview() {
  const [domains, setDomains] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    axios
      .get(apiUrl("/expert-review/subaspects"))
      .then((response) => setDomains(response.data.domains || []))
      .catch(() => setError("Could not load review domains."));
  }, []);

  useEffect(() => {
    if (!showReport) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setShowReport(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showReport]);

  const canLoad = Boolean(form.review_year && form.state && form.domain_key);
  const changedCount = useMemo(
    () =>
      items.filter(
        (item) =>
          item.expert_judgment ||
          item.suggested_value ||
          item.confidence_level ||
          item.comment ||
          item.recommend_method_change
      ).length,
    [items]
  );

  const updateForm = (field, value) => {
    setMessage("");
    setError("");
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateItem = (index, field, value) => {
    setMessage("");
    setError("");
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  };

  const fetchCurrentValues = async () => {
    const response = await axios.get(apiUrl("/expert-review/current-values"), {
      params: {
        year: form.review_year,
        state: form.state,
        domain_key: form.domain_key,
      },
    });
    return response.data.items || [];
  };

  const mergeCurrentValues = (reviewItems, currentValueItems) => {
    const currentByKey = Object.fromEntries(
      currentValueItems.map((item) => [item.subaspect_key, item])
    );
    return reviewItems.map((item) => {
      const currentValueItem = currentByKey[item.subaspect_key];
      if (!currentValueItem) return item;
      return {
        ...item,
        current_value: currentValueItem.current_value || "",
        unified_score: currentValueItem.unified_score || "",
        source_basis: currentValueItem.source_basis || "No Value Available",
      };
    });
  };

  const loadReview = async () => {
    if (!canLoad) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const [response, currentValues] = await Promise.all([
        axios.get(apiUrl("/expert-review/sessions/latest"), {
          params: {
            year: form.review_year,
            state: form.state,
            domain_key: form.domain_key,
          },
        }),
        fetchCurrentValues(),
      ]);
      const session = response.data.session;
      if (session) {
        setForm((current) => ({
          ...current,
          id: session.id || "",
          reviewer_name: session.reviewer_name || "",
          dataset_version: session.dataset_version || "",
          overall_comment: session.overall_comment || "",
          status: session.status || "draft",
        }));
        setItems(mergeCurrentValues(session.items || response.data.items || [], currentValues));
      } else {
        setForm((current) => ({
          ...current,
          id: "",
          reviewer_name: "",
          dataset_version: "",
          overall_comment: "",
          status: "draft",
        }));
        setItems(mergeCurrentValues(response.data.items || [], currentValues));
      }
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Could not load the expert review record."
      );
    } finally {
      setLoading(false);
    }
  };

  const refreshCurrentValues = async () => {
    if (!canLoad) return;
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const currentValues = await fetchCurrentValues();
      setItems((current) => mergeCurrentValues(current.length ? current : currentValues, currentValues));
      setMessage("Current values refreshed.");
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Could not refresh current review values."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canLoad) {
      loadReview();
    } else {
      setItems([]);
    }
  }, [form.review_year, form.state, form.domain_key]);

  const saveReview = async (status) => {
    if (!canLoad) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.post(apiUrl("/expert-review/sessions"), {
        ...form,
        status,
        items,
      });
      const session = response.data.session;
      setForm((current) => ({
        ...current,
        id: session.id,
        status: session.status,
      }));
      setItems(mergeCurrentValues(session.items || [], items));
      setMessage(status === "submitted" ? "Review submitted." : "Draft saved.");
    } catch (requestError) {
      setError(
        requestError.response?.data?.error || "Could not save the expert review."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-container" style={{ maxWidth: "1500px" }}>
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
            Expert Panel Review
          </h1>
          <div style={{ color: "#607185", lineHeight: 1.6, maxWidth: "920px" }}>
            Review current subaspect values, record expert judgment, and submit
            recommendations for later score calibration.
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={loadReview}
            disabled={!canLoad || loading}
          >
            <FaSearch style={{ marginRight: "8px" }} />
            Load
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={refreshCurrentValues}
            disabled={!canLoad || loading}
          >
            Refresh Current Values
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => saveReview("draft")}
            disabled={!canLoad || saving}
          >
            <FaRegSave style={{ marginRight: "8px" }} />
            Save Draft
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => saveReview("submitted")}
            disabled={!canLoad || saving}
          >
            <FaCheckCircle style={{ marginRight: "8px" }} />
            Submit Review
          </button>
        </div>
      </div>

      <section className="card" style={{ padding: "24px", marginBottom: "24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(160px, 1fr))",
            gap: "16px",
            alignItems: "end",
          }}
        >
          <label>
            <div style={{ fontWeight: 700, marginBottom: "8px" }}>Year</div>
            <select
              value={form.review_year}
              onChange={(event) => updateForm("review_year", event.target.value)}
              style={fieldStyle()}
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
              value={form.state}
              onChange={(event) => updateForm("state", event.target.value)}
              style={fieldStyle()}
            >
              {STATE_OPTIONS.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div style={{ fontWeight: 700, marginBottom: "8px" }}>Score Domain</div>
            <select
              value={form.domain_key}
              onChange={(event) => updateForm("domain_key", event.target.value)}
              style={fieldStyle()}
            >
              <option value="">Select domain</option>
              {domains.map((domain) => (
                <option key={domain.key} value={domain.key}>
                  {domain.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div style={{ fontWeight: 700, marginBottom: "8px" }}>Reviewer</div>
            <input
              value={form.reviewer_name}
              onChange={(event) => updateForm("reviewer_name", event.target.value)}
              placeholder="Reviewer name"
              style={fieldStyle()}
            />
          </label>

          <label>
            <div style={{ fontWeight: 700, marginBottom: "8px" }}>Dataset Version</div>
            <input
              value={form.dataset_version}
              onChange={(event) => updateForm("dataset_version", event.target.value)}
              placeholder="Optional"
              style={fieldStyle()}
            />
          </label>
        </div>
      </section>

      {error && (
        <div className="card" style={{ padding: "18px", marginBottom: "18px", color: "#b42318" }}>
          {error}
        </div>
      )}
      {message && (
        <div className="card" style={{ padding: "18px", marginBottom: "18px", color: "#067647" }}>
          {message}
        </div>
      )}

      <section className="card" style={{ padding: "24px", marginBottom: "24px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "16px",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h2 style={{ margin: 0, color: "#1f2d3d" }}>Subaspect Review</h2>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setShowReport(true)}
            >
              <FaBookOpen style={{ marginRight: "8px" }} />
              Technical Report
            </button>
            <div style={{ color: "#607185", fontWeight: 700 }}>
              Reviewed Rows: {changedCount} / {items.length}
            </div>
          </div>
        </div>

        {!form.domain_key ? (
          <div style={{ color: "#607185", lineHeight: 1.7 }}>
            Select a score domain to load review rows.
          </div>
        ) : loading ? (
          <div style={{ color: "#607185", lineHeight: 1.7 }}>Loading review rows...</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="preview-table" style={{ minWidth: "1620px" }}>
              <thead>
                <tr>
                  <th style={{ width: "260px" }}>Subaspect</th>
                  <th style={{ width: "150px" }}>Current Value</th>
                  <th style={{ width: "140px" }}>Unified Score</th>
                  <th style={{ width: "210px" }}>Source</th>
                  <th style={{ width: "190px" }}>Judgment</th>
                  <th style={{ width: "150px" }}>Suggested Value</th>
                  <th style={{ width: "130px" }}>Confidence</th>
                  <th>Comment</th>
                  <th style={{ width: "130px" }}>Method Change</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.subaspect_key || index}>
                    <td className="kw-cell">{item.subaspect_label}</td>
                    <td>
                      <input
                        value={item.current_value || ""}
                        readOnly
                        style={{ ...fieldStyle(), background: "#f8fafc" }}
                      />
                    </td>
                    <td>
                      <input
                        value={item.unified_score || ""}
                        readOnly
                        style={{ ...fieldStyle(), background: "#f8fafc" }}
                      />
                    </td>
                    <td className="source-cell">{item.source_basis || "No Value Available"}</td>
                    <td>
                      <select
                        value={item.expert_judgment || ""}
                        onChange={(event) =>
                          updateItem(index, "expert_judgment", event.target.value)
                        }
                        style={fieldStyle()}
                      >
                        <option value="">Select</option>
                        {JUDGMENT_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        value={item.suggested_value || ""}
                        onChange={(event) =>
                          updateItem(index, "suggested_value", event.target.value)
                        }
                        style={fieldStyle()}
                      />
                    </td>
                    <td>
                      <select
                        value={item.confidence_level || ""}
                        onChange={(event) =>
                          updateItem(index, "confidence_level", event.target.value)
                        }
                        style={fieldStyle()}
                      >
                        <option value="">Select</option>
                        {CONFIDENCE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <textarea
                        rows={2}
                        value={item.comment || ""}
                        onChange={(event) =>
                          updateItem(index, "comment", event.target.value)
                        }
                        style={{ ...fieldStyle(), resize: "vertical", minHeight: "74px" }}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(item.recommend_method_change)}
                        onChange={(event) =>
                          updateItem(
                            index,
                            "recommend_method_change",
                            event.target.checked
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" style={{ padding: "24px" }}>
        <h2 style={{ marginTop: 0, color: "#1f2d3d" }}>Overall Recommendation</h2>
        <textarea
          rows={5}
          value={form.overall_comment}
          onChange={(event) => updateForm("overall_comment", event.target.value)}
          placeholder="Add overall comments, rating-system suggestions, or recommended follow-up actions."
          style={{ ...fieldStyle(), resize: "vertical", minHeight: "140px" }}
        />
      </section>

      {showReport && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="ITS Scorecard technical report"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15, 23, 42, 0.68)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            style={{
              width: "min(1180px, 96vw)",
              height: "min(860px, 92vh)",
              background: "#fff",
              borderRadius: "8px",
              boxShadow: "0 24px 70px rgba(0,0,0,0.32)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                padding: "14px 18px",
                borderBottom: "1px solid #d8e0ea",
                background: "#f8fafc",
              }}
            >
              <div style={{ fontWeight: 800, color: "#1f2d3d" }}>
                ITS Scorecard Technical Report Reference
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <a
                  className="btn btn-outline"
                  href={TECHNICAL_REPORT_URL}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: "none" }}
                >
                  <FaExternalLinkAlt style={{ marginRight: "8px" }} />
                  Open PDF
                </a>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowReport(false)}
                  aria-label="Close technical report"
                >
                  <FaTimes />
                </button>
              </div>
            </div>
            <iframe
              title="ITS Scorecard Technical Report Reference"
              src={TECHNICAL_REPORT_URL}
              style={{
                border: 0,
                width: "100%",
                flex: 1,
                background: "#fff",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
