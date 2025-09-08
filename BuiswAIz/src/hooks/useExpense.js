import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export function useExpenses() {
  const [expenses, setExpenses] = useState([]);

  const fetchExpenses = async () => {
    const { data, error } = await supabase.from("expenses").select("*");
    if (error) console.error("Error fetching expenses:", error);
    else setExpenses(data);
  };

  const addExpense = async (expense, userId) => {
    const { error } = await supabase.from("expenses").insert([{
      ...expense,
      amount: parseFloat(expense.amount),
      createdbyuserid: userId,
    }]);
    if (error) throw error;
    fetchExpenses();
  };

  const updateExpense = async (id, expense) => {
    const { error } = await supabase.from("expenses")
      .update({
        ...expense,
        amount: parseFloat(expense.amount),
      })
      .eq("expenseid", id);
    if (error) throw error;
    fetchExpenses();
  };

  const deleteExpense = async (id) => {
    const { error } = await supabase.from("expenses").delete().eq("expenseid", id);
    if (error) throw error;
    fetchExpenses();
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  return { expenses, addExpense, updateExpense, deleteExpense };
}
