import React, { useEffect, useState } from 'react';

const StatsContainer = ({ totalEarnings, totalCustomers, statsFilter, onStatsFilterChange, orderData }) => {
  const [, setPreviousEarnings] = useState(0);
  const [percentageChange, setPercentageChange] = useState(0);
  const [isIncreasing, setIsIncreasing] = useState(null);

  // Get available years from orderData
  const getAvailableYears = () => {
    const years = new Set();
    const currentYear = new Date().getFullYear();
    orderData.forEach(item => {
      const orderDate = item.orders?.orderdate;
      if (!orderDate) return;
      const date = new Date(orderDate);
      if (!isNaN(date.getTime())) {
        years.add(date.getFullYear());
      }
    });
    return Array.from(years).sort((a, b) => b - a).map(year => ({
      value: `year-${year}`,
      label: year === currentYear ? 'This Year' : year.toString()
    }));
  };

  const availableYears = getAvailableYears();

  useEffect(() => {
    if (statsFilter === 'all') {
      // Reset comparison values when "All Time" is selected
      setPercentageChange(0);
      setIsIncreasing(null);
    } else if (orderData && orderData.length > 0) {
      calculatePreviousPeriodEarnings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderData, statsFilter, totalEarnings]);

  const calculatePreviousPeriodEarnings = () => {
    const now = new Date();
    let previousPeriodData = [];

    // Check if statsFilter is a year
    if (statsFilter.startsWith('year-')) {
      const selectedYear = parseInt(statsFilter.replace('year-', ''));
      const previousYear = selectedYear - 1;
      
      previousPeriodData = orderData.filter(item => {
        const orderDate = item.orders?.orderdate;
        if (!orderDate) return false;
        const date = new Date(orderDate);
        return date.getFullYear() === previousYear;
      });
    } else {
      switch (statsFilter) {
        case 'today': {
          // Compare today vs yesterday
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          previousPeriodData = orderData.filter(item => {
            const orderDate = item.orders?.orderdate;
            if (!orderDate) return false;
            const date = new Date(orderDate);
            return date.toDateString() === yesterday.toDateString();
          });
          break;
        }

        case 'week1': {
          // Compare first week of current month vs first week of last month
          const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
          const lastYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
          
          previousPeriodData = orderData.filter(item => {
            const orderDate = item.orders?.orderdate;
            if (!orderDate) return false;
            const date = new Date(orderDate);
            return date.getDate() <= 7 && 
                   date.getMonth() === lastMonth && 
                   date.getFullYear() === lastYear;
          });
          break;
        }

        case 'week2': {
          // Compare second week vs first week of current month
          previousPeriodData = orderData.filter(item => {
            const orderDate = item.orders?.orderdate;
            if (!orderDate) return false;
            const date = new Date(orderDate);
            return date.getDate() <= 7 && 
                   date.getMonth() === now.getMonth() && 
                   date.getFullYear() === now.getFullYear();
          });
          break;
        }

        case 'week3': {
          // Compare third week vs second week of current month
          previousPeriodData = orderData.filter(item => {
            const orderDate = item.orders?.orderdate;
            if (!orderDate) return false;
            const date = new Date(orderDate);
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
            const orderDate = item.orders?.orderdate;
            if (!orderDate) return false;
            const date = new Date(orderDate);
            return date.getMonth() === lastMonth && 
                   date.getFullYear() === lastYear;
          });
          break;
        }

        case 'all':
        default: {
          // Compare all time vs previous year
          const currentYear = now.getFullYear();
          previousPeriodData = orderData.filter(item => {
            const orderDate = item.orders?.orderdate;
            if (!orderDate) return false;
            const date = new Date(orderDate);
            return date.getFullYear() === currentYear - 1;
          });
          break;
        }
      }
    }

    // Calculate previous period earnings using totalamount from unique orders
    const uniqueOrders = new Map();
    previousPeriodData.forEach(item => {
      if (!uniqueOrders.has(item.orderid)) {
        uniqueOrders.set(item.orderid, item.orders?.totalamount || 0);
      }
    });
    const previousTotal = Array.from(uniqueOrders.values()).reduce((sum, amount) => sum + amount, 0);
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
    // Check if it's a year filter
    if (statsFilter.startsWith('year-')) {
      const selectedYear = parseInt(statsFilter.replace('year-', ''));
      return `vs ${selectedYear - 1}`;
    }

    switch (statsFilter) {
      case 'today': return 'vs Yesterday';
      case 'week1': return 'vs Last Month (7 Days)';
      case 'week2': return 'vs Last 7 Days';
      case 'week3': return 'vs Last 14 Days';
      case 'month': return 'vs Last 21 Days';
      case 'all': return 'All Time Data';
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
    <div className="sc-stats-container">
      <div className="sc-header">
        <h3>Summary Panel</h3>
        <select 
          className="sc-filter" 
          value={statsFilter} 
          onChange={onStatsFilterChange}
        >
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week1">7 Days</option>
          <option value="week2">14 Days</option>
          <option value="week3">21 Days</option>
          <option value="month">This Month</option>
          {availableYears.map(yearObj => (
            <option key={yearObj.value} value={yearObj.value}>{yearObj.label}</option>
          ))}
        </select>
      </div>
      
      <div className="sc-stats-boxes">
        <div className="sc-earnings-box">
          <div className="sc-box-header">
            <img 
              src="https://cdn-icons-png.flaticon.com/512/10997/10997940.png" 
              alt="Earnings Icon" 
              className="sc-earnings-icon"
            />
            <h3>Total Earnings</h3>
          </div>
          <p>₱{totalEarnings.toLocaleString()}</p>
        </div>
        
        <div className="sc-customers-box">
          <div className="sc-box-header">
            <img 
              src="https://www.pikpng.com/pngl/b/75-757195_customer-clipart-end-user-customer-blue-icon-png.png" 
              alt="Customers Icon" 
              className="sc-customers-icon"
            />
            <h3>Total Customers</h3>
          </div>
          <p>{totalCustomers.toLocaleString()}</p>
        </div>

        <div className="sc-sales-comparison-box">
          <div className="sc-box-header">
            {getTrendIcon() && statsFilter !== 'all' && (
              <img 
                src={getTrendIcon()} 
                alt={`Sales ${getTrendText()}`}
                className="sc-trend-icon"
              />
            )}
            <h3>Sales Trend</h3>
          </div>
          {statsFilter === 'all' ? (
            <div className="sc-trend-content">
              <p>
                Total Historical Data
              </p>
              <span>
                No comparison available
              </span>
            </div>
          ) : (
            <div className="sc-trend-content">
              <p style={{ color: getTrendColor(), fontSize: '1.8rem', fontWeight: 'bold', margin: '5px 0' }}>
                {percentageChange.toFixed(1)}%
              </p>
              <span style={{ color: getTrendColor(), fontSize: '0.9rem', fontWeight: '600' }}>
                {getTrendText()}
              </span>
              <div className="sc-comparison-period" style={{ fontSize: '0.8rem', color: '#666', marginTop: '5px' }}>
                {getPeriodLabel()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatsContainer;