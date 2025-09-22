import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from "react-router-dom";
import { supabase } from './supabase';
import OrderSales from './components/OrderSales';
import Bestseller from './components/Bestseller';
import StatsContainer from './components/StatsContainer';
import InvoiceModal from './components/InvoiceModal';
import AddSaleModal from './components/AddSaleModal';
import SalesSuccessModal from './components/SalesSuccessModal';
import PeakHours from './components/PeakHours';
import './stylecss/TablePage.css';
import './stylecss/Sales/OrderSales.css';
import './stylecss/Sales/StatsContainer.css';
import './stylecss/Sales/InvoiceModal.css';
import './stylecss/Sales/AddSaleModal.css';
import './stylecss/Sales/Bestseller.css';
import './stylecss/Sales/PeakHours.css';

const TablePage = () => {
  const navigate = useNavigate();
  const [orderData, setOrderData] = useState([]);
  const [products, setProducts] = useState([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [statsFilter, setStatsFilter] = useState('all');
  const [showAddSaleModal, setShowAddSaleModal] = useState(false);
  const [showSalesSuccessModal, setShowSalesSuccessModal] = useState(false);
  const [salesSuccessData, setSalesSuccessData] = useState(null);
  const [user, setUser] = useState(null);
  const [isSavingSale, setIsSavingSale] = useState(false);

  // Updated bestsellers calculation to group by product name instead of productcategoryid
  const bestsellers = useMemo(() => {
    if (!orderData.length) return [];

    const summary = {};
    orderData.forEach(item => {
      // Use product name as the unique identifier instead of productcategoryid
      const productName = item.products?.productname || 'Unknown';
      const imageUrl = item.products?.image_url || '';

      if (!summary[productName]) {
        summary[productName] = {
          productname: productName,
          image_url: imageUrl,
          totalQuantity: 0,
          timesBought: new Set(),
        };
      }

      summary[productName].totalQuantity += item.quantity;
      summary[productName].timesBought.add(item.orderid);
    });

    return Object.values(summary)
      .map(item => ({
        ...item,
        timesBought: item.timesBought.size,
      }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity);
  }, [orderData]);

  // Memoize stats calculation with debouncing - now using orderdate from orders table
  const { earnings, customers } = useMemo(() => {
    if (!orderData.length) return { earnings: 0, customers: 0 };

    const now = new Date();
    const filteredData = orderData.filter(item => {
      // Use orderdate from orders table instead of createdat from orderitems
      const date = new Date(item.orders?.orderdate || item.createdat);
      
      switch (statsFilter) {
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

    const earnings = filteredData.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    const uniqueOrderIds = new Set(filteredData.map(item => item.orderid));
    
    return { earnings, customers: uniqueOrderIds.size };
  }, [orderData, statsFilter]);

  // Update stats when calculated values change
  useEffect(() => {
    setTotalEarnings(earnings);
    setTotalCustomers(customers);
  }, [earnings, customers]);

  // Optimize user authentication check
  useEffect(() => {
    let mounted = true;

    const getUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (!mounted) return;

        if (error || !user) {
          window.location.href = '/';
          return;
        }
        
        const { data: profile, error: profileError } = await supabase
          .from('systemuser')
          .select('*')
          .eq('userid', user.id)
          .single();
        
        if (!mounted) return;
        
        if (profileError) {
          console.error("Error fetching user profile:", profileError);
          return;
        }
        
        setUser(profile);
      } catch (error) {
        console.error("Authentication error:", error);
        if (mounted) window.location.href = '/';
      }
    };
    
    getUser();
    return () => { mounted = false; };
  }, []);

  // Updated products fetching to use productcategory table
  const fetchProducts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('productcategory')
        .select(`
          productcategoryid,
          productid,
          price,
          cost,
          color,
          agesize,
          currentstock,
          reorderpoint,
          products (
            productname,
            description,
            image_url
          )
        `)
        .order('productcategoryid');

      if (error) {
        console.error('Error fetching products:', error.message);
        return;
      }
      
      // Transform data to match expected format
      const transformedProducts = data?.map(item => ({
        productcategoryid: item.productcategoryid,
        productid: item.productid,
        productname: item.products?.productname || 'Unknown Product',
        description: item.products?.description || '',
        image_url: item.products?.image_url || '',
        price: item.price,
        cost: item.cost,
        color: item.color,
        agesize: item.agesize,
        currentstock: item.currentstock,
        reorderpoint: item.reorderpoint
      })) || [];
      
      setProducts(transformedProducts);
    } catch (error) {
      console.error('Unexpected error fetching products:', error);
    }
  }, []);

  // Updated order data fetching to include orderdate from orders table
  const fetchOrderData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orderitems')
        .select(`
          productid,
          orderid,
          productcategoryid,
          quantity,
          unitprice,
          subtotal,
          createdat,
          productcategory (
            productid,
            price,
            cost,
            color,
            agesize,
            currentstock,
            products (
              productname,
              image_url,
              description
            )
          ),
          orders (
            totalamount,
            orderstatus,
            amount_paid,
            change,
            orderdate
          )
        `);

      if (error) {
        console.error('Error fetching order data:', error.message);
        return;
      }

      // Transform data to match expected format
      const transformedData = data?.map(item => ({
        ...item,
        // Create a products object for backward compatibility
        products: {
          productname: item.productcategory?.products?.productname || 'Unknown Product',
          image_url: item.productcategory?.products?.image_url || '',
          description: item.productcategory?.products?.description || ''
        }
      })) || [];

      setOrderData(transformedData);
    } catch (error) {
      console.error('Unexpected error fetching order data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchOrderData();
    fetchProducts();
  }, [fetchOrderData, fetchProducts]);

  // Debounce stats filter changes
  const handleStatsFilter = useCallback((e) => {
    const value = e.target.value;
    // Use requestAnimationFrame to defer state update
    requestAnimationFrame(() => {
      setStatsFilter(value);
    });
  }, []);

  const handleAddSale = useCallback(() => {
    setShowAddSaleModal(true);
  }, []);

  const handleCloseAddSaleModal = useCallback(() => {
    setShowAddSaleModal(false);
  }, []);

  // Add callback for sales success modal
  const handleSalesSuccessModalClose = useCallback(() => {
    setShowSalesSuccessModal(false);
    setSalesSuccessData(null);
  }, []);

  // Optimize order ID generation with async handling
  const generateUniqueOrderId = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('orderid')
        .order('orderid', { ascending: false })
        .limit(1);
      
      if (error) {
        console.error('Error fetching highest order ID:', error);
        throw new Error(`Database error while fetching order IDs: ${error.message}`);
      }
      
      if (!data || data.length === 0) {
        return 1;
      }
      
      const highestOrderId = parseInt(data[0].orderid, 10);
      if (isNaN(highestOrderId)) {
        console.warn('Found non-numeric order ID, starting from 1');
        return 1;
      }
      
      return highestOrderId + 1;
    } catch (error) {
      console.error('Error in generateUniqueOrderId:', error);
      throw error;
    }
  }, []);

  // Fixed stock availability check using productcategoryid
  const checkStockAvailability = useCallback(async (salesDataArray) => {
    try {
      const stockErrors = [];
      const productsToCheck = salesDataArray.filter(item => !item.isCustomProduct);

      if (productsToCheck.length === 0) {
        return [];
      }

      // Use productcategoryid directly instead of productname matching
      const productCategoryIds = productsToCheck
        .map(saleData => saleData.productcategoryid)
        .filter(id => id !== null && id !== undefined);

      if (productCategoryIds.length > 0) {
        const { data: currentStockData, error } = await supabase
          .from('productcategory')
          .select(`
            productcategoryid, 
            currentstock, 
            color,
            agesize,
            products(productname)
          `)
          .in('productcategoryid', productCategoryIds);

        if (error) {
          console.error('Error fetching current stock:', error);
          stockErrors.push('Error fetching current stock data');
          return stockErrors;
        }

        // Check stock against current database values using productcategoryid
        for (const saleData of productsToCheck) {
          const currentStockItem = currentStockData.find(s => s.productcategoryid === saleData.productcategoryid);
          
          if (!currentStockItem) {
            stockErrors.push(`Stock data not found for product variant (ID: ${saleData.productcategoryid})`);
            continue;
          }

          const currentStock = currentStockItem.currentstock;
          const requestedQuantity = parseInt(saleData.quantity, 10);
          const productName = currentStockItem.products?.productname || 'Unknown Product';
          const variantInfo = [currentStockItem.color, currentStockItem.agesize].filter(v => v).join(', ');
          const fullProductName = variantInfo ? `${productName} (${variantInfo})` : productName;

          if (currentStock === 0) {
            stockErrors.push(`"${fullProductName}" is out of stock`);
          } else if (requestedQuantity > currentStock) {
            stockErrors.push(`"${fullProductName}" has insufficient stock. Available: ${currentStock}, Required: ${requestedQuantity}`);
          }
        }
      }

      if (stockErrors.length > 0) {
        console.log('Stock errors:', stockErrors);
      }

      return stockErrors;
    } catch (error) {
      console.error('Error in checkStockAvailability:', error);
      return [`Error checking stock availability: ${error.message}`];
    }
  }, []);

  // Fixed inventory update using productcategoryid
  const updateInventoryStock = useCallback(async (salesDataArray) => {
    const productsToUpdate = salesDataArray.filter(item => !item.isCustomProduct);

    if (productsToUpdate.length === 0) {
      return;
    }

    try {
      const updates = [];

      // Process each product individually using productcategoryid
      for (const saleData of productsToUpdate) {
        // Validate that we have a productcategoryid
        if (!saleData.productcategoryid) {
          const error = `Product "${saleData.productname}" missing productcategoryid`;
          console.error(error);
          throw new Error(error);
        }

        // Get CURRENT stock from database using productcategoryid
        const { data: currentStockData, error: stockError } = await supabase
          .from('productcategory')
          .select('productcategoryid, currentstock, color, agesize, products(productname)')
          .eq('productcategoryid', saleData.productcategoryid)
          .single();

        if (stockError) {
          const error = `Failed to get current stock for productcategoryid ${saleData.productcategoryid}: ${stockError.message}`;
          console.error(error);
          throw new Error(error);
        }

        const currentStock = currentStockData.currentstock;
        const quantityToReduce = parseInt(saleData.quantity, 10);
        const newStock = currentStock - quantityToReduce;
        const productName = currentStockData.products?.productname || 'Unknown Product';
        const variantInfo = [currentStockData.color, currentStockData.agesize].filter(v => v).join(', ');
        const fullProductName = variantInfo ? `${productName} (${variantInfo})` : productName;

        if (newStock < 0) {
          const error = `Would result in negative stock for ${fullProductName}. Current: ${currentStock}, Requested: ${quantityToReduce}`;
          console.error(error);
          throw new Error(error);
        }

        updates.push({
          productcategoryid: saleData.productcategoryid,
          currentstock: newStock,
          updatedstock: new Date().toISOString(),
          productname: fullProductName,
          originalStock: currentStock,
          quantityReduced: quantityToReduce
        });
      }

      // Perform updates one by one using productcategoryid
      for (const update of updates) {
        const { error } = await supabase
          .from('productcategory')
          .update({
            currentstock: update.currentstock,
            updatedstock: update.updatedstock
          })
          .eq('productcategoryid', update.productcategoryid)
          .select('productcategoryid, currentstock, updatedstock');

        if (error) {
          const errorMsg = `Failed to update stock for ${update.productname} (ID: ${update.productcategoryid}): ${error.message}`;
          console.error(errorMsg);
          console.error('Full error object:', error);
          throw new Error(errorMsg);
        }

        // Small delay to prevent overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } catch (error) {
      console.error('\nInventory update failed');
      console.error('Error details:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }, []);

  // Enhanced handleSaveSale with productcategoryid validation and loading state
  const handleSaveSale = useCallback(async (orderWithPayment) => {
    setIsSavingSale(true);
    try {
      const salesDataArray = orderWithPayment.salesData;
      
      // Validate that non-custom products have productcategoryid
      const invalidProducts = salesDataArray.filter(item => 
        !item.isCustomProduct && !item.productcategoryid
      );
      
      if (invalidProducts.length > 0) {
        const errorMsg = `Missing productcategoryid for products: ${invalidProducts.map(p => p.productname).join(', ')}`;
        console.error(errorMsg);
        alert(errorMsg);
        return;
      }
      
      const stockErrors = await checkStockAvailability(salesDataArray);
      if (stockErrors.length > 0) {
        console.error('Stock validation failed:', stockErrors);
        alert(`Stock validation failed:\n\n${stockErrors.join('\n')}`);
        return;
      }

      const uniqueOrderId = await generateUniqueOrderId();
      
      // Update sales data with order ID
      const updatedSalesData = salesDataArray.map(item => ({
        ...item,
        orderid: uniqueOrderId
      }));

      const totalAmount = updatedSalesData.reduce((sum, item) => sum + item.subtotal, 0);
      // Use the exact datetime from the form input
      const orderDateTime = orderWithPayment.orderDateTime;
      const normalizedStatus = orderWithPayment.orderStatus.toUpperCase();

      const orderRecord = {
        orderid: uniqueOrderId,
        totalamount: totalAmount,
        orderdate: orderDateTime, // Use orderdate instead of orderdate
        orderstatus: normalizedStatus,
        amount_paid: orderWithPayment.amountPaid,
        change: orderWithPayment.change
      };
      
      const { data: orderData, error: orderCreateError } = await supabase
        .from('orders')
        .insert([orderRecord])
        .select();

      console.log('Order creation result:', { data: orderData, error: orderCreateError });

      if (orderCreateError) {
        console.error('Error creating order:', orderCreateError);
        alert(`Error creating order: ${orderCreateError.message}`);
        return;
      }
      const orderItemsToInsert = [];

      for (const saleData of updatedSalesData) {
        let productCategoryId;
        let productId;

        if (saleData.isCustomProduct) {
          // Create the product
          const { data: newProduct, error: productCreateError } = await supabase
            .from('products')
            .insert([{
              productname: saleData.productname.trim(),
              description: '',
              image_url: ''
            }])
            .select('productid')
            .single();

          if (productCreateError) {
            console.error('Error creating product:', productCreateError);
            alert(`Error creating product: ${productCreateError.message}`);
            return;
          }

          productId = newProduct.productid;

          // Create the product category
          const { data: newProductCategory, error: productCategoryCreateError } = await supabase
            .from('productcategory')
            .insert([{
              productid: newProduct.productid,
              price: saleData.unitprice,
              cost: 0,
              color: '',
              agesize: '',
              currentstock: 0,
              reorderpoint: 0,
              updatedstock: new Date().toISOString()
            }])
            .select('productcategoryid')
            .single();

          if (productCategoryCreateError) {
            console.error('Error creating product category:', productCategoryCreateError);
            alert(`Error creating product category: ${productCategoryCreateError.message}`);
            return;
          }

          productCategoryId = newProductCategory.productcategoryid;
        } else {
          // For existing products, use the productcategoryid directly from saleData
          productCategoryId = saleData.productcategoryid;
          
          // Find the productid from the productcategoryid
          const selectedProduct = products.find(p => p.productcategoryid === productCategoryId);
          
          if (!selectedProduct) {
            const error = `Error: Product with productcategoryid "${productCategoryId}" not found`;
            console.error(error);
            alert(error);
            return;
          }
          
          productId = selectedProduct.productid;
        }

        orderItemsToInsert.push({
          orderid: saleData.orderid,
          productid: productId,
          productcategoryid: productCategoryId,
          quantity: saleData.quantity,
          unitprice: saleData.unitprice,
          subtotal: saleData.subtotal,
          createdat: orderDateTime // Use the same datetime for consistency
        });
      }

      const { data: orderItemsData, error: orderError } = await supabase
        .from('orderitems')
        .insert(orderItemsToInsert)
        .select();

      console.log('Order items insertion result:', { data: orderItemsData, error: orderError });

      if (orderError) {
        console.error('Error adding order items:', orderError);
        alert(`Error adding sales: ${orderError.message}`);
        return;
      }

      try {
        await updateInventoryStock(salesDataArray);
      } catch (stockUpdateError) {
        console.error('CRITICAL ERROR updating inventory:', stockUpdateError);
        alert(`CRITICAL ERROR: Sale was recorded but inventory update failed: ${stockUpdateError.message}\n\nPlease check the console for details and contact support.`);
        return; // Don't continue if inventory update failed
      }

      // FIXED: Always refresh products data after any sale, not just when new products are created
      // This ensures the dropdown shows updated stock levels
      const refreshPromises = [
        fetchOrderData(),
        fetchProducts() // Always fetch products to get updated stock levels
      ];
      
      await Promise.all(refreshPromises);
      
      // Show success modal
      setSalesSuccessData({
        orderId: uniqueOrderId,
        totalAmount: totalAmount,
        amountPaid: orderWithPayment.amountPaid,
        change: orderWithPayment.change,
        status: normalizedStatus,
        itemCount: updatedSalesData.length
      });
      setShowSalesSuccessModal(true);
      
    } catch (error) {
      console.error('UNEXPECTED ERROR in sale save process:', error);
      console.error('Error stack:', error.stack);
      alert(`Unexpected error occurred: ${error.message}\n\nPlease check the console for details.`);
    } finally {
      setIsSavingSale(false);
    }
  }, [checkStockAvailability, generateUniqueOrderId, updateInventoryStock, fetchOrderData, fetchProducts, products]);

  // Optimize update order with async processing
  const handleUpdateOrder = useCallback(async (updateOrderData) => {
    try {
      const normalizedStatus = updateOrderData.orderStatus.toUpperCase();
      
      const { error: orderUpdateError } = await supabase
        .from('orders')
        .update({
          amount_paid: updateOrderData.amountPaid,
          change: updateOrderData.change,
          orderstatus: normalizedStatus
        })
        .eq('orderid', updateOrderData.orderid);

      if (orderUpdateError) {
        console.error('Database update error:', orderUpdateError);
        throw new Error(`Failed to update order: ${orderUpdateError.message}`);
      }

      // Fetch data asynchronously
      await fetchOrderData();
    } catch (error) {
      console.error('Error updating order:', error);
      throw error;
    }
  }, [fetchOrderData]);

  // Updated invoice selection to handle new structure with variant data
  const handleInvoiceSelect = useCallback(async (selectedItem) => {
    try {
      // Use requestAnimationFrame to defer heavy operations
      requestAnimationFrame(async () => {
        const { data: orderItems, error } = await supabase
          .from('orderitems')
          .select(`
            orderid,
            productcategoryid,
            quantity,
            unitprice,
            subtotal,
            createdat,
            productcategory (
              productid,
              price,
              color,
              agesize,
              products (
                productname,
                image_url,
                description
              )
            ),
            orders (
              totalamount,
              orderstatus,
              amount_paid,
              change,
              orderdate
            )
          `)
          .eq('orderid', selectedItem.orderid);

        if (error) {
          console.error('Error fetching order items:', error);
          alert('Error loading invoice details');
          return;
        }

        // Transform data for backward compatibility
        const transformedOrderItems = orderItems?.map(item => ({
          ...item,
          products: {
            productname: item.productcategory?.products?.productname || 'Unknown Product',
            image_url: item.productcategory?.products?.image_url || ''
          }
        })) || [];

        setSelectedInvoice({
          ...selectedItem,
          orderItems: transformedOrderItems,
          totalOrderAmount: transformedOrderItems[0]?.orders?.totalamount || 0,
          orderStatus: transformedOrderItems[0]?.orders?.orderstatus || 'INCOMPLETE',
          amount_paid: transformedOrderItems[0]?.orders?.amount_paid,
          change: transformedOrderItems[0]?.orders?.change,
          orderdate: transformedOrderItems[0]?.orders?.orderdate, // Add orderdate
          orders: {
            totalamount: transformedOrderItems[0]?.orders?.totalamount,
            orderstatus: transformedOrderItems[0]?.orders?.orderstatus,
            amount_paid: transformedOrderItems[0]?.orders?.amount_paid,
            change: transformedOrderItems[0]?.orders?.change,
            orderdate: transformedOrderItems[0]?.orders?.orderdate
          }
        });
      });
    } catch (error) {
      console.error('Error loading invoice:', error);
      alert('Error loading invoice details');
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      localStorage.clear();
      window.location.href = '/';
    } catch (error) {
      console.error('Error during logout:', error);
      window.location.href = '/';
    }
  }, []);

  return (
    <div className="sales-page">
      <header className="header-bar">
        <h1 className="header-title">BuiswAIz</h1>
      </header>
      
      <div className="main-section">
        <aside className="sidebar">
          <div className="nav-section">
            <p className="nav-header">GENERAL</p>
            <ul>
              <li onClick={() => navigate("/Dashboard")}>Dashboard</li>
              <li onClick={() => navigate("/inventory")}>Inventory</li>
              <li onClick={() => navigate("/supplier")}>Supplier</li>
              <li className="active">Sales</li>
              <li onClick={() => navigate("/expenses")}>Expenses</li>
              <li>AI Assistant</li>
            </ul>
            <p className="nav-header">SUPPORT</p>
            <ul>
              <li>Help</li>
              <li>Settings</li>
            </ul>
          </div>
        </aside>

        <div className="main-content">
          <div className="sales-panel">
            {loading ? (
              <div className="loading-states">
              </div>
            ) : (
              <>
                <div className="table-flex-wrapper">
                  <OrderSales 
                    orderData={orderData}
                    onInvoiceSelect={handleInvoiceSelect}
                    onAddSale={handleAddSale}
                  />

                  <div className="right-column-wrapper">
                    <div className="user-info-card-inline">
                      <div className="user-left">
                        <div className="user-avatar"/>
                        <div className="user-username">
                          {user ? user.username : "Loading..."}
                        </div>
                      </div>
                      <button className="logout-button" onClick={handleLogout}>
                        Logout
                      </button>
                    </div>
                    <Bestseller bestsellers={bestsellers} />
                  </div>
                </div>

                <div className="bottom-analytics-wrapper">
                  <StatsContainer 
                    totalEarnings={totalEarnings}
                    totalCustomers={totalCustomers}
                    statsFilter={statsFilter}
                    onStatsFilterChange={handleStatsFilter}
                    orderData={orderData}
                  />
                  <PeakHours orderData={orderData} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {selectedInvoice && (
        <InvoiceModal 
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onUpdateOrder={handleUpdateOrder}
        />
      )}

      <AddSaleModal 
        isOpen={showAddSaleModal}
        onClose={handleCloseAddSaleModal}
        onSave={handleSaveSale}
        products={products}
        isLoading={isSavingSale}
      />

      <SalesSuccessModal 
        isOpen={showSalesSuccessModal}
        onClose={handleSalesSuccessModalClose}
        orderData={salesSuccessData}
      />
    </div>
  );
};

export default TablePage;