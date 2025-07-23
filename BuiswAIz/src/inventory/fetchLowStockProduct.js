import { supabase } from "../supabase";

export const fetchLowStockProducts = async () => {
  const { data, error } = await supabase
    .from("products")
    .select("*");

  if (error) {
    console.error("Fetch error:", error);
    return [];
  }

  const lowStock = data
  .filter(p =>
    p.currentstock !== null &&
    p.reorderpoint !== null &&
    Number(p.currentstock) < Number(p.reorderpoint)
  )
  .sort((a, b) =>
    (Number(a.currentstock) - Number(a.reorderpoint)) -
    (Number(b.currentstock) - Number(b.reorderpoint))
  ); 

  return lowStock;
};

