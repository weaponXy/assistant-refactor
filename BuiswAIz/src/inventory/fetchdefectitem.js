// inventory/fetchDefectiveItems.js
import { supabase } from "../supabase";

export const fetchDefectiveItems = async () => {
  const { data, error } = await supabase
    .from("defectiveitems")
    .select(`
      defectiveitemid,
      productid,
      defectdescription,
      status,
      reporteddate,
      quantity,
      products (
        productname,
        image_url
      )
    `)
    .order("updatedat", { ascending: false });

  if (error) {
    console.error("Error fetching defective items:", error);
    return [];
  }

  return data;
};
