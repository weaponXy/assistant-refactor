import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import "../stylecss/RestockStorage.css";
import RestockProduct from "./RestockProduct";

const RestockStorage = ({ onClose, user }) => {
    const [storageData, setStorageData] = useState([]);
    const [showAdd, setShowAdd] = useState(false);
    
    useEffect(() => {
        fetchStorage();
    }, []);

    const fetchStorage = async () => {
        const { data, error } = await supabase
        .from("restockstorage")
        .select(`
            restockid,
            new_stock,
            new_cost,
            new_price,
            created_at,
            products ( productid, productname, currentstock, reorderpoint),
            suppliers ( suppliername )
        `);

        if (error) console.error(error);
        else setStorageData(data);
    };

    const handleConsumeRestock = async (restock) => {
        const productId = restock.products?.productid;
        const productName = restock.products?.productname || "Unknown";
        const currentStock = restock.products?.currentstock ?? 0;

        if (!productId) {
            alert("Cannot inherit: Product ID not found");
            return;
        }

        if (currentStock > 0) {
            alert("Cannot inherit: Product still has stock");
            return;
        }

        try {
            const { error } = await supabase.rpc("consume_restock_manual", { 
                p_productid: productId,  
            });

            if (error) {
                console.error("Error consuming restock:", error);
                alert("Failed to consume restock.");
            } else {
                await supabase.from("activitylog").insert({
                    action_desc: `Succesfully restocked ${productName}`,
                    done_user: user?.userid || null
                });

                fetchStorage(); 
            }
        } catch (err) {
            console.error("Unexpected error:", err);
        }
    };



    return (
        <div className="modal-overlay">
            <div className="modal-window">
                {!showAdd ? (
                <>
                    <h2>Restock Storage</h2>
                    <button onClick={() => setShowAdd(true)} className="restock-btn">Restock+</button>
                    <button onClick={onClose} className="close-btn">X</button>
                    <div className="restock-panel">
                        <table className="restock-table">
                            <thead>
                                <tr>
                                <th>Product</th>
                                <th>Quantity</th>
                                <th>Cost</th>
                                <th>Price</th>
                                <th>Supplier</th>
                                <th>Date</th>
                                <th>Stock</th>
                                <th> </th>
                                </tr>
                            </thead>
                            <tbody>
                                {storageData.map((restock) => {
                                    const current = restock.products?.currentstock ?? 0;
                                    const reorder = restock.products?.reorderpoint ?? 0;
                                    const isLow = current < reorder;

                                    return (
                                        <tr key={restock.restockid}>
                                            <td>{restock.products?.productname || "Unknown"}</td>
                                            <td>{restock.new_stock}</td>
                                            <td>{restock.new_cost}</td>
                                            <td>{restock.new_price}</td>
                                            <td>{restock.suppliers?.suppliername || "Unknown"}</td>
                                            <td>{new Date(restock.created_at).toLocaleDateString()}</td>
                                            <td>    
                                                <span className={isLow ? "stock-low" : "stock-ok"}>{current}</span>
                                            </td>
                                             <td>
                                                <button
                                                    className="restock-btn"
                                                    onClick={() => handleConsumeRestock(restock)}>
                                                    Inherit
                                                </button>
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                        </table>
                    </div>
                </>
                ) : (
                <RestockProduct
                    onClose={() => setShowAdd(false)}
                    onSuccess={() => {
                    setShowAdd(false);
                    fetchStorage();
                    }}
                    user={user}
                />
                )}
            </div>
        </div>
    );
};

export default RestockStorage;
