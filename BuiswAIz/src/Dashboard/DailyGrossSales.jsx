import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import UploadSheets from '../components/UploadSheets';
import '../stylecss/Dashboard/DailyGrossSales.css';

const DailyGrossSales = () => {
  const [dailySales, setDailySales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [maxSaleValue, setMaxSaleValue] = useState(0);
  const [showUploadModal, setShowUploadModal] = useState(false);

  useEffect(() => {
    fetchDailySales();
  }, []);

  const fetchDailySales = async () => {
    try {
      setLoading(true);

      const days = [];
      const today = new Date();
      for (let i = 9; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        days.push({
        date: date, 
          dateString: date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), 
          dayName: date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })
        });

      }

      const salesPromises = days.map(async (day) => {
        const nextDay = new Date(day.date);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayString = nextDay.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

        const { data, error } = await supabase
          .from('orders')
          .select('totalamount, orderdate')
          .gte('orderdate', day.dateString)
          .lt('orderdate', nextDayString);

        if (error) {
          return { ...day, totalSales: 0, transactionCount: 0 };
        }

        const totalSales = data.reduce((sum, order) => sum + (Number(String(order.totalamount).replace(/,/g, '')) || 0), 0);
        const transactionCount = data.length;

        return { ...day, totalSales, transactionCount };
      });

      const salesData = await Promise.all(salesPromises);
      const maxValue = Math.max(...salesData.map(day => day.totalSales));
      setMaxSaleValue(maxValue);

      const salesWithChanges = salesData.map((day, index) => {
        let changeAmount = 0;
        let changeDirection = 'same';

        if (index > 0) {
          const previousDay = salesData[index - 1];
          changeAmount = day.totalSales - previousDay.totalSales;

          if (changeAmount > 0) changeDirection = 'up';
          else if (changeAmount < 0) changeDirection = 'down';
        }

        return { ...day, changeAmount, changeDirection };
      });

      setDailySales(salesWithChanges);
      setError(null);
    } catch {
      setError('Failed to load daily sales data');
    } finally {
      setLoading(false);
    }
  };

  const getBarHeight = (saleAmount) => {
    if (maxSaleValue === 0) return 0;
    return Math.max((saleAmount / maxSaleValue) * 100, 2);
  };

  const formatCurrency = (amount) =>
    `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const formatChange = (amount) => {
    const sign = amount >= 0 ? '+' : '-';
    return `${sign}₱${Math.abs(amount).toLocaleString('en-PH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    })}`;
  };

  if (loading) {
    return (
      <div className="daily-sales-container">
        <div className="daily-sales-loading"><p>Loading daily sales data...</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="daily-sales-container">
        <div className="daily-sales-error">
          <p>{error}</p>
          <button onClick={fetchDailySales} className="retry-button">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="daily-sales-container">
        <div className="daily-sales-header">
          <div className="daily-sales-header-left">
            <h4>Last 10 Days Performance</h4>
            <div className="sales-legend">
              <span className="legend-item">
                <div className="legend-color primary"></div>
                Daily Sales
              </span>
            </div>
          </div>
          <button 
            className="upload-sheet-button" 
            onClick={() => setShowUploadModal(true)}
          >
             Upload Sheet
          </button>
        </div>

        <div className="daily-sales-chart">
          <div className="chart-y-axis">
            {maxSaleValue > 0 && (
              <>
                <span className="y-axis-label">{formatCurrency(maxSaleValue)}</span>
                <span className="y-axis-label">{formatCurrency(maxSaleValue * 0.75)}</span>
                <span className="y-axis-label">{formatCurrency(maxSaleValue * 0.5)}</span>
                <span className="y-axis-label">{formatCurrency(maxSaleValue * 0.25)}</span>
                <span className="y-axis-label">₱0</span>
              </>
            )}
          </div>

          <div className="chart-bars-container">
            {dailySales.map((day, index) => (
              <div key={index} className="bar-group">
                <div className="bar-container">
                  <div
                    className="bar primary-bar"
                    style={{ height: `${getBarHeight(day.totalSales)}%` }}
                    title={`${day.dayName}: ${formatCurrency(day.totalSales)}`}
                  >
                    <div className="bar-value">
                      {day.totalSales > 0 ? formatCurrency(day.totalSales) : ''}
                    </div>
                  </div>
                </div>
                <div className="bar-label">
                  <div className="day-name">{day.dayName}</div>
                  {index > 0 && day.changeAmount !== 0 && (
                    <div className={`change-indicator ${day.changeDirection}`}>
                      <span className={`change-icon ${day.changeDirection}`}>
                        {day.changeDirection === 'up' ? '↗️' : day.changeDirection === 'down' ? '↘️' : '➖'}
                      </span>
                      <span className="change-text">
                        {formatChange(day.changeAmount)}
                      </span>
                    </div>
                  )}
                  {index === 0 && (
                    <div className="change-indicator baseline">
                      <span className="change-text">Baseline</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Upload Sales Spreadsheet</h2>
              <button
                className="close-btn"
                onClick={() => setShowUploadModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <UploadSheets />

            <div className="modal-actions">
              <button onClick={() => setShowUploadModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DailyGrossSales;