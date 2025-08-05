import { supabase } from "../supabase";

// Keep track of timeouts per item
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
  console.log("Logging action by user:", user);
  
  if (user) {
    await supabase.from("activitylog").insert([
      {
        action_type: "update_defect_status",
        action_desc: `updated status of defect ${defectiveItemId} to ${newStatus}`,
        done_user: user.userid,
      },
    ]);
  }

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
            console.log(`Defect item ${defectiveItemId} deleted after 1 minute.`);

            if (user) {
              // ✅ Now this should actually run as expected
              const { error: logError } = await supabase.from("activitylog").insert([
                {
                  action_type: "return_defect",
                  action_desc: `Successfully returned defective ${defectiveItemId} to the supplier.`,
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

