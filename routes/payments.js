import express from "express";
import db from "../db/connection.js";

const router = express.Router();

// ========================
// Record Payment
// ========================
router.post("/record", (req, res) => {
  const {
    customerId,
    packageDescription,
    amountPaid,
    amountTowardLessons,    // ← ADD THIS
    amountTowardLearners,   // ← ADD THIS
    amountOwing,
    notes,
    recordedBy,
    staffId
  } = req.body;

  // Validation
  if (!customerId || !packageDescription || !amountPaid || !recordedBy) {
    return res.status(400).json({ 
      message: "Missing required fields: customerId, packageDescription, amountPaid, recordedBy" 
    });
  }

  const sql = `
    INSERT INTO payments 
    (customerId, packageDescription, amountPaid, amountTowardLessons, amountTowardLearners, amountOwing, notes, recordedBy, paymentDate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `;  // ← ADDED amountTowardLessons and amountTowardLearners

  db.query(
    sql,
    [
      customerId,
      packageDescription,
      parseFloat(amountPaid),
      parseFloat(amountTowardLessons) || 0,    // ← ADD THIS
      parseFloat(amountTowardLearners) || 0,   // ← ADD THIS
      parseFloat(amountOwing) || 0,
      notes || null,
      recordedBy
    ],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ 
          message: "Error recording payment", 
          error: err.message 
        });
      }

      res.status(201).json({
        message: "Payment recorded successfully",
        paymentId: result.insertId
      });
    }
  );
});

// ========================
// Get Recent Payments
// ========================
router.get("/recent", (req, res) => {
  const sql = `
    SELECT 
      p.paymentId,
      p.packageDescription,
      p.amountPaid,
      p.amountOwing,
      p.paymentDate,
      p.recordedBy,
      p.notes,
      c.fullName as customerName,
      c.phoneNumber
    FROM payments p
    JOIN customers c ON p.customerId = c.customerId
    ORDER BY p.paymentDate DESC
    LIMIT 10
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ 
        message: "Error fetching payments", 
        error: err.message 
      });
    }

    res.json(results);
  });
});

// ========================
// Get Payments by Customer
// ========================
router.get("/customer/:customerId", (req, res) => {
  const { customerId } = req.params;

  const sql = `
    SELECT 
      p.*,
      c.fullName as customerName
    FROM payments p
    JOIN customers c ON p.customerId = c.customerId
    WHERE p.customerId = ?
    ORDER BY p.paymentDate DESC
  `;

  db.query(sql, [customerId], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ 
        message: "Error fetching customer payments", 
        error: err.message 
      });
    }

    res.json(results);
  });
});

// Get all payments (for employer dashboard)
router.get("/all", (req, res) => {
  const sql = `
    SELECT 
      p.*,
      c.fullName as customerName
    FROM payments p
    JOIN customers c ON p.customerId = c.customerId
    ORDER BY p.paymentDate DESC
    LIMIT 500
  `;

  db.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// ========================
// Get Payment by ID
// ========================
router.get("/:paymentId", (req, res) => {
  const { paymentId } = req.params;

  const sql = `
    SELECT 
      p.*,
      c.fullName as customerName,
      c.phoneNumber,
      c.email
    FROM payments p
    JOIN customers c ON p.customerId = c.customerId
    WHERE p.paymentId = ?
  `;

  db.query(sql, [paymentId], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ 
        message: "Error fetching payment", 
        error: err.message 
      });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.json(results[0]);
  });
});



export default router;