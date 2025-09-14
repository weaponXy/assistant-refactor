import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

// Initialize Supabase client using ANON key
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Health check route
app.get("/", (req, res) => {
  res.send("Backend is running");
});

// TODO: Add your API routes here (e.g., /api/add-product, /api/get-products)
app.post("/api/add-product", async (req, res) => {
  try {
    const { productname, description, suppliername, categories, userid, imageBase64, imageName } = req.body;

    if (!productname || !description || !suppliername || !categories?.length) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // Find supplier
    const { data: supplierData, error: supplierError } = await supabase
      .from("suppliers")
      .select("supplierid")
      .eq("suppliername", suppliername)
      .single();

    if (supplierError || !supplierData) return res.status(404).json({ error: "Supplier not found." });

    // Upload image if provided
    let imageUrl = "";
    if (imageBase64 && imageName) {

        const buffer = Buffer.from(imageBase64, "base64");
        const fileExt = imageName.split(".").pop();
        const filePath = `${Date.now()}_${imageName}`;

        const { error: uploadError } = await supabase.storage
            .from("product-images")
            .upload(filePath, buffer, { contentType: `image/${fileExt}` });

        if (uploadError) return res.status(500).json({ error: "Failed to upload image." });

        const { data: publicData } = supabase.storage.from("product-images").getPublicUrl(filePath);
        imageUrl = publicData.publicUrl;
    }


    // Insert product
    const { data: productData, error: productError } = await supabase
      .from("products")
      .insert([{ productname, description, supplierid: supplierData.supplierid, image_url: imageUrl }])
      .select("productid")
      .single();

    if (productError) return res.status(500).json({ error: "Failed to create product." });

    // Insert categories
    const categoryInserts = categories.map((cat) => ({
      productid: productData.productid,
      color: cat.color,
      agesize: cat.agesize,
      cost: parseFloat(cat.cost) || 0,
      price: parseFloat(cat.price) || 0,
      currentstock: parseInt(cat.currentstock) || 0,
      reorderpoint: parseInt(cat.reorderpoint) || 0,
    }));

    const { error: catError } = await supabase.from("productcategory").insert(categoryInserts);
    if (catError) return res.status(500).json({ error: "Failed to add categories." });

    // Log activity
    if (userid) {
      await supabase.from("activitylog").insert([
        {
          action_type: "add_product",
          action_desc: `added ${productname} with ${categories.length} categories`,
          done_user: userid,
        },
      ]);
    }

    return res.status(200).json({ message: "Product added successfully." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error." });
  }
});

app.get("/api/get-suppliers", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .eq("supplierstatus", "Active");

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/update-product", async (req, res) => {
  try {
    const { productid, productname, description, supplierid, userid, imageBase64, imageName } = req.body;

    if (!productid || !productname || !description || !supplierid) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    let imageUrl = null;
    if (imageBase64 && imageName) {
      const buffer = Buffer.from(imageBase64, "base64");
      const fileExt = imageName.split(".").pop();
      const filePath = `${Date.now()}_${imageName}`;

      const { error: uploadError } = await supabase.storage.from("product-images").upload(filePath, buffer, { contentType: `image/${fileExt}` });
      if (uploadError) return res.status(500).json({ error: "Failed to upload image." });

      const { data: publicData } = supabase.storage.from("product-images").getPublicUrl(filePath);
      imageUrl = publicData.publicUrl;
    }

    const { error: updateError } = await supabase
      .from("products")
      .update({ productname, description, supplierid, ...(imageUrl && { image_url: imageUrl }) })
      .eq("productid", productid);

    if (updateError) return res.status(500).json({ error: "Failed to update product." });

    // Log activity
    if (userid) {
      await supabase.from("activitylog").insert([
        { action_type: "update_product", action_desc: `updated ${productname}`, done_user: userid },
      ]);
    }

    res.status(200).json({ message: "Product updated successfully." });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error." });
  }
});

app.post("/api/add-category", async (req, res) => {
  try {
    const { productid, color, agesize, cost, price, currentstock, reorderpoint } = req.body;

    if (!productid || !color || !agesize) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const { error } = await supabase.from("productcategory").insert([
      {
        productid,
        color,
        agesize,
        cost: parseFloat(cost) || 0,
        price: parseFloat(price) || 0,
        currentstock: parseInt(currentstock) || 0,
        reorderpoint: parseInt(reorderpoint) || 0,
      },
    ]);

    if (error) return res.status(500).json({ error: "Failed to add category." });

    res.status(200).json({ message: "Category added successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error." });
  }
});

app.post("/api/delete-product", async (req, res) => {
  try {
    const { productid, userid } = req.body;

    if (!productid) {
      return res.status(400).json({ error: "Missing product ID." });
    }

    // Optional: Fetch product name for logging
    const { data: productData, error: fetchError } = await supabase
      .from("products")
      .select("productname")
      .eq("productid", productid)
      .single();

    if (fetchError || !productData) {
      return res.status(404).json({ error: "Product not found." });
    }

    // Delete product
    const { error: deleteError } = await supabase
      .from("products")
      .delete()
      .eq("productid", productid);

    if (deleteError) return res.status(500).json({ error: "Failed to delete product." });

    // Optionally delete related categories
    await supabase.from("productcategory").delete().eq("productid", productid);

    // Log activity
    if (userid) {
      await supabase.from("activitylog").insert([
        {
          action_type: "delete_product",
          action_desc: `Deleted ${productData.productname}`,
          done_user: userid,
        },
      ]);
    }

    res.status(200).json({ message: "Product deleted successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error." });
  }
});



app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
