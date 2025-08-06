import { supabase } from "../supabase";

const deletionTimers = {};

export const updateDefectStatus = async (defectiveItemId, newStatus, user) => {
  const { error: updateError } = await supabase
    .from("defectiveitems")
    .update({ status: newStatus })
    .eq("defectiveitemid", defectiveItemId);

  if (updateError) {
    console.error("Error updating defect status:", updateError.message);
    throw updateError;
  }


  //Fetch product name using defectiveItemId → productid → productname
  const { data: defectData, error: defectFetchError } = await supabase


    .from("defectiveitems")
    .select("productid, products(productname)")
    .eq("defectiveitemid", defectiveItemId)
    .single();


  if (defectFetchError) {
    console.error("Error fetching defect product:", defectFetchError.message);
    return;
  }

  const productName = defectData?.products?.productname || "Unknown Product";

  // Log activity
  if (user) {
    await supabase.from("activitylog").insert([
      {
        action_type: "update_defect_status",
        action_desc: `updated status of ${productName} to ${newStatus}`,
        done_user: user.userid,
      },
    ]);
  }

  // Handle deletion for "Returned"
  if (newStatus === "Returned") {
    clearTimeout(deletionTimers[defectiveItemId]);

    deletionTimers[defectiveItemId] = setTimeout(() => {
      (async () => {
        const { data, error: fetchError } = await supabase
          .from("defectiveitems")
          .select("status")
          .eq("defectiveitemid", defectiveItemId)
          .single();

        if (fetchError) {
          console.error("Error checking defect status before delete:", fetchError.message);
          return;
        }

        if (data?.status === "Returned") {
          const { error: deleteError } = await supabase
            .from("defectiveitems")
            .delete()
            .eq("defectiveitemid", defectiveItemId);

          if (!deleteError) {
            console.log(`Defect item ${defectiveItemId} deleted after delay.`);


            if (user) {
              const { error: logError } = await supabase.from("activitylog").insert([
                {
                  action_type: "return_defect",
                  action_desc: `Successfully returned ${productName} to the supplier.`,
                  done_user: user.userid,
                },
              ]);

              if (logError) {
                console.error("Error logging return action:", logError.message);
              }
            }
          } else {
            console.error("Error deleting returned defect:", deleteError.message);
          }
        }
      })();
    }, 15000); 
  } else {
    clearTimeout(deletionTimers[defectiveItemId]);
    delete deletionTimers[defectiveItemId];
  }
};
