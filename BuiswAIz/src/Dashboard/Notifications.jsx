import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import '../stylecss/Dashboard/Notifications.css';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const allNotifications = [];

      // 1. Fetch low stock items - only items where currentstock < reorderpoint
      try {
        const { data: lowStockItems, error: stockError } = await supabase
          .from('productcategory')
          .select(`
            productcategoryid,
            productid,
            currentstock,
            reorderpoint,
            products (productname)
          `);

        if (stockError) {
          if (!stockError.message.includes('does not exist')) {
            throw stockError;
          }
        } else if (lowStockItems && lowStockItems.length > 0) {
          // Filter items where current stock is less than reorder point
          const filteredLowStock = lowStockItems.filter(item => 
            item.currentstock < item.reorderpoint
          );
          
          filteredLowStock.forEach((item, index) => {
            allNotifications.push({
              id: `stock-${item.productcategoryid}-${index}-${Date.now()}`,
              type: 'low-stock',
              title: 'Low Stock Alert',
              message: `${item.products?.productname || 'Unknown Product'}`,
              details: `Stock: ${item.currentstock}`,
              priority: 'high',
              timestamp: new Date() // Current date when detected
            });
          });
        }
      } catch {
        // Continue without low stock data if there's an error
      }

      // 2. Fetch incomplete orders - only orders with status "INCOMPLETE"
      try {
        const { data: incompleteOrders, error: ordersError } = await supabase
          .from('orders')
          .select('orderid, orderdate, orderstatus')
          .eq('orderstatus', 'INCOMPLETE')
          .order('orderdate', { ascending: false })
          .limit(10);

        if (ordersError) {
          if (!ordersError.message.includes('does not exist')) {
            throw ordersError;
          }
        } else if (incompleteOrders && incompleteOrders.length > 0) {
          incompleteOrders.forEach((order, index) => {
            allNotifications.push({
              id: `order-${order.orderid}-${index}-${Date.now()}`,
              type: 'incomplete-order',
              title: 'Incomplete Order',
              message: `Order ID: ${order.orderid}`,
              details: `Order Date: ${new Date(order.orderdate).toLocaleDateString()}`,
              priority: 'medium',
              timestamp: new Date(order.orderdate)
            });
          });
        }
      } catch {
        // Continue without orders data if there's an error
      }

      // 3. Fetch defective items - show product name, status, and reported date
      try {
        const { data: defectiveItems, error: defectiveError } = await supabase
          .from('defectiveitems')
          .select(`
            productid,
            reporteddate,
            status,
            products (productname)
          `)
          .order('reporteddate', { ascending: false })
          .limit(10);

        if (defectiveError) {
          if (!defectiveError.message.includes('does not exist')) {
            throw defectiveError;
          }
        } else if (defectiveItems && defectiveItems.length > 0) {
          defectiveItems.forEach((item, index) => {
            allNotifications.push({
              id: `defective-${item.productid}-${item.reporteddate}-${index}-${Date.now()}`,
              type: 'defective-item',
              title: 'Defective Item Report',
              message: `${item.products?.productname || 'Unknown Product'}`,
              details: `Status: ${item.status} | Reported: ${new Date(item.reporteddate).toLocaleDateString()}`,
              priority: 'high',
              timestamp: new Date(item.reporteddate)
            });
          });
        }
      } catch {
        // Continue without defective items data if there's an error
      }

      // Sort notifications by priority and timestamp
      allNotifications.sort((a, b) => {
        const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        }
        return new Date(b.timestamp) - new Date(a.timestamp);
      });

      setNotifications(allNotifications);
      setError(null);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setError(`Failed to load notifications: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityClass = (priority) => {
    return `notification-item priority-${priority}`;
  };

  const formatTimestamp = (timestamp) => {
    const now = new Date();
    const diff = now - new Date(timestamp);
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else {
      return `${days}d ago`;
    }
  };

  if (loading) {
    return (
      <div className="notifications-container">
        <div className="notifications-loading">
          <p>Loading notifications...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="notifications-container">
        <div className="notifications-error">
          <p>{error}</p>
          <button onClick={fetchNotifications} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="notifications-container">
      <div className="notifications-list">
        {notifications.length === 0 ? (
          <div className="no-notifications">
            <div className="no-notifications-icon">✓</div>
            <p>All good! No notifications at the moment.</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className={getPriorityClass(notification.priority)}
            >
              <div className="notification-content">
                <div className="notification-header">
                  <span className="notification-title">{notification.title}</span>
                  <div className="notification-message">{notification.message}</div>
                </div>
                {notification.details && (
                  <div className="notification-details">{notification.details}</div>
                )}
                <span className="notification-time">
                  {formatTimestamp(notification.timestamp)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Notifications;