import React from "react";

export default function BlankPanel({ title }) {
  return (
    <div className="dashboard-container">
      <h1 className="dashboard-title">{title}</h1>
    </div>
  );
}
