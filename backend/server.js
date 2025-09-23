import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import sharp from "sharp";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL }));
// Only apply JSON parser for non-file routes
app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/api/update-product")) {
    return next(); // skip JSON parsing for update-product (it uses multer)
  }
  express.json()(req, res, next);
});


// Initialize Supabase client using ANON key
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const upload = multer({ storage: multer.memoryStorage() });

// Health check route
app.get("/", (req, res) => {
  res.send("Backend is running");
});

// TODO: Add your API routes here (e.g., /api/add-product, /api/get-products)
app.post("/api/add-product", upload.single("image"), async (req, res) => {
  try {
    const { productname, description, suppliername, categories, userid } = req.body;

    if (!productname || !description || !suppliername || !categories?.length) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // Find supplier
    const { data: supplierData, error: supplierError } = await supabase
      .from("suppliers")
      .select("supplierid")
      .eq("suppliername", suppliername)
      .single();

    if (supplierError || !supplierData) {
      return res.status(404).json({ error: "Supplier not found." });
    }

    // Handle image upload + compression
    let imageUrl = "";
    if (req.file) {
      // Compress image (resize + webp to reduce size to KB range)
      const compressedBuffer = await sharp(req.file.buffer)
        .resize(800) // scale down large images
        .webp({ quality: 70 }) // compress to webp
        .toBuffer();

      const filePath = `${Date.now()}_${req.file.originalname}.webp`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, compressedBuffer, {
          contentType: "image/webp",
        });

      if (uploadError) {
        return res.status(500).json({ error: "Failed to upload image." });
      }

      const { data: publicData } = supabase.storage
        .from("product-images")
        .getPublicUrl(filePath);

      imageUrl = publicData.publicUrl;
    }

    // Insert product
    const { data: productData, error: productError } = await supabase
      .from("products")
      .insert([
        {
          productname,
          description,
          supplierid: supplierData.supplierid,
          image_url: imageUrl,
        },
      ])
      .select("productid")
      .single();

    if (productError) {
      return res.status(500).json({ error: "Failed to create product." });
    }

    // Parse categories if JSON string (from FormData)
    let parsedCategories = categories;
    if (typeof categories === "string") {
      parsedCategories = JSON.parse(categories);
    }

    // Insert categories
    const categoryInserts = parsedCategories.map((cat) => ({
      productid: productData.productid,
      color: cat.color,
      agesize: cat.agesize,
      cost: parseFloat(cat.cost) || 0,
      price: parseFloat(cat.price) || 0,
      currentstock: parseInt(cat.currentstock) || 0,
      reorderpoint: parseInt(cat.reorderpoint) || 0,
    }));

    const { error: catError } = await supabase
      .from("productcategory")
      .insert(categoryInserts);

    if (catError) {
      return res.status(500).json({ error: "Failed to add categories." });
    }

    // Log activity
    if (userid) {
      await supabase.from("activitylog").insert([
        {
          action_type: "add_product",
          action_desc: `added ${productname} with ${categoryInserts.length} categories`,
          done_user: userid,
        },
      ]);
    }

    return res
      .status(200)
      .json({ message: "Product added successfully.", imageUrl });
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

app.post("/api/update-product", upload.single("image"), async (req, res) => {
  try {
    const { productid, productname, description, supplierid, userid } = req.body;

    if (!productid || !productname || !description || !supplierid) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    let imageUrl = null;

    if (req.file) {
      // 1. Get old image from database
      const { data: oldProduct, error: fetchError } = await supabase
        .from("products")
        .select("image_url")
        .eq("productid", productid)
        .single();

      if (fetchError) {
        console.error(fetchError);
      }

      // 2. Delete old image from Supabase storage
      if (oldProduct?.image_url) {
        const oldPath = oldProduct.image_url.split("/").pop(); // extract filename
        await supabase.storage.from("product-images").remove([oldPath]);
      }

      // 3. Compress and upload new image
      const compressedBuffer = await sharp(req.file.buffer)
        .resize(800, null, { fit: "inside" }) // resize width max 800px
        .jpeg({ quality: 60 }) // compress to reduce size
        .toBuffer();

      const filePath = `${Date.now()}_${req.file.originalname}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, compressedBuffer, { contentType: "image/jpeg" });

      if (uploadError) return res.status(500).json({ error: "Failed to upload image." });

      const { data: publicData } = supabase.storage
        .from("product-images")
        .getPublicUrl(filePath);

      imageUrl = publicData.publicUrl;
    }

    // 4. Update product in DB
    const { error: updateError } = await supabase
      .from("products")
      .update({
        productname,
        description,
        supplierid,
        ...(imageUrl && { image_url: imageUrl }),
      })
      .eq("productid", productid);

    if (updateError) return res.status(500).json({ error: "Failed to update product." });

    // 5. Log activity
    if (userid) {
      await supabase.from("activitylog").insert([
        {
          action_type: "update_product",
          action_desc: `updated ${productname}`,
          done_user: userid,
        },
      ]);
    }

    res.status(200).json({ message: "Product updated successfully.", imageUrl });
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

app.get("/api/categories/:productid", async (req, res) => {
  try {
    const productid = parseInt(req.params.productid);
    if (isNaN(productid)) return res.status(400).json({ error: "Invalid product ID" });

    const { data, error } = await supabase
      .from("productcategory")
      .select("productcategoryid, price, cost, color, agesize, currentstock, reorderpoint")
      .eq("productid", productid);

    if (error) {
      console.error("Supabase error fetching categories:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data || []);
  } catch (err) {
    console.error("Server exception:", err);
    res.status(500).json({ error: "Server error" });
  }
});



// Get all products
app.get("/api/products", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("productid, productname")
      .order("productname");

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Add defective item
app.post("/api/add-defective-item", async (req, res) => {
  try {
    const { productid, productcategoryid, quantity, status, defectdescription, reporteddate, userid } = req.body;

    if (!productid || !productcategoryid || !quantity || !status || !reporteddate) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // Fetch category stock
    const { data: category, error: catErr } = await supabase
      .from("productcategory")
      .select("currentstock")
      .eq("productcategoryid", productcategoryid)
      .single();

    if (catErr || !category) return res.status(400).json({ error: "Category not found." });

    if (parseInt(quantity) > category.currentstock) {
      return res.status(400).json({ error: "Quantity exceeds current stock." });
    }

    // Insert defective item
    const { error: insertErr } = await supabase
      .from("defectiveitems")
      .insert([{
        productid,
        productcategoryid, // use correct column name
        quantity,
        status,
        defectdescription,
        reporteddate
      }]);

    if (insertErr) return res.status(500).json({ error: insertErr.message || JSON.stringify(insertErr) });

    // Update stock
    const { error: updateErr } = await supabase
      .from("productcategory")
      .update({ currentstock: category.currentstock - quantity })
      .eq("productcategoryid", productcategoryid);

    if (updateErr) return res.status(500).json({ error: updateErr.message || JSON.stringify(updateErr) });

    // Log activity
    if (userid) {
      await supabase.from("activitylog").insert([{
        action_type: "add_defect",
        action_desc: `added ${quantity} defective item(s) for product ${productid}, category ${productcategoryid}`,
        done_user: userid
      }]);
    }

    res.status(200).json({ message: "Defective item added successfully." });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Server error." });
  }
});

// POST /api/restock
app.post("/api/restock", async (req, res) => {
  const {
    productid,
    productcategoryid,
    supplierid,
    new_stock,
    new_cost,
    new_price,
    batchCode,
    datereceived,
    user,
  } = req.body;

  try {
    // Insert restockstorage
    const { error: restockError } = await supabase.from("restockstorage").insert([
      {
        productid,
        productcategoryid,
        supplierid,
        new_stock,
        new_cost,
        new_price,
        batchCode,
        datereceived,
      },
    ]);

    if (restockError) throw restockError;

    // Add expense
    const totalExpense = parseInt(new_stock, 10) * parseFloat(new_cost);
    const expenseDate = new Date();

    await supabase.from("expenses").insert([
      {
        expensedate: expenseDate.toISOString(),
        amount: totalExpense,
        description: `Restock of productid ${productid}`,
        category: "Inventory",
        createdbyuserid: user?.userid || null,
      },
    ]);

    // Add log
    await supabase.from("activitylog").insert([
      {
        action_desc: `Stored productid ${productid} to the storage`,
        done_user: user?.userid || null,
      },
    ]);

    res.status(200).json({ success: true, message: "Restock added successfully" });
  } catch (err) {
    console.error("Restock API error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});




app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
