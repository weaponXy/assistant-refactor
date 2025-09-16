import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from "react-router-dom";
import { supabase } from './supabase';
import OrderSales from './components/OrderSales';
import Bestseller from './components/Bestseller';
import StatsContainer from './components/StatsContainer';
import InvoiceModal from './components/InvoiceModal';
import AddSaleModal from './components/AddSaleModal';
import './stylecss/TablePage.css';
import './stylecss/Sales/OrderSales.css';
import './stylecss/Sales/StatsContainer.css';
import './stylecss/Sales/InvoiceModal.css';
import './stylecss/Sales/AddSaleModal.css';
import './stylecss/Sales/Bestseller.css';

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
  const [user, setUser] = useState(null);

  // Memoize bestsellers calculation to prevent unnecessary recalculations
  const bestsellers = useMemo(() => {
    if (!orderData.length) return [];

    const summary = {};
    orderData.forEach(item => {
      // Use productcategoryid as the unique identifier
      const id = item.productcategoryid;
      const name = item.products?.productname || 'Unknown';
      const imageUrl = item.products?.image_url || '';

      if (!summary[id]) {
        summary[id] = {
          productcategoryid: id,
          productname: name,
          image_url: imageUrl,
          totalQuantity: 0,
          timesBought: new Set(),
        };
      }

      summary[id].totalQuantity += item.quantity;
      summary[id].timesBought.add(item.orderid);
    });

    return Object.values(summary)
      .map(item => ({
        ...item,
        timesBought: item.timesBought.size,
      }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity);
  }, [orderData]);

  // Memoize stats calculation with debouncing
  const { earnings, customers } = useMemo(() => {
    if (!orderData.length) return { earnings: 0, customers: 0 };

    const now = new Date();
    const filteredData = orderData.filter(item => {
      const date = new Date(item.createdat);
      
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

  // Updated order data fetching to use productcategoryid
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
            change
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

  // Updated stock checking to use productcategoryid
  const checkStockAvailability = useCallback(async (salesDataArray) => {
    const processStock = () => {
      return new Promise((resolve) => {
        // Get productcategoryids from sales data - need to match by product name
        const productsToCheck = salesDataArray.filter(item => !item.isCustomProduct);

        if (productsToCheck.length === 0) {
          resolve([]);
          return;
        }

        const processChunk = async () => {
          try {
            const stockErrors = [];

            for (const saleData of productsToCheck) {
              // Find the product in our products array by name
              const productMatch = products.find(p => p.productname === saleData.productname);

              if (!productMatch) {
                stockErrors.push(`Product "${saleData.productname}" not found in inventory`);
                continue;
              }

              if (productMatch.currentstock < saleData.quantity) {
                if (productMatch.currentstock === 0) {
                  stockErrors.push(`"${saleData.productname}" is out of stock`);
                } else {
                  stockErrors.push(`"${saleData.productname}" has insufficient stock. Available: ${productMatch.currentstock}, Required: ${saleData.quantity}`);
                }
              }
            }

            resolve(stockErrors);
          } catch (error) {
            console.error('Error in checkStockAvailability:', error);
            resolve([`Error checking stock availability: ${error.message}`]);
          }
        };

        processChunk();
      });
    };

    return await processStock();
  }, [products]);

  // Updated inventory updates to use productcategoryid
  const updateInventoryStock = useCallback(async (salesDataArray) => {
    const productsToUpdate = salesDataArray.filter(item => !item.isCustomProduct);

    if (productsToUpdate.length === 0) return;

    try {
      const updates = [];

      // Prepare updates
      for (const saleData of productsToUpdate) {
        // Find the product in our products array by name
        const productMatch = products.find(p => p.productname === saleData.productname);
        
        if (!productMatch) {
          throw new Error(`Product "${saleData.productname}" not found`);
        }

        const newStock = productMatch.currentstock - saleData.quantity;
        updates.push({
          productcategoryid: productMatch.productcategoryid,
          currentstock: newStock,
          updatedstock: new Date().toISOString()
        });
      }

      // Batch update all products with chunking for large updates
      if (updates.length > 0) {
        const CHUNK_SIZE = 10;
        for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
          const chunk = updates.slice(i, i + CHUNK_SIZE);
          
          const updatePromises = chunk.map(update => 
            supabase
              .from('productcategory')
              .update({
                currentstock: update.currentstock,
                updatedstock: update.updatedstock
              })
              .eq('productcategoryid', update.productcategoryid)
          );

          const results = await Promise.all(updatePromises);
          
          for (const result of results) {
            if (result.error) {
              throw new Error(`Failed to update stock: ${result.error.message}`);
            }
          }

          // Yield control to prevent blocking
          if (i + CHUNK_SIZE < updates.length) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
      }
    } catch (error) {
      console.error('Error in updateInventoryStock:', error);
      throw error;
    }
  }, [products]);

  // Updated save operation to handle new product structure
  const handleSaveSale = useCallback(async (orderWithPayment) => {
    try {
      const salesDataArray = orderWithPayment.salesData;
      
      // Check stock availability first with async processing
      const stockErrors = await checkStockAvailability(salesDataArray);
      if (stockErrors.length > 0) {
        alert(`Stock validation failed:\n\n${stockErrors.join('\n')}`);
        return;
      }

      // Generate unique order ID asynchronously
      const uniqueOrderId = await generateUniqueOrderId();
      
      // Update sales data with order ID
      const updatedSalesData = salesDataArray.map(item => ({
        ...item,
        orderid: uniqueOrderId
      }));

      const totalAmount = updatedSalesData.reduce((sum, item) => sum + item.subtotal, 0);
      const orderDate = updatedSalesData[0].createdat;
      const normalizedStatus = orderWithPayment.orderStatus.toUpperCase();

      // Create order with async processing
      const { error: orderCreateError } = await supabase
        .from('orders')
        .insert([{
          orderid: uniqueOrderId,
          totalamount: totalAmount,
          orderdate: orderDate,
          orderstatus: normalizedStatus,
          amount_paid: orderWithPayment.amountPaid,
          change: orderWithPayment.change
        }]);

      if (orderCreateError) {
        console.error('Error creating order:', orderCreateError);
        alert(`Error creating order: ${orderCreateError.message}`);
        return;
      }

      const orderItemsToInsert = [];
      let newProductsCreated = false;

      // Process products with chunking for better performance
      for (const saleData of updatedSalesData) {
        let productCategoryId;
        let productId;

        if (saleData.isCustomProduct) {
          // First create the product
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

          // Then create the product category
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
          newProductsCreated = true;
        } else {
          // For existing products, find the product by name from the products array
          const selectedProduct = products.find(p => p.productname === saleData.productname);
          
          if (!selectedProduct) {
            alert(`Error: Product "${saleData.productname}" not found`);
            return;
          }
          
          productId = selectedProduct.productid;
          productCategoryId = selectedProduct.productcategoryid;
        }

        orderItemsToInsert.push({
          orderid: saleData.orderid,
          productid: productId,  // Add the required productid
          productcategoryid: productCategoryId,
          quantity: saleData.quantity,
          unitprice: saleData.unitprice,
          subtotal: saleData.subtotal,
          createdat: saleData.createdat
        });

        // Yield control periodically
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Insert order items with batch processing
      const { error: orderError } = await supabase
        .from('orderitems')
        .insert(orderItemsToInsert);

      if (orderError) {
        console.error('Error adding sales:', orderError);
        alert(`Error adding sales: ${orderError.message}`);
        return;
      }

      // Update inventory asynchronously
      await updateInventoryStock(salesDataArray);

      // Refresh data with async processing
      const refreshPromises = [
        fetchOrderData(),
        newProductsCreated ? fetchProducts() : Promise.resolve()
      ];
      
      await Promise.all(refreshPromises);
      
      alert(`Successfully added ${updatedSalesData.length} product${updatedSalesData.length > 1 ? 's' : ''} to the ${normalizedStatus.toLowerCase()} sale!\n\nOrder ID: ${uniqueOrderId}\nTotal Amount: ₱${totalAmount.toFixed(2)}\nAmount Paid: ₱${orderWithPayment.amountPaid.toFixed(2)}\nChange: ₱${orderWithPayment.change.toFixed(2)}\nStatus: ${normalizedStatus}`);
    } catch (error) {
      console.error('Unexpected error adding sales:', error);
      alert('Unexpected error occurred. Check console for details.');
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
      console.log(`Order ${updateOrderData.orderid} updated successfully to ${normalizedStatus}`);
    } catch (error) {
      console.error('Error updating order:', error);
      throw error;
    }
  }, [fetchOrderData]);

  // Updated invoice selection to handle new structure
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
              change
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
          orders: {
            totalamount: transformedOrderItems[0]?.orders?.totalamount,
            orderstatus: transformedOrderItems[0]?.orders?.orderstatus,
            amount_paid: transformedOrderItems[0]?.orders?.amount_paid,
            change: transformedOrderItems[0]?.orders?.change
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
              <div className="loading-state">
                <div className="loading-spinner"></div>
                <p>Loading sales data...</p>
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

                <StatsContainer 
                  totalEarnings={totalEarnings}
                  totalCustomers={totalCustomers}
                  statsFilter={statsFilter}
                  onStatsFilterChange={handleStatsFilter}
                  orderData={orderData}
                />
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
      />
    </div>
  );
};

export default TablePage;