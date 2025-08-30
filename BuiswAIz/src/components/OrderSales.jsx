import React, { useState, useEffect, useCallback, useRef } from 'react';

const OrderSales = ({ orderData, onInvoiceSelect, onAddSale }) => {
  const [filteredData, setFilteredData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTime, setFilterTime] = useState('all');
  const [sortOption, setSortOption] = useState('orderid-desc');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const sortOptions = [
    { value: 'orderid-desc', label: 'Order ID (Descending)' },
    { value: 'orderid-asc', label: 'Order ID (Ascending)' },
    { value: 'product-az', label: 'Product Name (A-Z)' },
    { value: 'product-za', label: 'Product Name (Z-A)' },
    { value: 'amount-desc', label: 'Total Amount (Descending)'},
    { value: 'amount-asc', label: 'Total Amount (Ascending)' },
    { value: 'date-desc', label: 'Date (Lastest)' },
    { value: 'date-asc', label: 'Date (Newest)' }
  ];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sortData = useCallback((data, sortOption) => {
    const sortedData = [...data];
    
    switch (sortOption) {
      case 'orderid-asc':
        return sortedData.sort((a, b) => a.orderid - b.orderid);
      case 'orderid-desc':
        return sortedData.sort((a, b) => b.orderid - a.orderid);
      case 'product-az':
        return sortedData.sort((a, b) => {
          const nameA = (a.products?.productname || '').toLowerCase();
          const nameB = (b.products?.productname || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
      case 'product-za':
        return sortedData.sort((a, b) => {
          const nameA = (a.products?.productname || '').toLowerCase();
          const nameB = (b.products?.productname || '').toLowerCase();
          return nameB.localeCompare(nameA);
        });
      case 'amount-asc':
        return sortedData.sort((a, b) => a.subtotal - b.subtotal);
      case 'amount-desc':
        return sortedData.sort((a, b) => b.subtotal - a.subtotal);
      case 'date-asc':
        return sortedData.sort((a, b) => new Date(a.createdat) - new Date(b.createdat));
      case 'date-desc':
        return sortedData.sort((a, b) => new Date(b.createdat) - new Date(a.createdat));
      default:
        return sortedData;
    }
  }, []);

  const updateFilteredData = useCallback((data, timeFilter, search, sortOption) => {
    const now = new Date();
    
    // Helper function to check if two dates are on the same day
    const isSameDay = (date1, date2) => {
      return date1.getFullYear() === date2.getFullYear() &&
             date1.getMonth() === date2.getMonth() &&
             date1.getDate() === date2.getDate();
    };

    const filtered = data.filter(item => {
      // Parse the date - handle different date formats
      let date;
      if (item.createdat) {
        date = new Date(item.createdat);
        // Check if date is invalid
        if (isNaN(date.getTime())) {
          console.warn('Invalid date format for item:', item);
          return false;
        }
      } else {
        console.warn('No createdat field for item:', item);
        return false;
      }

      const productName = item.products?.productname || '';
      const matchesSearch =
        productName.toLowerCase().includes(search) ||
        String(item.orderid).toLowerCase().includes(search);

      if (!matchesSearch) return false;

      switch (timeFilter) {
        case 'today':
          return isSameDay(date, now);
        case 'week1':
          return date.getDate() <= 7 && 
                 date.getMonth() === now.getMonth() && 
                 date.getFullYear() === now.getFullYear();
        case 'week2':
          return date.getDate() > 7 && 
                 date.getDate() <= 14 && 
                 date.getMonth() === now.getMonth() && 
                 date.getFullYear() === now.getFullYear();
        case 'week3':
          return date.getDate() > 14 && 
                 date.getDate() <= 21 && 
                 date.getMonth() === now.getMonth() && 
                 date.getFullYear() === now.getFullYear();
        case 'month':
          return date.getMonth() === now.getMonth() && 
                 date.getFullYear() === now.getFullYear();
        default:
          return true;
      }
    });

    const sortedData = sortData(filtered, sortOption);
    setFilteredData(sortedData);
  }, [sortData]);

  useEffect(() => {
    updateFilteredData(orderData, filterTime, searchTerm, sortOption);
  }, [orderData, filterTime, searchTerm, sortOption, updateFilteredData]);

  const handleSearch = (e) => {
    const value = e.target.value.toLowerCase();
    setSearchTerm(value);
  };

  const handleTimeFilter = (e) => {
    const value = e.target.value;
    setFilterTime(value);
  };

  const handleSortSelect = (value) => {
    setSortOption(value);
    setIsDropdownOpen(false);
  };

  const getCurrentSortOption = () => {
    return sortOptions.find(option => option.value === sortOption);
  };

  const getStatusBadge = (status) => {
    const statusClass = status === 'completed' ? 'status-completed' : 'status-pending';
    return (
      <span className={`status-badge ${statusClass}`}>
        {status ? status.toUpperCase() : 'UNKNOWN'}
      </span>
    );
  };

  return (
    <div className="sales-table-wrapper">
      <div className="table-header">
        <button 
          className="add-sale-btn"
          onClick={onAddSale}
        >
          + Add Sale
        </button>
        
        <div className="custom-dropdown-wrapper" ref={dropdownRef}>
          <div 
            className="custom-dropdown-button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <div className="dropdown-button-content">
              <span className="dropdown-text">{getCurrentSortOption()?.label}</span>
              <span className={`dropdown-arrow ${isDropdownOpen ? 'open' : ''}`}>▼</span>
            </div>
          </div>
          
          {isDropdownOpen && (
            <div className="custom-dropdown-list">
              {sortOptions.map((option) => (
                <div
                  key={option.value}
                  className={`dropdown-item ${sortOption === option.value ? 'selected' : ''}`}
                  onClick={() => handleSortSelect(option.value)}
                >
                  <span className="item-icon">{option.icon}</span>
                  <span className="item-text">{option.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <input
          type="text"
          className="search-input"
          placeholder="Search by product name or order code..."
          value={searchTerm}
          onChange={handleSearch}
        />
      </div>

      <h3>Sales Orders</h3>
      <div className="table-scroll-box">
        <table className="sales-table">
          <thead>
            <tr>
              <th></th>
              <th>Product Name</th>
              <th>Order Code</th>
              <th>Status</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Total Amount</th>
              <th className="table-filter-header">
                <select 
                  className="table-filter" 
                  value={filterTime} 
                  onChange={handleTimeFilter}
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week1">First Week</option>
                  <option value="week2">Second Week</option>
                  <option value="week3">Third Week</option>
                  <option value="month">This Month</option>
                </select>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((item, index) => (
              <tr key={index}>
                <td><input type="radio" name="selectedRow" /></td>
                <td>{item.products?.productname || 'N/A'}</td>
                <td>{item.orderid}</td>
                <td>{getStatusBadge(item.orders?.orderstatus)}</td>
                <td>{item.quantity}</td>
                <td>₱{item.unitprice.toLocaleString()}</td>
                <td>₱{item.subtotal.toLocaleString()}</td>
                <td className="table-action">
                  <button 
                    className="invoice-btn"
                    onClick={() => onInvoiceSelect(item)}
                  >
                    View Invoice
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OrderSales;