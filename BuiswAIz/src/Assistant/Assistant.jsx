import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import "../stylecss/Assistant.css";
import AssistantChat from "./AssistantChat";

const Assistant = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);

    useEffect(() => {
        let heartbeat;
        let authUserId;
        let subscription;

        const releaseLock = async () => {
            try {
                if (authUserId) {
                await supabase
                    .from("assistant_lock")
                    .update({ locked_by: null, locked_at: null })
                    .eq("id", 1)
                    .eq("locked_by", authUserId);
                }
            } catch (error) {
                console.error("Error releasing lock:", error);
            } finally {
                if (heartbeat) clearInterval(heartbeat);
            }
        };

        const getUserAndLock = async () => {
            try {
                    // 1️⃣ Get current auth user
                    const {data: { user: authUser },error: authError,} = await supabase.auth.getUser();
                    if (authError || !authUser) {
                        navigate("/");
                        return;
                    }
                    authUserId = authUser.id;

                    // 2️⃣ Try to acquire lock via RPC
                    const { data: lockAcquired, error: lockError } = await supabase.rpc(
                        "acquire_assistant_lock",
                        { p_user_id: authUserId }
                    );

                    if (lockError) {
                        console.error("Error acquiring lock:", lockError);
                        return;
                    }

                if (!lockAcquired) {
                    alert("Someone is currently accessing the assistant page.");
                    navigate("/inventory");
                    return;
                }

                // 3️⃣ Fetch user profile
                const { data: profile } = await supabase
                    .from("systemuser")
                    .select("*")
                    .eq("userid", authUserId)
                    .single();
                    setUser(profile || null);

                // 4️⃣ Heartbeat every 30 seconds
                heartbeat = setInterval(async () => {
                    const { data: stillHasLock, error: hbError } = await supabase.rpc("acquire_assistant_lock",{ p_user_id: authUserId });

                    if (hbError) {
                        console.error("Error refreshing lock:", hbError);
                    }
                    if (!stillHasLock) {
                        alert("You lost the lock. Redirecting...");
                        clearInterval(heartbeat);
                        navigate("/inventory");
                    }
                }, 30000);
            } catch (err) {
                console.error("Unexpected error in getUserAndLock:", err);
            }
        };

        getUserAndLock();

        // 🔹 Listen for auth/account changes
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session || session.user.id !== authUserId) {
                releaseLock();
            }
        });
        subscription = data.subscription;

        const handleBeforeUnload = () => {
            releaseLock();
        };
        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            releaseLock();
            subscription?.unsubscribe();
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [navigate]);

    return (
        <div className="assistant-page">
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
                            <li onClick={() => navigate("/TablePage")}>Sales</li>
                            <li onClick={() => navigate("/expenses")}>Expenses</li>
                            <li className="active">AI Assistant</li>
                        </ul>
                        <p className="nav-header">SUPPORT</p>
                        <ul>
                            <li>Help</li>
                            <li>Settings</li>
                        </ul>
                    </div>
                </aside>

                <div className="A-main-content">
                    <div className="assistant-panel">
                        <div className="panel-header">
                            <h2 className="panel-title">BuiswAIz Assistant</h2>
                            <div className="panel-action">
                                <button className="print-reports">Print Reports</button>
                            </div>
                        </div>
                        <div className="table-container">
                            <table></table>
                        </div>
                    </div>
                    <div className="A-right-panel">
                        <div className="A-user-info-card">
                            <div className="A-user-left">
                                <div className="A-user-avatar" />
                                <div className="A-user-username">
                                    {user ? user.username : "Loading..."}
                                </div>
                            </div>
                            <button
                                className="logout-button"
                                onClick={async () => {
                                    await supabase.auth.signOut();
                                    localStorage.clear();
                                    navigate("/"); // redirect to login
                                }}
                            >
                                Logout
                            </button>
                        </div>
                        <AssistantChat />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Assistant;
