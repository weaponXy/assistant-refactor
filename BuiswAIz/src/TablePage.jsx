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
  }, []);

  // Update stats based on filter
  useEffect(() => {
    updateStatsData(orderData, statsFilter);
  }, [orderData, statsFilter]);

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
        products (productname, image_url)
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

  const handleSaveSale = async (saleData) => {
    try {
      const normalizedProductName = saleData.productname.trim().toLowerCase();

      // First, check if product exists (normalize the name for consistency)
      const { data: existingProduct, error: productCheckError } = await supabase
        .from('products')
        .select('productid')
        .ilike('productname', normalizedProductName) // case-insensitive match
        .single();

      let productId;

      if (productCheckError && productCheckError.code === 'PGRST116') {
        // Product doesn't exist, create it
        const { data: newProduct, error: productCreateError } = await supabase
          .from('products')
          .insert([{
            productname: normalizedProductName,
            image_url: null
          }])
          .select('productid')
          .single();

        if (productCreateError) {
          console.error('Error creating product:', productCreateError);
          alert(`Error creating product: ${productCreateError.message}`);
          return;
        }

        productId = newProduct.productid;
      } else if (productCheckError) {
        console.error('Error checking product:', productCheckError);
        alert(`Error checking product: ${productCheckError.message}`);
        return;
      } else {
        productId = existingProduct.productid;
      }

      // Insert the order item
      const { error: orderError } = await supabase
        .from('orderitems')
        .insert([{
          orderid: saleData.orderid.trim(),
          productid: productId,
          quantity: saleData.quantity,
          unitprice: saleData.unitprice,
          subtotal: saleData.subtotal,
          createdat: saleData.createdat
        }]);

      if (orderError) {
        console.error('Error adding sale:', orderError);
        alert(`Error adding sale: ${orderError.message}`);
        return;
      }

      await fetchOrderData();
      alert('Sale added successfully!');
    } catch (error) {
      console.error('Unexpected error adding sale:', error);
      alert('Unexpected error occurred. Check console for details.');
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
              <p>Loading...</p>
            ) : orderData.length === 0 ? (
              <p>No data available.</p>
            ) : (
              <>
                <div className="table-flex-wrapper">
                  <OrderSales 
                    orderData={orderData}
                    onInvoiceSelect={setSelectedInvoice}
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
      />
    </div>
  );
};

export default TablePage;