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

      // 1. INVENTORY: Low stock (currentstock < reorderpoint)
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
          if (!stockError.message.includes('does not exist')) throw stockError;
        } else if (lowStockItems?.length) {
          const filteredLowStock = lowStockItems.filter(
            (item) => Number(item.currentstock ?? 0) < Number(item.reorderpoint ?? 0)
          );

          filteredLowStock.forEach((item, index) => {
            const variants = [];
            if (item.color?.trim()) variants.push(`C: ${item.color}`);
            if (item.agesize?.trim()) variants.push(`S: ${item.agesize}`);
            const variantInfo = variants.length ? variants.join(', ') : null;

            allNotifications.push({
              id: `stock-${item.productcategoryid}-${index}-${Date.now()}`,
              type: 'low-stock',
              title: 'Low Stock Alert',
              message: `${item.products?.productname || 'Unknown Product'}`,
              variantInfo,
              details: `Stock: ${item.currentstock}`,
              priority: 'high',
              timestamp: item.updatedstock ? new Date(item.updatedstock) : new Date(),
              navigationPath: '/inventory',
            });
          });
        }
      } catch {
        /* continue without low stock */
      }

      // 2. SALES: Incomplete orders
      try {
        const { data: incompleteOrders, error: ordersError } = await supabase
          .from('orders')
          .select('orderid, orderdate, orderstatus')
          .eq('orderstatus', 'INCOMPLETE')
          .order('orderdate', { ascending: false })
          .limit(10);

        if (ordersError) {
          if (!ordersError.message.includes('does not exist')) throw ordersError;
        } else if (incompleteOrders?.length) {
          incompleteOrders.forEach((order, index) => {
            allNotifications.push({
              id: `order-${order.orderid}-${index}-${Date.now()}`,
              type: 'incomplete-order',
              title: 'Incomplete Order',
              message: `Order ID: ${order.orderid}`,
              details: `Order Date: ${new Date(order.orderdate).toLocaleDateString()}`,
              priority: 'medium',
              timestamp: new Date(order.orderdate),
              navigationPath: '/TablePage',
            });
          });
        }
      } catch {
        /* continue without orders */
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

      // 3. INVENTORY: Defective items
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
          if (!defectiveError.message.includes('does not exist')) throw defectiveError;
        } else if (defectiveItems?.length) {
          defectiveItems.forEach((item, index) => {
            const productCategories = item.products?.productcategory || [];
            let variantInfo = null;

            if (Array.isArray(productCategories) && productCategories.length > 0) {
              const variants = [];
              productCategories.forEach((category) => {
                const vs = [];
                if (category.color?.trim()) vs.push(`C: ${category.color}`);
                if (category.agesize?.trim()) vs.push(`S: ${category.agesize}`);
                if (vs.length) variants.push(vs.join(', '));
              });
              if (variants.length) variantInfo = variants.join(' | ');
            }

            allNotifications.push({
              id: `defective-${item.productid}-${item.reporteddate}-${index}-${Date.now()}`,
              type: 'defective-item',
              title: 'Defective Item Report',
              message: `${item.products?.productname || 'Unknown Product'}`,
              variantInfo,
              details: `Status: ${item.status} | Reported: ${new Date(item.reporteddate).toLocaleDateString()}`,
              priority: 'high',
              timestamp: new Date(item.reporteddate),
              navigationPath: '/inventory',
            });
          });
        }
      } catch {
        /* continue without defective items */
      }

      // 4. BUDGET: Over budget / threshold alerts (fixed + debug-friendly)
      try {
        const THRESHOLD_PCT = 80;
        const DEBUG_BUDGET = true;     // set to false when done debugging
        const FORCE_BUDGET_TEST = false; // set to true to always show a test card

        // Build YYYY-MM-01 .. YYYY-MM-last bounds as strings (for DATE column)
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const start = `${y}-${m}-01`;
        const lastDayNum = new Date(y, now.getMonth() + 1, 0).getDate();
        const end = `${y}-${m}-${String(lastDayNum).padStart(2, '0')}`;

        // Fetch current month budget row
        const { data: budgets, error: budgetErr } = await supabase
          .from('budget')
          .select('id, month_year, monthly_budget_amount, created_at')
          .order('month_year', { ascending: false })
          .limit(24);
        if (budgetErr) throw budgetErr;

        const currentMonthBudget = (budgets || []).find((b) => {
          if (!b?.month_year) return false;
          const d = new Date(b.month_year);
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        });

        // Fetch expenses for the month using DATE bounds
        const { data: monthExpenses, error: expErr } = await supabase
          .from('expenses')
          .select('amount')
          .gte('occurred_on', start)
          .lte('occurred_on', end);
        if (expErr) throw expErr;

        // Compute spent/allocated/used
        const spent = (monthExpenses || []).reduce((sum, e) => {
          const val = Number(e?.amount ?? 0);
          return Number.isFinite(val) ? sum + val : sum;
        }, 0);
        const allocated = Number(currentMonthBudget?.monthly_budget_amount ?? 0);
        const usedPct = allocated > 0 ? Math.round((spent / allocated) * 100) : 0;

        if (DEBUG_BUDGET) {
          console.log('[BUDGET] row:', currentMonthBudget);
          console.log('[BUDGET] start..end:', start, end);
          console.log('[BUDGET] expenses count:', monthExpenses?.length ?? 0);
          console.log('[BUDGET] spent:', spent, 'allocated:', allocated, 'usedPct:', usedPct);
        }

        // Optional: force a test card to verify UI path
        if (FORCE_BUDGET_TEST) {
          allNotifications.push({
            id: `budget-test-${Date.now()}`,
            type: 'budget',
            title: 'Budget (TEST CARD)',
            message: now.toLocaleString(undefined, { month: 'long', year: 'numeric' }),
            details: `Used ${spent} of ${allocated} (${usedPct}%)`,
            priority: 'medium',
            timestamp: new Date(),
            navigationPath: '/budget',
          });
        }

        if (currentMonthBudget && allocated > 0) {
          const overBudget = usedPct >= 100;
          const crossedThreshold = !overBudget && usedPct >= THRESHOLD_PCT;

          if (overBudget || crossedThreshold) {
            const prettyMoney = (v) =>
              Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

            allNotifications.push({
              id: `budget-${currentMonthBudget.id}-${Date.now()}`,
              type: 'budget',
              title: overBudget ? 'Budget Exceeded' : 'Budget Threshold Reached',
              message: now.toLocaleString(undefined, { month: 'long', year: 'numeric' }),
              details: `Used ${prettyMoney(spent)} of ${prettyMoney(allocated)} (${usedPct}%)`,
              priority: overBudget ? 'high' : 'medium',
              timestamp: currentMonthBudget.created_at
                ? new Date(currentMonthBudget.created_at)
                : new Date(),
              navigationPath: '/budget',
            });
          }
        }
      } catch (e) {
        console.error('Budget fetch error:', e);
        // Optional: surface a debug card in the UI
        allNotifications.push({
          id: `budget-error-${Date.now()}`,
          type: 'debug',
          title: 'Budget Debug',
          message: 'Error while fetching budget/expenses',
          details: String(e?.message || e),
          priority: 'low',
          timestamp: new Date(),
        });
      }

      // Sort by timestamp (newest first), then priority if within 1 minute
      allNotifications.sort((a, b) => {
        const timeDiff = new Date(b.timestamp) - new Date(a.timestamp);
        if (Math.abs(timeDiff) < 60000) {
          const order = { high: 3, medium: 2, low: 1 };
          return (order[b.priority] ?? 0) - (order[a.priority] ?? 0);
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

  const getPriorityClass = (priority) => `notification-item priority-${priority}`;

  const formatTimestamp = (timestamp) => {
    const now = new Date();
    const diff = now - new Date(timestamp);
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
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
          <button onClick={fetchNotifications} className="retry-button">Retry</button>
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
                    <div
                      className="notification-variant-info"
                      style={{ fontSize: '12px', color: '#666', fontStyle: 'italic', marginTop: '2px' }}
                    >
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
