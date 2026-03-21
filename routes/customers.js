import express from "express";
import db from "../db/connection.js";
import { generateCustomerToken } from "../utils/tokenGenerator.js";

const router = express.Router();

// ========================
// CREATE CUSTOMER
// ========================
router.post("/", async (req, res) => {
  const {
    fullName,
    phoneNumber,
    email,
    address,
    package_type,
    packagePrice,
    drivingLessonsPrice,
    learnersFee,
    totalLessons,
    pricePerLesson,
    emergency_contact_name,
    emergency_contact_phone
  } = req.body;

  const bookingToken = generateCustomerToken();
  
  const sql = `
    INSERT INTO customers 
    (fullName, phoneNumber, email, address, package_type, packagePrice, drivingLessonsPrice, learnersFee, totalLessons, pricePerLesson, lessonsUsed, emergency_contact_name, emergency_contact_phone, booking_token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      fullName,
      phoneNumber,
      email,
      address,
      package_type,
      packagePrice,
      drivingLessonsPrice,
      learnersFee,
      totalLessons,
      pricePerLesson,
      emergency_contact_name,
      emergency_contact_phone,
      bookingToken
    ],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      res.status(201).json({ 
        message: "Customer added successfully", 
        customerId: results.insertId, 
        bookingToken: bookingToken
      });
    }
  );
});

// ========================
// SEARCH CUSTOMERS BY NAME
// ========================
router.get("/search", (req, res) => {
  const { name } = req.query;

  if (!name) {
    return res.status(400).json({ message: "Please provide a name to search" });
  }

  const sql = `
    SELECT 
      customerId,
      fullName,
      phoneNumber,
      email,
      address,
      package_type,
      emergency_contact_name,
      emergency_contact_phone
    FROM customers
    WHERE fullName LIKE ?
    ORDER BY fullName
    LIMIT 20
  `;

  const searchTerm = `%${name}%`;

  db.query(sql, [searchTerm], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ 
        message: "Error searching customers", 
        error: err.message 
      });
    }

    res.json(results);
  });
});
// Get all customers (for employer dashboard)
router.get("/all", (req, res) => {
  const sql = `
    SELECT 
      c.customerId,
      c.fullName,
      c.phoneNumber,
      c.email,
      c.package_type,
      c.packagePrice,
      c.drivingLessonsPrice,
      c.learnersFee,
      c.totalLessons,
      c.pricePerLesson,
      c.lessonsUsed,
      c.archived,
      COALESCE(SUM(p.amountPaid), 0) AS totalPaid,
      COALESCE(SUM(p.amountTowardLessons), 0) AS totalTowardLessons,
      COALESCE(SUM(p.amountTowardLearners), 0) AS totalTowardLearners
    FROM customers c
    LEFT JOIN payments p ON c.customerId = p.customerId
    GROUP BY c.customerId
    ORDER BY c.fullName ASC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Archive customer
router.put("/archive/:customerId", (req, res) => {
  const { customerId } = req.params;

  const sql = `UPDATE customers SET archived = 1 WHERE customerId = ?`;

  db.query(sql, [customerId], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Database error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.json({ message: "Customer archived successfully" });
  });
});

// Delete customer (with all related data)
router.delete("/delete/:customerId", (req, res) => {
  const { customerId } = req.params;

  // Start transaction
  db.beginTransaction((err) => {
    if (err) {
      return res.status(500).json({ message: "Database error" });
    }

    // Delete payments
    db.query("DELETE FROM payments WHERE customerId = ?", [customerId], (err1) => {
      if (err1) {
        return db.rollback(() => {
          res.status(500).json({ message: "Error deleting payments" });
        });
      }

      // Delete bookings
      db.query("DELETE FROM bookings WHERE customerId = ?", [customerId], (err2) => {
        if (err2) {
          return db.rollback(() => {
            res.status(500).json({ message: "Error deleting bookings" });
          });
        }

        // Delete customer
        db.query("DELETE FROM customers WHERE customerId = ?", [customerId], (err3, result) => {
          if (err3) {
            return db.rollback(() => {
              res.status(500).json({ message: "Error deleting customer" });
            });
          }

          if (result.affectedRows === 0) {
            return db.rollback(() => {
              res.status(404).json({ message: "Customer not found" });
            });
          }

          // Commit transaction
          db.commit((commitErr) => {
            if (commitErr) {
              return db.rollback(() => {
                res.status(500).json({ message: "Error committing transaction" });
              });
            }

            res.json({ message: "Customer and all related data deleted successfully" });
          });
        });
      });
    });
  });
});

// ========================
// GET ALL CUSTOMERS
// ========================
router.get("/", (req, res) => {
  const sql = `
    SELECT * FROM customers
    ORDER BY fullName
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ 
        message: "Error fetching customers", 
        error: err.message 
      });
    }

    res.json(results);
  });
});


// ========================
// GET CUSTOMER BY ID
// ========================
router.get("/:customerId", (req, res) => {
  const { customerId } = req.params;

  const sql = `SELECT * FROM customers WHERE customerId = ?`;

  db.query(sql, [customerId], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ 
        message: "Error fetching customer", 
        error: err.message 
      });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.json(results[0]);
  });
});


export default router;