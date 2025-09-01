import React, { useEffect, useState } from 'react';
import { useNavigate } from "react-router-dom";
import { supabase } from './supabase';
import OrderSales from './components/OrderSales';
import Bestseller from './components/Bestseller';
import StatsContainer from './components/StatsContainer';
import InvoiceModal from './components/InvoiceModal';
import AddSaleModal from './components/AddSaleModal';
import './stylecss/TablePage.css';

const TablePage = () => {
  const navigate = useNavigate();
  const [orderData, setOrderData] = useState([]);
  const [bestsellers, setBestsellers] = useState([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [statsFilter, setStatsFilter] = useState('all');
  const [showAddSaleModal, setShowAddSaleModal] = useState(false);
  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        window.location.href = '/'; // redirect to login
        return;
      }
      
      const { data: profile, error: profileError } = await supabase
        .from('systemuser')
        .select('*')
        .eq('userid', user.id)
        .single();
      
      if (profileError) {
        console.error("Error fetching user profile:", profileError);
        return;
      }
      
      setUser(profile);
    };
    
    getUser();
    fetchOrderData();
    fetchProducts();
  }, []);

  // Update stats based on filter
  useEffect(() => {
    updateStatsData(orderData, statsFilter);
  }, [orderData, statsFilter]);

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('productid, productname, price, currentstock')
      .order('productname');

    if (error) {
      console.error('Error fetching products:', error.message);
    } else {
      setProducts(data);
    }
  };

  const fetchOrderData = async () => {
    const { data, error } = await supabase
      .from('orderitems')
      .select(`
        orderid,
        productid,
        quantity,
        unitprice,
        subtotal,
        createdat,
        products (productname, image_url),
        orders (totalamount, orderstatus)
      `);

    if (error) {
      console.error('Error fetching order data:', error.message);
    } else {
      setOrderData(data);

      // Calculate bestsellers
      const summary = {};
      data.forEach(item => {
        const id = item.productid;
        const name = item.products?.productname || 'Unknown';
        const imageUrl = item.products?.image_url || '';

        if (!summary[id]) {
          summary[id] = {
            productid: id,
            productname: name,
            image_url: imageUrl,
            totalQuantity: 0,
            timesBought: new Set(),
          };
        }

        summary[id].totalQuantity += item.quantity;
        summary[id].timesBought.add(item.orderid);
      });

      const bestsellersArray = Object.values(summary).map(item => ({
        ...item,
        timesBought: item.timesBought.size,
      }));

      bestsellersArray.sort((a, b) => b.totalQuantity - a.totalQuantity);
      setBestsellers(bestsellersArray);
    }

    setLoading(false);
  };

  const updateStatsData = (data, timeFilter) => {
    const now = new Date();

    const filteredData = data.filter(item => {
      const date = new Date(item.createdat);
      
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

    const filteredEarnings = filteredData.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    setTotalEarnings(filteredEarnings);

    const filteredUniqueOrderIds = new Set(filteredData.map(item => item.orderid));
    setTotalCustomers(filteredUniqueOrderIds.size);
  };

  const handleStatsFilter = (e) => {
    setStatsFilter(e.target.value);
  };

  const handleAddSale = () => {
    setShowAddSaleModal(true);
  };

  const handleCloseAddSaleModal = () => {
    setShowAddSaleModal(false);
  };

  // Generate unique order ID - sequential integer starting from 1
  const generateUniqueOrderId = async () => {
    try {
      // Get the highest existing order ID
      const { data, error } = await supabase
        .from('orders')
        .select('orderid')
        .order('orderid', { ascending: false })
        .limit(1);
      
      if (error) {
        console.error('Error fetching highest order ID:', error);
        throw new Error(`Database error while fetching order IDs: ${error.message}`);
      }
      
      // If no orders exist, start with 1
      if (!data || data.length === 0) {
        return 1;
      }
      
      // Get the highest order ID and add 1
      const highestOrderId = parseInt(data[0].orderid);
      if (isNaN(highestOrderId)) {
        // If somehow the existing orderid is not a number, start from 1
        console.warn('Found non-numeric order ID, starting from 1');
        return 1;
      }
      
      return highestOrderId + 1;
      
    } catch (error) {
      console.error('Error in generateUniqueOrderId:', error);
      throw error;
    }
  };

  // Check stock availability for all products in the sale
  const checkStockAvailability = async (salesDataArray) => {
    const stockErrors = [];
    
    for (const saleData of salesDataArray) {
      if (!saleData.isCustomProduct) {
        // Get current stock for existing products
        const { data: product, error } = await supabase
          .from('products')
          .select('productid, productname, currentstock')
          .eq('productname', saleData.productname)
          .single();

        if (error) {
          stockErrors.push(`Error checking stock for "${saleData.productname}": ${error.message}`);
          continue;
        }

        if (!product) {
          stockErrors.push(`Product "${saleData.productname}" not found`);
          continue;
        }

        if (product.currentstock < saleData.quantity) {
          if (product.currentstock === 0) {
            stockErrors.push(`"${saleData.productname}" is out of stock`);
          } else {
            stockErrors.push(`"${saleData.productname}" has insufficient stock. Available: ${product.currentstock}, Required: ${saleData.quantity}`);
          }
        }
      }
    }

    return stockErrors;
  };

  // Update inventory stock
  const updateInventoryStock = async (salesDataArray) => {
    const updates = [];
    
    for (const saleData of salesDataArray) {
      if (!saleData.isCustomProduct) {
        const { data: product, error } = await supabase
          .from('products')
          .select('productid, currentstock')
          .eq('productname', saleData.productname)
          .single();

        if (error || !product) {
          throw new Error(`Failed to get product info for "${saleData.productname}"`);
        }

        const newStock = product.currentstock - saleData.quantity;
        updates.push({
          productid: product.productid,
          currentstock: newStock,
          updatedstock: new Date().toISOString()
        });
      }
    }

    // Update all stock levels
    for (const update of updates) {
      const { error } = await supabase
        .from('products')
        .update({
          currentstock: update.currentstock,
          updatedstock: update.updatedstock
        })
        .eq('productid', update.productid);

      if (error) {
        throw new Error(`Failed to update stock: ${error.message}`);
      }
    }
  };

  const handleSaveSale = async (salesDataArray) => {
    try {
      // First, check stock availability
      const stockErrors = await checkStockAvailability(salesDataArray);
      if (stockErrors.length > 0) {
        alert(`Stock validation failed:\n\n${stockErrors.join('\n')}`);
        return;
      }

      // Generate unique order ID with better error handling
      let uniqueOrderId;
      try {
        uniqueOrderId = await generateUniqueOrderId();
      } catch (error) {
        console.error('Failed to generate unique order ID:', error);
        alert(`Error generating order ID: ${error.message}`);
        return;
      }
      
      // Update all sales data with the generated order ID
      salesDataArray = salesDataArray.map(item => ({
        ...item,
        orderid: uniqueOrderId
      }));

      // Calculate total amount for the order
      const totalAmount = salesDataArray.reduce((sum, item) => sum + item.subtotal, 0);
      const orderDate = salesDataArray[0].createdat;

      // Create order in orders table with 'completed' status
      const { error: orderCreateError } = await supabase
        .from('orders')
        .insert([{
          orderid: uniqueOrderId,
          totalamount: totalAmount,
          orderdate: orderDate,
          orderstatus: 'completed' // Automatically set to completed
        }]);

      if (orderCreateError) {
        console.error('Error creating order:', orderCreateError);
        alert(`Error creating order: ${orderCreateError.message}`);
        return;
      }

      const orderItemsToInsert = [];
      let newProductsCreated = false;

      // Process each product in the array
      for (const saleData of salesDataArray) {
        let productId;

        if (saleData.isCustomProduct) {
          // Create new product with initial stock of 0
          const { data: newProduct, error: productCreateError } = await supabase
            .from('products')
            .insert([{
              productname: saleData.productname.trim(),
              price: saleData.unitprice,
              currentstock: 0, // Start with 0 since we're selling immediately
              updatedstock: new Date().toISOString()
            }])
            .select('productid')
            .single();

          if (productCreateError) {
            console.error('Error creating product:', productCreateError);
            alert(`Error creating product: ${productCreateError.message}`);
            return;
          }

          productId = newProduct.productid;
          newProductsCreated = true;
        } else {
          // Get existing product ID
          const { data: existingProduct, error: productCheckError } = await supabase
            .from('products')
            .select('productid')
            .eq('productname', saleData.productname)
            .single();

          if (productCheckError) {
            console.error('Error checking product:', productCheckError);
            alert(`Error finding product "${saleData.productname}": ${productCheckError.message}`);
            return;
          }

          productId = existingProduct.productid;
        }

        // Add to order items array
        orderItemsToInsert.push({
          orderid: saleData.orderid,
          productid: productId,
          quantity: saleData.quantity,
          unitprice: saleData.unitprice,
          subtotal: saleData.subtotal,
          createdat: saleData.createdat
        });
      }

      // Insert all order items at once
      const { error: orderError } = await supabase
        .from('orderitems')
        .insert(orderItemsToInsert);

      if (orderError) {
        console.error('Error adding sales:', orderError);
        alert(`Error adding sales: ${orderError.message}`);
        return;
      }

      // Update inventory stock for existing products
      await updateInventoryStock(salesDataArray);



      // Refresh data
      await fetchOrderData();
      if (newProductsCreated) {
        await fetchProducts(); // Refresh products list if new products were created
      }
      
      alert(`Successfully added ${salesDataArray.length} product${salesDataArray.length > 1 ? 's' : ''} to the completed sale!\n\nOrder ID: ${uniqueOrderId}`);
    } catch (error) {
      console.error('Unexpected error adding sales:', error);
      alert('Unexpected error occurred. Check console for details.');
    }
  };

  const handleInvoiceSelect = async (selectedItem) => {
    try {
      // Fetch all items for the same order
      const { data: orderItems, error } = await supabase
        .from('orderitems')
        .select(`
          orderid,
          productid,
          quantity,
          unitprice,
          subtotal,
          createdat,
          products (productname, image_url),
          orders (totalamount, orderstatus)
        `)
        .eq('orderid', selectedItem.orderid);

      if (error) {
        console.error('Error fetching order items:', error);
        alert('Error loading invoice details');
        return;
      }

      // Set the complete order data for the invoice
      setSelectedInvoice({
        ...selectedItem,
        orderItems: orderItems,
        totalOrderAmount: orderItems[0]?.orders?.totalamount || 0,
        orderStatus: orderItems[0]?.orders?.orderstatus || 'unknown'
      });
    } catch (error) {
      console.error('Error loading invoice:', error);
      alert('Error loading invoice details');
    }
  };

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
              <li>Expenses</li>
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
              <p>Loading...</p>
            ) : orderData.length === 0 ? (
              <p>No data available.</p>
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
                      <button className="logout-button"
                        onClick={async () => {
                          await supabase.auth.signOut();
                          localStorage.clear();
                          window.location.href = '/'; // redirect to login
                        }}
                      >Logout</button>
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