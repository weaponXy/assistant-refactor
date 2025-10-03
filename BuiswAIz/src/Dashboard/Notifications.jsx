import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import '../stylecss/Dashboard/Notifications.css';

const Notifications = () => {
  const navigate = useNavigate();
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
            updatedstock,
            color,
            agesize,
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
            // Create variant display for color and agesize
            const variants = [];
            if (item.color && item.color.trim()) {
              variants.push(`C: ${item.color}`);
            }
            if (item.agesize && item.agesize.trim()) {
              variants.push(`S: ${item.agesize}`);
            }
            const variantInfo = variants.length > 0 ? variants.join(', ') : null;

            allNotifications.push({
              id: `stock-${item.productcategoryid}-${index}-${Date.now()}`,
              type: 'low-stock',
              title: 'Low Stock Alert',
              message: `${item.products?.productname || 'Unknown Product'}`,
              variantInfo: variantInfo,
              details: `Stock: ${item.currentstock}`,
              priority: 'high',
              timestamp: item.updatedstock ? new Date(item.updatedstock) : new Date(),
              navigationPath: '/inventory'
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
              timestamp: new Date(order.orderdate),
              navigationPath: '/TablePage'
            });
          });
        }
      } catch {
        // Continue without orders data if there's an error
      }

        try {
          const { data: purchaseOrders, error: purchaseError } = await supabase
            .from('purchase_orders')
            .select(`
              purchaseorderid,
              order_qty,
              unit_cost,
              status,
              confirmed_at,
              products (productname),
              productcategory (color, agesize),
              suppliers (suppliername)
            `)
            .in('status', ['Confirmed', 'Pending']) // <- fetch both
            .order('confirmed_at', { ascending: false })
            .limit(10);

          if (!purchaseError && purchaseOrders?.length) {
            purchaseOrders.forEach((order, index) => {
              const variants = [];
              if (order.productcategory?.color?.trim()) variants.push(`C: ${order.productcategory.color}`);
              if (order.productcategory?.agesize?.trim()) variants.push(`S: ${order.productcategory.agesize}`);
              const variantInfo = variants.length ? variants.join(', ') : null;

              allNotifications.push({
                id: `purchase-${order.purchaseorderid}-${index}-${Date.now()}`,
                type: 'purchase-order', 
                title: 'Purchase Order',
                message: `${order.products?.productname || 'Unknown Product'}`,
                variantInfo,
                details: `Status: ${order.status} | Supplier: ${order.suppliers?.suppliername || 'Unknown'} | Qty: ${order.order_qty}`,
                priority: 'medium',
                timestamp: order.confirmed_at ? new Date(order.confirmed_at) : new Date(),
                navigationPath: '/supplier'
              });
            });
          }
        } catch {}

      // 3. Fetch defective items - show product name, status, and reported date
      try {
        const { data: defectiveItems, error: defectiveError } = await supabase
          .from('defectiveitems')
          .select(`
            productid,
            reporteddate,
            status,
            products (
              productname,
              productcategory (
                color,
                agesize
              )
            )
          `)
          .order('reporteddate', { ascending: false })
          .limit(10);

        if (defectiveError) {
          if (!defectiveError.message.includes('does not exist')) {
            throw defectiveError;
          }
        } else if (defectiveItems && defectiveItems.length > 0) {
          defectiveItems.forEach((item, index) => {
            // Get all product categories for this product to show variants
            const productCategories = item.products?.productcategory || [];
            
            // Create variant info for each category
            let variantInfo = null;
            if (Array.isArray(productCategories) && productCategories.length > 0) {
              const variants = [];
              productCategories.forEach(category => {
                const categoryVariants = [];
                if (category.color && category.color.trim()) {
                  categoryVariants.push(`C: ${category.color}`);
                }
                if (category.agesize && category.agesize.trim()) {
                  categoryVariants.push(`S: ${category.agesize}`);
                }
                if (categoryVariants.length > 0) {
                  variants.push(categoryVariants.join(', '));
                }
              });
              if (variants.length > 0) {
                variantInfo = variants.join(' | ');
              }
            }

            allNotifications.push({
              id: `defective-${item.productid}-${item.reporteddate}-${index}-${Date.now()}`,
              type: 'defective-item',
              title: 'Defective Item Report',
              message: `${item.products?.productname || 'Unknown Product'}`,
              variantInfo: variantInfo,
              details: `Status: ${item.status} | Reported: ${new Date(item.reporteddate).toLocaleDateString()}`,
              priority: 'high',
              timestamp: new Date(item.reporteddate),
              navigationPath: '/inventory'
            });
          });
        }
      } catch {
        // Continue without defective items data if there's an error
      }

      // Sort notifications by timestamp first (newest first), then by priority
      allNotifications.sort((a, b) => {
        // First sort by timestamp (newest first)
        const timeDiff = new Date(b.timestamp) - new Date(a.timestamp);
        
        // If timestamps are the same (within 1 minute), then sort by priority
        if (Math.abs(timeDiff) < 60000) { // 60000ms = 1 minute
          const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        }
        
        return timeDiff;
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

  const handleNotificationClick = (notification) => {
    if (notification.navigationPath) {
      navigate(notification.navigationPath);
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
              className={`${getPriorityClass(notification.priority)} clickable-notification`}
              onClick={() => handleNotificationClick(notification)}
              style={{ cursor: 'pointer' }}
            >
              <div className="notification-content">
                <div className="notification-header">
                  <span className="notification-title">{notification.title}</span>
                  <div className="notification-message">{notification.message}</div>
                  {notification.variantInfo && (
                    <div className="notification-variant-info" style={{ 
                      fontSize: '12px', 
                      color: '#666', 
                      fontStyle: 'italic',
                      marginTop: '2px'
                    }}>
                      {notification.variantInfo}
                    </div>
                  )}
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