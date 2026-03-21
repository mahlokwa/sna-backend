import express from "express";
import bcrypt from "bcrypt";
import db from "../db/connection.js";

const router = express.Router();

// Admin verification code (store this securely in environment variables)
const ADMIN_CODE = "staff360"; // Change this!

// ========================
// Staff Registration
// ========================
router.post("/register", async (req, res) => {
  const { fullName, role, email, phoneNumber, username, password, adminCode } = req.body;

  // Verify admin code
  if (adminCode !== ADMIN_CODE) {
    return res.status(403).json({ message: "Invalid admin code" });
  }

  // ✅ Extra validation for employer role
  if (role === 'employer') {
    const checkSql = `SELECT COUNT(*) as count FROM staff WHERE role = 'employer'`;
    
    const employerCheck = await new Promise((resolve, reject) => {
      db.query(checkSql, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // Optional: Limit to only 2 employers
    if (employerCheck[0].count >= 2) {
      return res.status(403).json({ 
        message: "Maximum number of employers reached. Contact system administrator." 
      });
    }
  }

  // Check if username already exists
  const checkUserSql = `SELECT * FROM staff WHERE username = ?`;
  db.query(checkUserSql, [username], async (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (results.length > 0) {
      return res.status(400).json({ message: "Username already exists" });
    }

    // Check if email already exists
    const checkEmailSql = `SELECT * FROM staff WHERE email = ?`;
    db.query(checkEmailSql, [email], async (err, emailResults) => {
      if (err) {
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (emailResults.length > 0) {
        return res.status(400).json({ message: "Email already registered" });
      }

      try {
        // Hash the password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insert new staff member
        const insertSql = `
          INSERT INTO staff (fullName, role, email, phoneNumber, username, passwordHash)
          VALUES (?, ?, ?, ?, ?, ?)
        `;

        db.query(
          insertSql,
          [fullName, role, email, phoneNumber, username, passwordHash],
          (err, result) => {
            if (err) {
              return res.status(500).json({ message: "Registration failed", error: err });
            }

            res.status(201).json({
              message: "Employee registered successfully",
              staffId: result.insertId
            });
          }
        );
      } catch (error) {
        res.status(500).json({ message: "Error hashing password", error });
      }
    });
  });
});

// ========================
// Staff Login
// ========================
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  const sql = `SELECT * FROM staff WHERE username = ?`;
  db.query(sql, [username], async (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const staff = results[0];

    try {
      const match = await bcrypt.compare(password, staff.passwordHash);
      if (!match) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Login successful
      res.json({
        message: "Login successful",
        staffId: staff.staffId,
        fullName: staff.fullName,
        role: staff.role,
        email: staff.email,
        phoneNumber: staff.phoneNumber
      });
    } catch (error) {
      res.status(500).json({ message: "Error verifying password", error });
    }
  });
});

// ========================
// Get all staff members (for employer dashboard)
// ========================
router.get("/all", (req, res) => {
  const sql = `
    SELECT 
      staffId,
      fullName,
      username,
      phoneNumber,
      email,
      role,
      createdAt
    FROM staff
    ORDER BY createdAt DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// ========================
// Update staff role
// ========================
router.put("/update-role/:staffId", (req, res) => {
  const { staffId } = req.params;
  const { role } = req.body;

  if (!['instructor', 'employer'].includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  const sql = `UPDATE staff SET role = ? WHERE staffId = ?`;

  db.query(sql, [role, staffId], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Database error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    res.json({ message: "Role updated successfully" });
  });
});

// ========================
// Delete staff member
// ========================
router.delete("/delete/:staffId", (req, res) => {
  const { staffId } = req.params;

  // Check if staff has any bookings or payments
  const checkSql = `
    SELECT COUNT(*) as count
    FROM bookings
    WHERE instructorId = ?
  `;

  db.query(checkSql, [staffId], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error" });
    }

    if (results[0].count > 0) {
      return res.status(400).json({ 
        message: "Cannot delete staff member with existing bookings" 
      });
    }

    // Delete staff
    const deleteSql = `DELETE FROM staff WHERE staffId = ?`;

    db.query(deleteSql, [staffId], (deleteErr, result) => {
      if (deleteErr) {
        return res.status(500).json({ message: "Database error" });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Staff member not found" });
      }

      res.json({ message: "Staff member deleted successfully" });
    });
  });
});

export default router;