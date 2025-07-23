import { supabase } from "../supabase";

export async function fetchSupplier() {
  const { data, error } = await supabase
    .from("suppliers")
    .select(`*`)
    .order("supplierid", { descending: false }); 

  if (error) {
    console.error("Fetch error:", error);
    throw error;
  }

  return data;
}