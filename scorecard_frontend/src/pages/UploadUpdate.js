import React, { useState, useEffect, useRef } from 'react';
import {
  FaSearch,
  FaSyncAlt,
  FaTrash,
  FaFileAlt,
  FaFilePdf,
  FaFileExcel,
} from 'react-icons/fa';
import axios from 'axios';
import { apiUrl } from '../services/api';

const DOC_TYPES = [
  {
    key: 'benefit_cost',
    label: 'ITS Benefit and Cost Data',
    accepts: '.xlsx,.csv',
    acceptsLabel: 'Upload benefit and cost tables in XLSX or CSV format',
    Icon: FaFileExcel,
  },
  {
    key: 'survey',
    label: 'ITS Deployment Coverage Data',
    accepts: '.xlsx,.csv',
    acceptsLabel: 'Upload ITS survey workbooks like YYYY_AM_data.xlsx, YYYY_TM_data.xlsx, or YYYY_FM_data.xlsx',
    Icon: FaFileExcel,
  },
  {
    key: 'legislation',
    label: 'ITS Policy and Legislation Data',
    accepts: '.xlsx,.csv,.pdf,.docx',
    acceptsLabel: 'Upload policy tables or supporting files in XLSX, CSV, PDF, or DOCX format',
    Icon: FaFileExcel,
  },
  {
    key: 'planning',
    label: 'ITS Project Planning Documents',
    accepts: '.pdf,.docx,.xlsx',
    acceptsLabel: 'Upload project planning documents in PDF, DOCX, or XLSX format',
    Icon: FaFilePdf,
  },
  {
    key: 'facility',
    label: 'ITS Facility Documents',
    accepts: '.pdf,.docx,.xlsx',
    acceptsLabel: 'Upload facility reference documents in PDF, DOCX, or XLSX format',
    Icon: FaFileAlt,
  },
];

export default function UploadUpdate() {
  const [documents, setDocuments] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [uploading, setUploading] = useState({});
  const [dragOver, setDragOver] = useState({});
  const [deletingId, setDeletingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const fileInputRefs = useRef({});

  const showError = (msg) => {
    setSuccessMsg('');
    setErrorMsg(msg);
  };

  const showSuccess = (msg) => {
    setErrorMsg('');
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const fetchDocuments = async () => {
    try {
      const res = await axios.get(apiUrl('/documents'));
      setDocuments(res.data);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Could not reach backend. Make sure Flask is running on port 5000.';
      showError(msg);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleUpload = async (docType, file) => {
    if (!file) return;
    setUploading(prev => ({ ...prev, [docType]: true }));
    setErrorMsg('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('doc_type', docType);
    try {
      await axios.post(apiUrl('/documents/upload'), formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showSuccess(`"${file.name}" uploaded successfully.`);
      await fetchDocuments();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Upload failed. Check that the backend is running and the Supabase tables exist.';
      showError(msg);
    } finally {
      setUploading(prev => ({ ...prev, [docType]: false }));
      if (fileInputRefs.current[docType]) {
        fileInputRefs.current[docType].value = '';
      }
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await axios.delete(apiUrl(`/documents/${id}`));
      setDocuments(prev => prev.filter(d => d.id !== id));
      showSuccess('Document moved to trash. It will be permanently deleted in 30 days.');
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Delete failed.';
      showError(msg);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDrop = (docType, e) => {
    e.preventDefault();
    setDragOver(prev => ({ ...prev, [docType]: false }));
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(docType, file);
  };

  const filteredDocs = documents.filter(d => {
    const matchesSearch =
      search === '' ||
      d.table_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.category?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filterCategory === 'all' || d.doc_type === filterCategory;
    return matchesSearch && matchesFilter;
  });

  const totalDocs = documents.length;

  return (
    <div className="upload-page">

      {/* ── Status banners ── */}
      {errorMsg && (
        <div className="upload-banner upload-banner-error">
          <strong>Error:</strong> {errorMsg}
          <button className="upload-banner-close" onClick={() => setErrorMsg('')}>✕</button>
        </div>
      )}
      {successMsg && (
        <div className="upload-banner upload-banner-success">
          {successMsg}
          <button className="upload-banner-close" onClick={() => setSuccessMsg('')}>✕</button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="upload-header">
        <div>
          <h1>Update Agency Documents</h1>
          <p>Upload &amp; manage important documents to keep your data updated</p>
        </div>
        <div className="upload-header-stats">
          <span className="upload-stat-badge">{totalDocs} document{totalDocs !== 1 ? 's' : ''} uploaded</span>
        </div>
      </div>

      <div className="upload-layout">
        {/* ══════════════ LEFT: Upload Cards ══════════════ */}
        <div className="upload-left">
          <h2 className="upload-section-title">Upload New Documents</h2>

          <div className="upload-cards">
            {DOC_TYPES.map(({ key, label, accepts, acceptsLabel, Icon }) => (
              <div
                key={key}
                className={`upload-card${dragOver[key] ? ' drag-over' : ''}`}
                onDragOver={e => {
                  e.preventDefault();
                  setDragOver(p => ({ ...p, [key]: true }));
                }}
                onDragLeave={() =>
                  setDragOver(p => ({ ...p, [key]: false }))
                }
                onDrop={e => handleDrop(key, e)}
                onClick={() => fileInputRefs.current[key]?.click()}
              >
                <input
                  type="file"
                  accept={accepts}
                  ref={el => (fileInputRefs.current[key] = el)}
                  style={{ display: 'none' }}
                  onChange={e => handleUpload(key, e.target.files[0])}
                />
                <div className="upload-card-body">
                  {uploading[key] ? (
                    <div className="upload-spinner-wrap">
                      <div className="upload-spinner" />
                      <span>Uploading…</span>
                    </div>
                  ) : (
                    <>
                      <Icon className="upload-icon" />
                      <p className="upload-card-label">{label}</p>
                      <p className="upload-card-hint">
                        Drag &amp; drop files here or{' '}
                        <span className="browse-link">Browse</span>
                      </p>
                      <p className="upload-card-formats">{acceptsLabel}</p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ══════════════ RIGHT: Preview ══════════════ */}
        <div className="upload-right">
          <div className="preview-header">
            <h2 className="upload-section-title">Preview Extracted Data</h2>
            <button
              className="btn btn-outline btn-small refresh-btn"
              onClick={fetchDocuments}
            >
              <FaSyncAlt /> Refresh Data
            </button>
          </div>

          {/* Controls */}
          <div className="preview-controls">
            <div className="preview-search-wrap">
              <FaSearch className="preview-search-icon" />
              <input
                className="preview-search-input"
                type="text"
                placeholder="Search extracted data…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="preview-filter-select"
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
            >
              <option value="all">Filter by Category</option>
              {DOC_TYPES.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Sections */}
          <div className="preview-sections">
            {filteredDocs.length === 0 ? (
              <div className="preview-empty">
                No documents uploaded yet. Upload files to see table status here.
              </div>
            ) : (
              <div className="preview-section">
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>Table Name</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocs.map(doc => (
                      <tr key={doc.id}>
                        <td className="kw-cell">{doc.table_name || doc.original_name}</td>
                        <td className="source-cell">{doc.category || doc.doc_type}</td>
                        <td>
                          <span className="status-badge extracted">
                            {doc.status || 'Uploaded'}
                          </span>
                        </td>
                        <td className="action-cell">
                          <button
                            className="delete-doc-btn"
                            title="Delete document"
                            disabled={deletingId === doc.id}
                            onClick={() => handleDelete(doc.id)}
                          >
                            <FaTrash />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
