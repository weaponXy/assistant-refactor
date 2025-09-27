import React, { useEffect, useState } from 'react';

const StatsContainer = ({ totalEarnings, totalCustomers, statsFilter, onStatsFilterChange, orderData }) => {
  const [, setPreviousEarnings] = useState(0);
  const [percentageChange, setPercentageChange] = useState(0);
  const [isIncreasing, setIsIncreasing] = useState(null);

  useEffect(() => {
    if (orderData && orderData.length > 0) {
      calculatePreviousPeriodEarnings();
    }
  });

  const calculatePreviousPeriodEarnings = () => {
    const now = new Date();
    let previousPeriodData = [];

    switch (statsFilter) {
      case 'today': {
        // Compare today vs yesterday
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        previousPeriodData = orderData.filter(item => {
          const date = new Date(item.createdat);
          return date.toDateString() === yesterday.toDateString();
        });
        break;
      }

      case 'week1': {
        // Compare first week of current month vs first week of last month
        const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const lastYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        
        previousPeriodData = orderData.filter(item => {
          const date = new Date(item.createdat);
          return date.getDate() <= 7 && 
                 date.getMonth() === lastMonth && 
                 date.getFullYear() === lastYear;
        });
        break;
      }

      case 'week2': {
        // Compare second week vs first week of current month
        previousPeriodData = orderData.filter(item => {
          const date = new Date(item.createdat);
          return date.getDate() <= 7 && 
                 date.getMonth() === now.getMonth() && 
                 date.getFullYear() === now.getFullYear();
        });
        break;
      }

      case 'week3': {
        // Compare third week vs second week of current month
        previousPeriodData = orderData.filter(item => {
          const date = new Date(item.createdat);
          return date.getDate() > 7 && date.getDate() <= 14 && 
                 date.getMonth() === now.getMonth() && 
                 date.getFullYear() === now.getFullYear();
        });
        break;
      }

      case 'month': {
        // Compare this month vs last month
        const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const lastYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        
        previousPeriodData = orderData.filter(item => {
          const date = new Date(item.createdat);
          return date.getMonth() === lastMonth && 
                 date.getFullYear() === lastYear;
        });
        break;
      }

      case 'all':
      default: {
        // Compare all time vs previous year
        previousPeriodData = orderData.filter(item => {
          const date = new Date(item.createdat);
          return date.getFullYear() === now.getFullYear() - 1;
        });
        break;
      }
    }

    // Calculate previous period earnings
    const previousTotal = previousPeriodData.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    setPreviousEarnings(previousTotal);

    // Calculate percentage change and trend
    if (previousTotal === 0) {
      if (totalEarnings > 0) {
        setPercentageChange(100);
        setIsIncreasing(true);
      } else {
        setPercentageChange(0);
        setIsIncreasing(null);
      }
    } else {
      const change = ((totalEarnings - previousTotal) / previousTotal) * 100;
      setPercentageChange(Math.abs(change));
      setIsIncreasing(totalEarnings > previousTotal);
    }
  };

  const getPeriodLabel = () => {
    switch (statsFilter) {
      case 'today': return 'vs Yesterday';
      case 'week1': return 'vs Last Month (7 Days)';
      case 'week2': return 'vs Last 7 Days';
      case 'week3': return 'vs Last 14 Days';
      case 'month': return 'vs Last 21 Days';
      case 'all': return 'vs Last Year';
      default: return 'vs Previous Period';
    }
  };

  const getTrendIcon = () => {
    if (isIncreasing === null) return null;
    
    return isIncreasing 
      ? "https://cdn-icons-png.freepik.com/256/5412/5412850.png"
      : "https://cdn-icons-png.freepik.com/512/8438/8438640.png";
  };

  const getTrendColor = () => {
    if (isIncreasing === null) return '#666';
    return isIncreasing ? '#28a745' : '#dc3545';
  };

  const getTrendText = () => {
    if (isIncreasing === null) return 'No Data';
    return isIncreasing ? 'Increase' : 'Decrease';
  };

  return (
    <div className="stats-container">
      <div className="stats-container-header">
        <h3>Summary Panel</h3>
        <select 
          className="stats-container-filter" 
          value={statsFilter} 
          onChange={onStatsFilterChange}
        >
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week1">7 Days</option>
          <option value="week2">14 Days</option>
          <option value="week3">21 Days</option>
          <option value="month">This Month</option>
        </select>
      </div>
      
      <div className="stats-boxes">
        <div className="earnings-box">
          <div className="stats-box-header">
            <img 
              src="https://cdn-icons-png.flaticon.com/512/10997/10997940.png" 
              alt="Earnings Icon" 
              className="earnings-icon"
            />
            <h3>Total Earnings</h3>
          </div>
          <p>₱{totalEarnings.toLocaleString()}</p>
        </div>
        
        <div className="customers-box">
          <div className="stats-box-header">
            <img 
              src="https://www.pikpng.com/pngl/b/75-757195_customer-clipart-end-user-customer-blue-icon-png.png" 
              alt="Customers Icon" 
              className="customers-icon"
            />
            <h3>Total Customers</h3>
          </div>
          <p>{totalCustomers.toLocaleString()}</p>
        </div>

        <div className="sales-comparison-box">
          <div className="stats-box-header">
            {getTrendIcon() && (
              <img 
                src={getTrendIcon()} 
                alt={`Sales ${getTrendText()}`}
                className="trend-icon"
              />
            )}
            <h3>Sales Trend</h3>
          </div>
          <div className="trend-content">
            <p style={{ color: getTrendColor(), fontSize: '1.8rem', fontWeight: 'bold', margin: '5px 0' }}>
              {percentageChange.toFixed(1)}%
            </p>
            <span style={{ color: getTrendColor(), fontSize: '0.9rem', fontWeight: '600' }}>
              {getTrendText()}
            </span>
            <div className="comparison-period" style={{ fontSize: '0.8rem', color: '#666', marginTop: '5px' }}>
              {getPeriodLabel()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsContainer;