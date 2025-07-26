import React, { useState, useEffect } from 'react';

const OrderSales = ({ orderData, onInvoiceSelect, onAddSale }) => {
  const [filteredData, setFilteredData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTime, setFilterTime] = useState('all');

  useEffect(() => {
    updateFilteredData(orderData, filterTime, searchTerm);
  }, [orderData, filterTime, searchTerm]);

  const handleSearch = (e) => {
    const value = e.target.value.toLowerCase();
    setSearchTerm(value);
  };

  const handleTimeFilter = (e) => {
    const value = e.target.value;
    setFilterTime(value);
  };

  const updateFilteredData = (data, timeFilter, search) => {
    const now = new Date();

    const filtered = data.filter(item => {
      const date = new Date(item.createdat);
      const productName = item.products?.productname || '';
      const matchesSearch =
        productName.toLowerCase().includes(search) ||
        String(item.orderid).toLowerCase().includes(search);

      if (!matchesSearch) return false;

      switch (timeFilter) {
        case 'today':
          return date.toDateString() === now.toDateString();
        case 'week1':
          return date.getDate() <= 7 && date.getMonth() === now.getMonth();
        case 'week2':
          return date.getDate() > 7 && date.getDate() <= 14 && date.getMonth() === now.getMonth();
        case 'week3':
          return date.getDate() > 14 && date.getDate() <= 21 && date.getMonth() === now.getMonth();
        case 'month':
          return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        default:
          return true;
      }
    });

    setFilteredData(filtered);
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
                <td>{item.quantity}</td>
                <td>₱{item.unitprice.toLocaleString()}</td>
                <td>₱{item.subtotal.toLocaleString()}</td>
                <td className="table-action">
                  <button 
                    className="invoice-btn"
                    onClick={() => onInvoiceSelect(item)}
                  >
                    View
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