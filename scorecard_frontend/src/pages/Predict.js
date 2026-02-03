import React, { useState, useEffect, useRef } from "react";
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const Predict = () => {
  const [activeChart, setActiveChart] = useState('budget');
  const budgetChartRef = useRef(null);
  const techChartRef = useRef(null);
  const chartInstances = useRef({});

  useEffect(() => {
    Object.values(chartInstances.current).forEach(chart => chart?.destroy());
    chartInstances.current = {};

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: 'white' } }
      },
      scales: {
        x: {
          ticks: { color: 'rgba(255, 255, 255, 0.8)' },
          grid: { color: 'rgba(255, 255, 255, 0.1)' }
        },
        y: {
          ticks: { color: 'rgba(255, 255, 255, 0.8)' },
          grid: { color: 'rgba(255, 255, 255, 0.1)' }
        }
      },
      interaction: { intersect: false, mode: 'index' }
    };

    if (budgetChartRef.current) {
      const ctx = budgetChartRef.current.getContext('2d');
      chartInstances.current.budget = new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['2020', '2021', '2022', '2023', '2024', '2025', '2026'],
          datasets: [
            {
              label: 'Planned Budget',
              data: [850000, 920000, 980000, 1050000, 1150000, 1250000, 1350000],
              borderColor: '#8b5cf6',
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
              borderWidth: 3,
              tension: 0.3
            },
            {
              label: 'Actual Spending',
              data: [820000, 950000, 975000, 1080000, null, null, null],
              borderColor: '#06d6a0',
              backgroundColor: 'rgba(6, 214, 160, 0.1)',
              borderWidth: 3,
              tension: 0.3
            },
            {
              label: 'Projected Spending',
              data: [null, null, null, null, 1120000, 1280000, 1420000],
              borderColor: '#ffd60a',
              backgroundColor: 'rgba(255, 214, 10, 0.1)',
              borderWidth: 3,
              borderDash: [5, 5],
              tension: 0.3
            }
          ]
        },
        options: {
          ...chartOptions,
          scales: {
            ...chartOptions.scales,
            y: {
              ...chartOptions.scales.y,
              ticks: {
                color: 'rgba(255, 255, 255, 0.8)',
                callback: function(value) {
                  return '$' + (value / 1000000).toFixed(1) + 'M';
                }
              }
            }
          }
        }
      });
    }

    if (techChartRef.current) {
      const ctx = techChartRef.current.getContext('2d');
      chartInstances.current.tech = new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['2020', '2021', '2022', '2023', '2024', '2025', '2026'],
          datasets: [
            {
              label: 'AI/ML Index',
              data: [45, 58, 72, 85, 92, 98, 105],
              borderColor: '#ff6b6b',
              backgroundColor: 'rgba(255, 107, 107, 0.1)',
              borderWidth: 3,
              tension: 0.3
            },
            {
              label: 'Blockchain Index',
              data: [25, 35, 28, 32, 38, 45, 52],
              borderColor: '#4ecdc4',
              backgroundColor: 'rgba(78, 205, 196, 0.1)',
              borderWidth: 3,
              tension: 0.3
            },
            {
              label: 'Quantum Computing',
              data: [8, 12, 18, 25, 35, 48, 62],
              borderColor: '#45b7d1',
              backgroundColor: 'rgba(69, 183, 209, 0.1)',
              borderWidth: 3,
              tension: 0.3
            },
            {
              label: 'Biotech Index',
              data: [32, 38, 45, 52, 58, 65, 72],
              borderColor: '#f9ca24',
              backgroundColor: 'rgba(249, 202, 36, 0.1)',
              borderWidth: 3,
              tension: 0.3
            }
          ]
        },
        options: chartOptions
      });
    }

    return () => {
      Object.values(chartInstances.current).forEach(chart => chart?.destroy());
    };
  }, []);

  return (
    <div className="predict-container">
      <div className="predict-header">
        <h1>Development Prediction</h1>
        <p>Interactive Analytics & Forecasting</p>
      </div>

      <div className="chart-tabs">
        <div className="tab-buttons">
          <button 
            className={`tab-button ${activeChart === 'budget' ? 'active' : ''}`}
            onClick={() => setActiveChart('budget')}
          >
            Budget Planning
          </button>
          <button 
            className={`tab-button ${activeChart === 'tech' ? 'active' : ''}`}
            onClick={() => setActiveChart('tech')}
          >
            Emerging Technology Index
          </button>
        </div>
      </div>

      <div className="chart-container-predict">
        <div style={{ display: activeChart === 'budget' ? 'block' : 'none' }}>
          <h2 className="chart-title-predict">Budget Planning</h2>
          <div className="chart-canvas-predict">
            <canvas ref={budgetChartRef}></canvas>
          </div>
        </div>
        <div style={{ display: activeChart === 'tech' ? 'block' : 'none' }}>
          <h2 className="chart-title-predict">Emerging Technology Index</h2>
          <div className="chart-canvas-predict">
            <canvas ref={techChartRef}></canvas>
          </div>
        </div>
      </div>

      <div className="chart-info">
        <div className="info-box">
          <h4>Key Insights</h4>
          <ul>
            <li>Interactive hover tooltips for detailed data points</li>
            <li>Toggle between different chart views</li>
            <li>Responsive design for all screen sizes</li>
            <li>Real-time data visualization capabilities</li>
          </ul>
        </div>
        <div className="info-box">
          <h4>Data Sources</h4>
          <ul>
            <li>Budget data includes planned vs actual spending</li>
            <li>Technology indices track adoption rates</li>
            <li>Projected values shown with dashed lines</li>
            <li>Historical trends inform future predictions</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Predict;
