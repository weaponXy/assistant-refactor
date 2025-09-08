// src/services/supabaseUploader.js

import { supabase } from '../supabase';

// Helper: Convert Excel serial date to ISO
function excelDateToISO(serial) {
  const excelEpoch = new Date(1899, 11, 30);
  const msOffset = serial * 86400000;
  return new Date(excelEpoch.getTime() + msOffset).toISOString();
}

export const uploadToSupabase = async (parsedData) => {
  try {
    // 1. Fetch the latest orderid in Supabase
    const { data: existingOrders, error: fetchError } = await supabase
      .from("orders")
      .select("orderid")
      .order("orderid", { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;

    let nextOrderId = existingOrders.length > 0 ? existingOrders[0].orderid + 1 : 1;

    // 2. Group rows by OrderID
    const groupedOrders = {};
    for (const row of parsedData) {
      const originalOrderId = row.OrderID;
      if (!groupedOrders[originalOrderId]) {
        groupedOrders[originalOrderId] = [];
      }
      groupedOrders[originalOrderId].push(row);
    }

    // 3. Upload each grouped order
    for (const group of Object.values(groupedOrders)) {
      const orderDate = excelDateToISO(group[0].orderdate);
      const orderStatus = group[0].orderstatus;
      const createdAt = new Date().toISOString();

      const totalAmount = group.reduce((sum, item) => sum + Number(item.subtotal), 0);

      // Insert into orders
      const { error: orderInsertError } = await supabase.from("orders").insert([
        {
          orderid: nextOrderId,
          orderdate: orderDate,
          totalamount: totalAmount,
          orderstatus: orderStatus,
          createdat: createdAt,
          updatedat: createdAt,
        },
      ]);

      if (orderInsertError) throw orderInsertError;

      // Insert into orderitems
      const orderItems = group.map((item) => ({
        orderid: nextOrderId,
        productid: item.ProductID,
        quantity: item.quantity,
        unitprice: item.unitprice,
        subtotal: item.subtotal,
        createdat: createdAt,
        updatedat: createdAt,
      }));

      const { error: itemsInsertError } = await supabase.from("orderitems").insert(orderItems);

      if (itemsInsertError) throw itemsInsertError;

      nextOrderId++;
    }

    return { success: true };
  } catch (error) {
    console.error("Upload to Supabase failed:", error);
    return { success: false, error };
  }
};
